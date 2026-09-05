// Unit tests for handleRequest's block-aware exclusion (see this feature's
// dispatch contract D: filtering must be server-side, never client-side
// only). No network/Postgres, same caveat as admin/index.test.ts and
// moderation/index.test.ts: real RLS/PostgREST filter-string behavior is
// reviewed manually, not exercised here. What IS covered: the exclusion
// query is actually issued with the caller's own blocked family ids when
// any exist, and is skipped entirely (no .not(...) call at all) when the
// caller has no blocks, so a family with zero blocks pays zero extra query
// cost/risk.
import { assertEquals, assertExists } from "jsr:@std/assert@1";
import { handleRequest } from "./index.ts";
// deno-lint-ignore no-explicit-any
type Any = any;

interface Resp {
  data: unknown;
  error: unknown;
}

function makeFakeSupabase(opts: { userId: string | null; responses: Record<string, Resp[]> }) {
  const responses = opts.responses;
  const buildersByTable: Record<string, Any[]> = {};

  function nextResponse(table: string): Resp {
    const queue = responses[table];
    if (!queue || queue.length === 0) {
      throw new Error(`No fake response queued for table "${table}"`);
    }
    return queue.shift()!;
  }

  function builder(table: string): Any {
    const calls: { method: string; args: unknown[] }[] = [];
    const chain: Any = { calls };
    for (const m of ["select", "eq", "neq", "order", "limit", "gte", "not", "maybeSingle"]) {
      chain[m] = (...args: unknown[]) => {
        calls.push({ method: m, args });
        return chain;
      };
    }
    chain.then = (resolve: (v: unknown) => void) => resolve(nextResponse(table));
    (buildersByTable[table] ??= []).push(chain);
    return chain;
  }

  const fake: Any = {
    auth: { getUser: () => Promise.resolve({ data: { user: opts.userId ? { id: opts.userId } : null } }) },
    from: (table: string) => builder(table),
    buildersByTable,
  };
  return fake;
}

function req(path: string): Request {
  return new Request(`https://x.supabase.co/community${path}`, { method: "GET" });
}

const FAMILY_BLOCKED = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const FAMILY_VISIBLE = "cccccccc-cccc-cccc-cccc-cccccccccccc";

Deno.test("returns 401 when unauthenticated", async () => {
  const supabase = makeFakeSupabase({ userId: null, responses: {} });
  const res = await handleRequest(req("/recent"), supabase);
  assertEquals(res.status, 401);
});

Deno.test("non-GET returns 404", async () => {
  const supabase = makeFakeSupabase({ userId: "u-1", responses: {} });
  const res = await handleRequest(new Request("https://x.supabase.co/community/recent", { method: "POST" }), supabase);
  assertEquals(res.status, 404);
});

Deno.test("excludes families the caller has blocked, with the exact blocked ids in the filter", async () => {
  const supabase = makeFakeSupabase({
    userId: "u-1",
    responses: {
      blocks: [{ data: [{ blocked_family_id: FAMILY_BLOCKED }], error: null }],
      families: [{
        data: [{ id: FAMILY_VISIBLE, user_id: "u-2", name: "Lee", bio: "", avatar_url: null, updated_at: "t", city: "", state: "" }],
        error: null,
      }],
      availability_slots: [{ data: null, error: null }],
    },
  });
  const res = await handleRequest(req("/recent"), supabase);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.length, 1);
  assertEquals(body[0].id, FAMILY_VISIBLE);

  const familiesCalls = supabase.buildersByTable["families"][0].calls;
  const notCall = familiesCalls.find((c: Any) => c.method === "not");
  assertExists(notCall);
  assertEquals(notCall.args, ["id", "in", `(${FAMILY_BLOCKED})`]);
});

Deno.test("skips the exclusion filter entirely when the caller has no blocks", async () => {
  const supabase = makeFakeSupabase({
    userId: "u-1",
    responses: {
      blocks: [{ data: [], error: null }],
      families: [{
        data: [{ id: FAMILY_VISIBLE, user_id: "u-2", name: "Lee", bio: "", avatar_url: null, updated_at: "t", city: "", state: "" }],
        error: null,
      }],
      availability_slots: [{ data: null, error: null }],
    },
  });
  const res = await handleRequest(req("/recent"), supabase);
  assertEquals(res.status, 200);

  const familiesCalls = supabase.buildersByTable["families"][0].calls;
  assertEquals(familiesCalls.some((c: Any) => c.method === "not"), false);
});

Deno.test("never queries blocks for a table other than blocked_family_id (no over-fetching)", async () => {
  // Documents that this endpoint only ever asks blocks for the column it
  // needs -- if community/index.ts started selecting e.g. "*" here, this
  // test's fake response shape (which only supplies blocked_family_id)
  // would still pass, but the select-call assertion below pins the exact
  // column requested so a drift shows up as a real diff, not silently.
  const supabase = makeFakeSupabase({
    userId: "u-1",
    responses: {
      blocks: [{ data: [], error: null }],
      families: [{ data: [], error: null }],
    },
  });
  await handleRequest(req("/recent"), supabase);
  const blocksCalls = supabase.buildersByTable["blocks"][0].calls;
  assertEquals(blocksCalls[0], { method: "select", args: ["blocked_family_id"] });
});
