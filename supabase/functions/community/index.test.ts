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

interface Call {
  method: string;
  args: unknown[];
}

// A table's responses are a queue answered in order, or a function that
// answers by what was asked (for a table queried once per listed family).
type TableResponses = Resp[] | ((calls: Call[]) => Resp);

function makeFakeSupabase(opts: { userId: string | null; responses: Record<string, TableResponses> }) {
  const responses = opts.responses;
  const buildersByTable: Record<string, Any[]> = {};

  function nextResponse(table: string, calls: Call[]): Resp {
    const queue = responses[table];
    if (typeof queue === "function") return queue(calls);
    if (!queue || queue.length === 0) {
      throw new Error(`No fake response queued for table "${table}"`);
    }
    return queue.shift()!;
  }

  function builder(table: string): Any {
    const calls: Call[] = [];
    const chain: Any = { calls };
    for (const m of ["select", "eq", "neq", "order", "limit", "gte", "lte", "not", "maybeSingle"]) {
      chain[m] = (...args: unknown[]) => {
        calls.push({ method: m, args });
        return chain;
      };
    }
    chain.then = (resolve: (v: unknown) => void) => resolve(nextResponse(table, calls));
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

// search-browse-directory: the row shape below is the contract shared with
// search/index.ts (see _shared/familyListing.ts for the start format).
const FAMILY_OTHER = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const SLOT_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

function family(id: string, city: string, state: string) {
  return { id, user_id: "u-2", name: "Lee", bio: "", avatar_url: null, updated_at: "t", city, state };
}

interface SlotFixture {
  id: string;
  family_id: string;
  date: string;
  start_time: string;
}

function familyScope(calls: Call[]): unknown {
  return calls.find((c) => c.method === "eq" && c.args[0] === "family_id")?.args[1];
}

// Slots are looked up one family at a time. Each availability_slots query
// gets only the rows of the family it was scoped to with `eq family_id`,
// which is what that filter does in Postgres.
function directorySupabase(slots: SlotFixture[]) {
  return makeFakeSupabase({
    userId: "u-1",
    responses: {
      blocks: [{ data: [], error: null }],
      families: [{ data: [family(FAMILY_VISIBLE, "Austin", "TX"), family(FAMILY_OTHER, "", "")], error: null }],
      availability_slots: (calls) => ({ data: slots.filter((s) => s.family_id === familyScope(calls)), error: null }),
    },
  });
}

Deno.test("returns city and state on every family row", async () => {
  const supabase = directorySupabase([]);
  const body = await (await handleRequest(req("/recent"), supabase)).json();
  assertEquals(body.map((f: Any) => [f.city, f.state]), [["Austin", "TX"], ["", ""]]);
});

Deno.test("returns the next free slot's id and start for a family that has one", async () => {
  const supabase = directorySupabase([
    { id: SLOT_ID, family_id: FAMILY_VISIBLE, date: "2099-01-05", start_time: "10:00" },
  ]);
  const body = await (await handleRequest(req("/recent"), supabase)).json();
  assertEquals(
    { nextFreeSlotId: body[0].nextFreeSlotId, nextFreeSlotStart: body[0].nextFreeSlotStart },
    { nextFreeSlotId: SLOT_ID, nextFreeSlotStart: "2099-01-05T10:00:00" },
  );
});

Deno.test("returns null for both slot fields on a family with no future free slot", async () => {
  const supabase = directorySupabase([
    { id: SLOT_ID, family_id: FAMILY_VISIBLE, date: "2099-01-05", start_time: "10:00" },
  ]);
  const body = await (await handleRequest(req("/recent"), supabase)).json();
  assertEquals(
    { nextFreeSlotId: body[1].nextFreeSlotId, nextFreeSlotStart: body[1].nextFreeSlotStart },
    { nextFreeSlotId: null, nextFreeSlotStart: null },
  );
});

Deno.test("looks up slots with exactly one availability_slots query per listed family, scoped to that family", async () => {
  const supabase = directorySupabase([]);
  await handleRequest(req("/recent"), supabase);
  const scopes = supabase.buildersByTable["availability_slots"].map((b: Any) => familyScope(b.calls));
  assertEquals(scopes, [FAMILY_VISIBLE, FAMILY_OTHER]);
});

// `?now=` is the caller's own wall clock, in the same floating format as
// nextFreeSlotStart. See _shared/familyListing.ts.
const NOW_PARAM = "now=2099-01-05T09:00:00";
const PAST_TODAY = { id: "past-today", family_id: FAMILY_VISIBLE, date: "2099-01-05", start_time: "08:00" };
const TOMORROW = { id: SLOT_ID, family_id: FAMILY_VISIBLE, date: "2099-01-06", start_time: "10:00" };

async function firstRowSlot(path: string, slots: SlotFixture[]) {
  const body = await (await handleRequest(req(path), directorySupabase(slots))).json();
  return [body[0].nextFreeSlotId, body[0].nextFreeSlotStart];
}

Deno.test("with ?now=, skips a slot that already started today and returns tomorrow's", async () => {
  const found = await firstRowSlot(`/recent?${NOW_PARAM}`, [PAST_TODAY, TOMORROW]);
  assertEquals(found, [SLOT_ID, "2099-01-06T10:00:00"]);
});

Deno.test("with ?now=, returns null for both slot fields when the only slot already started", async () => {
  const found = await firstRowSlot(`/recent?${NOW_PARAM}`, [PAST_TODAY]);
  assertEquals(found, [null, null]);
});

Deno.test("with ?now=, asks for slots from the caller's date", async () => {
  const supabase = directorySupabase([]);
  await handleRequest(req(`/recent?${NOW_PARAM}`), supabase);
  const gte = supabase.buildersByTable["availability_slots"][0].calls.find((c: Any) => c.method === "gte");
  assertEquals(gte.args, ["date", "2099-01-05"]);
});

Deno.test("a malformed ?now= is ignored, not rejected: same rows as with no now at all", async () => {
  const found = await firstRowSlot("/recent?now=2099-01-05T09:00:00Z", [PAST_TODAY, TOMORROW]);
  assertEquals(found, ["past-today", "2099-01-05T08:00:00"]);
});

Deno.test("without ?now=, a slot earlier in the day is still returned", async () => {
  const found = await firstRowSlot("/recent", [PAST_TODAY, TOMORROW]);
  assertEquals(found, ["past-today", "2099-01-05T08:00:00"]);
});

// `?limit=` is untrusted: what reaches the families query is bounded here,
// which in turn bounds how many slot queries one request can cause.
async function familiesLimit(query: string) {
  const supabase = makeFakeSupabase({
    userId: "u-1",
    responses: { blocks: [{ data: [], error: null }], families: [{ data: [], error: null }] },
  });
  await handleRequest(req(`/recent${query}`), supabase);
  return supabase.buildersByTable["families"][0].calls.find((c: Any) => c.method === "limit").args[0];
}

Deno.test("clamps a limit above the maximum to 50", async () => {
  assertEquals(await familiesLimit("?limit=100000"), 50);
});

Deno.test("uses the default of 12 for a limit of 0, -5, 1.5, abc or empty", async () => {
  const used = [];
  for (const raw of ["0", "-5", "1.5", "abc", ""]) used.push(await familiesLimit(`?limit=${raw}`));
  assertEquals(used, [12, 12, 12, 12, 12]);
});

Deno.test("passes a limit within range through unchanged", async () => {
  assertEquals(await familiesLimit("?limit=30"), 30);
});

// Added by qa-engineer for search-browse-directory: what the directory page
// relies on and no test above pins.
function familiesCall(supabase: Any, method: string) {
  return supabase.buildersByTable["families"][0].calls.find((c: Any) => c.method === method);
}

// `:` percent-encoded, as a browser's URLSearchParams sends it.
const PAGE_REQUEST = "/recent?limit=50&now=2099-01-05T09%3A00%3A00";

const ROW_KEYS = [
  "avatarUrl",
  "bio",
  "city",
  "id",
  "isOwner",
  "kidCount",
  "name",
  "nextFreeSlotId",
  "nextFreeSlotStart",
  "ownerId",
  "state",
  "updatedAt",
];

Deno.test("lists families newest first by updated_at", async () => {
  const supabase = directorySupabase([]);
  await handleRequest(req("/recent"), supabase);
  assertEquals(familiesCall(supabase, "order").args, ["updated_at", { ascending: false }]);
});

Deno.test("leaves the caller's own family out of the listing", async () => {
  const supabase = directorySupabase([]);
  await handleRequest(req("/recent"), supabase);
  assertEquals(familiesCall(supabase, "neq").args, ["user_id", "u-1"]);
});

Deno.test("uses the default of 12 when no limit is sent at all", async () => {
  assertEquals(await familiesLimit(""), 12);
});

Deno.test("every row carries the eight FamilyDTO keys and the four new ones", async () => {
  const body = await (await handleRequest(req("/recent"), directorySupabase([]))).json();
  assertEquals(body.map((row: Any) => Object.keys(row).sort()), [ROW_KEYS, ROW_KEYS]);
});

Deno.test("never exposes kidCount and marks no row as the caller's own", async () => {
  const supabase = makeFakeSupabase({
    userId: "u-1",
    responses: {
      blocks: [{ data: [], error: null }],
      families: [{ data: [{ ...family(FAMILY_VISIBLE, "Austin", "TX"), kid_count: 3 }], error: null }],
      availability_slots: () => ({ data: [], error: null }),
    },
  });
  const body = await (await handleRequest(req("/recent"), supabase)).json();
  assertEquals([body[0].kidCount, body[0].isOwner], [null, false]);
});

Deno.test("reads a percent-encoded now, which is how a browser sends it", async () => {
  const found = await firstRowSlot(PAGE_REQUEST, [PAST_TODAY, TOMORROW]);
  assertEquals(found, [SLOT_ID, "2099-01-06T10:00:00"]);
});

Deno.test("the request the directory page sends still excludes blocked families", async () => {
  const supabase = makeFakeSupabase({
    userId: "u-1",
    responses: {
      blocks: [{ data: [{ blocked_family_id: FAMILY_BLOCKED }], error: null }],
      families: [{ data: [family(FAMILY_VISIBLE, "Austin", "TX")], error: null }],
      availability_slots: () => ({ data: [], error: null }),
    },
  });
  await handleRequest(req(PAGE_REQUEST), supabase);
  assertEquals(familiesCall(supabase, "not").args, ["id", "in", `(${FAMILY_BLOCKED})`]);
});

Deno.test("the request the directory page sends asks for 50 families", async () => {
  const supabase = directorySupabase([]);
  await handleRequest(req(PAGE_REQUEST), supabase);
  assertEquals(familiesCall(supabase, "limit").args, [50]);
});

Deno.test("still returns the families, with null slot fields, when a slot lookup fails", async () => {
  const supabase = makeFakeSupabase({
    userId: "u-1",
    responses: {
      blocks: [{ data: [], error: null }],
      families: [{ data: [family(FAMILY_VISIBLE, "Austin", "TX")], error: null }],
      availability_slots: () => ({ data: null, error: { message: "boom" } }),
    },
  });
  const res = await handleRequest(req("/recent"), supabase);
  const body = await res.json();
  assertEquals([res.status, body[0].id, body[0].nextFreeSlotId, body[0].nextFreeSlotStart], [200, FAMILY_VISIBLE, null, null]);
});

Deno.test("returns 500 when the families query fails, which is what puts the page in its error state", async () => {
  const supabase = makeFakeSupabase({
    userId: "u-1",
    responses: { blocks: [{ data: [], error: null }], families: [{ data: null, error: { message: "boom" } }] },
  });
  const res = await handleRequest(req("/recent"), supabase);
  assertEquals(res.status, 500);
});
