// Unit tests for handleRequest's block-aware exclusion. Same scope note as
// community/index.test.ts: no network/Postgres, real RLS/PostgREST filter
// behavior is reviewed manually. What IS covered: the exclusion query uses
// the caller's own blocked family ids when any exist, is skipped when the
// caller has none, and -- specific to this endpoint, since search has no
// auth requirement -- is skipped without even querying `blocks` when there
// is no authenticated viewer at all.
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
    for (const m of ["select", "or", "limit", "not"]) {
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
  return new Request(`https://x.supabase.co/search${path}`, { method: "GET" });
}

const FAMILY_BLOCKED = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const FAMILY_VISIBLE = "cccccccc-cccc-cccc-cccc-cccccccccccc";

Deno.test("non-GET returns 404", async () => {
  const supabase = makeFakeSupabase({ userId: null, responses: {} });
  const res = await handleRequest(new Request("https://x.supabase.co/search/families", { method: "POST" }), supabase);
  assertEquals(res.status, 404);
});

Deno.test("an unauthenticated viewer skips blocks entirely -- no query issued at all", async () => {
  const supabase = makeFakeSupabase({
    userId: null,
    responses: { families: [{ data: [], error: null }] },
  });
  const res = await handleRequest(req("/families?q=lee"), supabase);
  assertEquals(res.status, 200);
  assertEquals(supabase.buildersByTable["blocks"], undefined);
});

Deno.test("excludes families the viewer has blocked, with the exact blocked ids in the filter", async () => {
  const supabase = makeFakeSupabase({
    userId: "u-1",
    responses: {
      blocks: [{ data: [{ blocked_family_id: FAMILY_BLOCKED }], error: null }],
      families: [{
        data: [{ id: FAMILY_VISIBLE, user_id: "u-2", name: "Lee", bio: "", avatar_url: null, updated_at: "t" }],
        error: null,
      }],
    },
  });
  const res = await handleRequest(req("/families?q=lee"), supabase);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.length, 1);
  assertEquals(body[0].id, FAMILY_VISIBLE);

  const familiesCalls = supabase.buildersByTable["families"][0].calls;
  const notCall = familiesCalls.find((c: Any) => c.method === "not");
  assertExists(notCall);
  assertEquals(notCall.args, ["id", "in", `(${FAMILY_BLOCKED})`]);
});

Deno.test("skips the exclusion filter entirely when the viewer has no blocks", async () => {
  const supabase = makeFakeSupabase({
    userId: "u-1",
    responses: {
      blocks: [{ data: [], error: null }],
      families: [{ data: [], error: null }],
    },
  });
  await handleRequest(req("/families?q=lee"), supabase);
  const familiesCalls = supabase.buildersByTable["families"][0].calls;
  assertEquals(familiesCalls.some((c: Any) => c.method === "not"), false);
});
