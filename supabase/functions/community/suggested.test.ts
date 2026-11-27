// GET /community/suggested: the "Families to say hi to" rail on /messages
// (fofafu_vault/features/messages-two-pane.md). No network/Postgres: the
// fake below answers each table the way Postgres + RLS would for the filters
// the handler sends (neq/not/limit on families, the caller's own rows on
// messages, one family's rows per availability_slots query), and separate
// tests pin the exact filters so a drift in what is sent shows up too.
import { assertEquals } from "jsr:@std/assert@1";
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

type Responder = (calls: Call[]) => Resp;

function makeFake(userId: string | null, responders: Record<string, Responder>) {
  const buildersByTable: Record<string, Any[]> = {};
  function builder(table: string): Any {
    const calls: Call[] = [];
    const chain: Any = { calls };
    for (const m of ["select", "eq", "neq", "order", "limit", "gte", "lte", "not", "or", "in", "maybeSingle"]) {
      chain[m] = (...args: unknown[]) => {
        calls.push({ method: m, args });
        return chain;
      };
    }
    chain.then = (resolve: (v: unknown) => void) => {
      const responder = responders[table];
      if (!responder) throw new Error(`No fake responder for table "${table}"`);
      resolve(responder(calls));
    };
    (buildersByTable[table] ??= []).push(chain);
    return chain;
  }
  const fake: Any = {
    auth: { getUser: () => Promise.resolve({ data: { user: userId ? { id: userId } : null } }) },
    from: (table: string) => builder(table),
    buildersByTable,
  };
  return fake;
}

const ME = "10000000-0000-4000-8000-000000000000";
const MY_FAMILY = "f0000000-0000-4000-8000-000000000000";

function familyId(n: number): string {
  return `f0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function ownerId(n: number): string {
  return `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

interface PoolRow {
  id: string;
  user_id: string;
  name: string;
  bio: string;
  kid_count: number | null;
  avatar_url: string | null;
  updated_at: string;
  city: string;
  state: string;
}

// Family n, owned by user n, last updated on day `day` of Jan 2099 (higher =
// more recent). The pool fixture is listed newest first, as the query asks.
function fam(n: number, city: string, state: string, day = 1): PoolRow {
  const updated = `2099-01-${String(day).padStart(2, "0")}T00:00:00+00:00`;
  return {
    id: familyId(n),
    user_id: ownerId(n),
    name: `F${n}`,
    bio: "",
    kid_count: 2,
    avatar_url: null,
    updated_at: updated,
    city,
    state,
  };
}

interface Fixture {
  userId?: string | null;
  viewer?: { city: string; state: string } | null;
  pool?: PoolRow[];
  myBlocks?: string[];
  blockedBy?: string[];
  messages?: { sender_id: string; receiver_id: string }[];
  slots?: { id: string; family_id: string; date: string; start_time: string }[];
  fail?: { pool?: boolean; messages?: boolean; blockedBy?: boolean };
}

function argOf(calls: Call[], method: string, column: string): unknown[] | undefined {
  return calls.find((c) => c.method === method && c.args[0] === column)?.args;
}

// families: the viewer's own row for a maybeSingle() lookup, otherwise the
// pool with the handler's neq/not/limit applied.
function familiesResponder(f: Fixture): Responder {
  return (calls) => {
    if (calls.some((c) => c.method === "maybeSingle")) {
      const data = f.viewer ? { id: MY_FAMILY, city: f.viewer.city, state: f.viewer.state } : null;
      return { data, error: null };
    }
    if (f.fail?.pool) return { data: null, error: { message: "boom" } };
    let rows = [...(f.pool ?? [])];
    const neq = argOf(calls, "neq", "user_id");
    if (neq) rows = rows.filter((r) => r.user_id !== neq[1]);
    const not = argOf(calls, "not", "id");
    if (not) {
      const ids = String(not[2]).replace(/[()]/g, "").split(",");
      rows = rows.filter((r) => !ids.includes(r.id));
    }
    const limit = calls.find((c) => c.method === "limit")?.args[0];
    if (typeof limit === "number") rows = rows.slice(0, limit);
    return { data: rows, error: null };
  };
}

function setup(f: Fixture) {
  const userId = f.userId === undefined ? ME : f.userId;
  const supabase = makeFake(userId, {
    blocks: () => ({ data: (f.myBlocks ?? []).map((id) => ({ blocked_family_id: id })), error: null }),
    families: familiesResponder(f),
    // RLS hands the caller every message they sent or received.
    messages: () =>
      f.fail?.messages ? { data: null, error: { message: "boom" } } : { data: f.messages ?? [], error: null },
    availability_slots: (calls) => {
      const scope = argOf(calls, "eq", "family_id")?.[1];
      return { data: (f.slots ?? []).filter((s) => s.family_id === scope), error: null };
    },
  });
  const service = makeFake(null, {
    blocks: () =>
      f.fail?.blockedBy
        ? { data: null, error: { message: "boom" } }
        : { data: (f.blockedBy ?? []).map((id) => ({ blocker_family_id: id })), error: null },
  });
  let serviceCreated = 0;
  const serviceClient = () => {
    serviceCreated += 1;
    return service;
  };
  return { supabase, service, serviceClient, serviceCreated: () => serviceCreated };
}

function req(query = ""): Request {
  return new Request(`https://x.supabase.co/community/suggested${query}`, { method: "GET" });
}

async function suggest(f: Fixture, query = "") {
  const s = setup(f);
  const res = await handleRequest(req(query), s.supabase, s.serviceClient);
  return { res, body: res.status === 200 ? await res.json() : null, ...s };
}

async function ids(f: Fixture, query = "") {
  return (await suggest(f, query)).body.map((row: Any) => row.id);
}

async function reasons(f: Fixture, query = "") {
  return (await suggest(f, query)).body.map((row: Any) => [row.id, row.reason]);
}

// --- auth and method -------------------------------------------------------

Deno.test("suggested: returns 401 when unauthenticated", async () => {
  const { res } = await suggest({ userId: null });
  assertEquals(res.status, 401);
});

Deno.test("suggested: non-GET returns 404", async () => {
  const s = setup({});
  const post = new Request("https://x.supabase.co/community/suggested", { method: "POST" });
  assertEquals((await handleRequest(post, s.supabase, s.serviceClient)).status, 404);
});

// --- exclusions ------------------------------------------------------------

Deno.test("suggested: leaves the caller's own family out", async () => {
  const own = { ...fam(9, "Oakland", "CA"), id: MY_FAMILY, user_id: ME };
  assertEquals(await ids({ viewer: { city: "Oakland", state: "CA" }, pool: [own, fam(1, "", "")] }), [familyId(1)]);
});

Deno.test("suggested: asks for every family except the caller's own", async () => {
  const { supabase } = await suggest({ pool: [] });
  const poolCalls =
    supabase.buildersByTable["families"].find((b: Any) => !b.calls.some((c: Call) => c.method === "maybeSingle")).calls;
  assertEquals(argOf(poolCalls, "neq", "user_id"), ["user_id", ME]);
});

Deno.test("suggested: leaves out a family the caller has blocked", async () => {
  assertEquals(
    await ids({ viewer: { city: "", state: "" }, pool: [fam(1, "", ""), fam(2, "", "")], myBlocks: [familyId(1)] }),
    [familyId(2)],
  );
});

Deno.test("suggested: leaves out a family that has blocked the caller", async () => {
  assertEquals(
    await ids({ viewer: { city: "", state: "" }, pool: [fam(1, "", ""), fam(2, "", "")], blockedBy: [familyId(2)] }),
    [familyId(1)],
  );
});

Deno.test("suggested: looks up who blocked the caller by the caller's own family id only", async () => {
  const { service } = await suggest({ viewer: { city: "", state: "" }, pool: [] });
  const calls = service.buildersByTable["blocks"][0].calls;
  assertEquals([calls[0], argOf(calls, "eq", "blocked_family_id")], [
    { method: "select", args: ["blocker_family_id"] },
    ["blocked_family_id", MY_FAMILY],
  ]);
});

Deno.test("suggested: never creates the service client when the caller has no family", async () => {
  const s = await suggest({ viewer: null, pool: [fam(1, "", "")] });
  assertEquals(s.serviceCreated(), 0);
});

Deno.test("suggested: leaves out a family whose owner the caller has messaged", async () => {
  const pool = [fam(1, "", ""), fam(2, "", "")];
  assertEquals(await ids({ viewer: null, pool, messages: [{ sender_id: ME, receiver_id: ownerId(1) }] }), [
    familyId(2),
  ]);
});

Deno.test("suggested: leaves out a family whose owner has messaged the caller", async () => {
  const pool = [fam(1, "", ""), fam(2, "", "")];
  assertEquals(await ids({ viewer: null, pool, messages: [{ sender_id: ownerId(2), receiver_id: ME }] }), [
    familyId(1),
  ]);
});

Deno.test("suggested: asks messages only about the caller and the pool's owners, in both directions", async () => {
  const { supabase } = await suggest({ viewer: null, pool: [fam(1, "", ""), fam(2, "", "")] });
  const calls = supabase.buildersByTable["messages"][0].calls;
  const owners = `${ownerId(1)},${ownerId(2)}`;
  assertEquals(calls.find((c: Call) => c.method === "or").args, [
    `and(sender_id.eq.${ME},receiver_id.in.(${owners})),and(receiver_id.eq.${ME},sender_id.in.(${owners}))`,
  ]);
});

Deno.test("suggested: skips the messages query when the pool is empty", async () => {
  const { supabase } = await suggest({ viewer: null, pool: [] });
  assertEquals(supabase.buildersByTable["messages"], undefined);
});

// --- ranking and reason ----------------------------------------------------

const OAKLAND = { city: "Oakland", state: "CA" };

Deno.test("suggested: ranks same city first, then same state, then open slot, then the rest", async () => {
  const pool = [fam(1, "", "", 9), fam(2, "Austin", "TX", 8), fam(3, "Fresno", "CA", 7), fam(4, "Oakland", "CA", 6)];
  const slots = [{ id: "s2", family_id: familyId(2), date: "2099-02-01", start_time: "10:00" }];
  assertEquals(await reasons({ viewer: OAKLAND, pool, slots }, "?limit=3"), [
    [familyId(4), "same_city"],
    [familyId(3), "same_state"],
    [familyId(2), "open_slot"],
  ]);
});

Deno.test("suggested: gives reason recent to a family no other rule matches", async () => {
  assertEquals(await reasons({ viewer: OAKLAND, pool: [fam(1, "Austin", "TX")] }), [[familyId(1), "recent"]]);
});

Deno.test("suggested: matches city and state case-insensitively and ignoring surrounding spaces", async () => {
  const viewer = { city: "  oakland ", state: "ca " };
  assertEquals(await reasons({ viewer, pool: [fam(1, "OAKLAND", " CA")] }), [[familyId(1), "same_city"]]);
});

Deno.test("suggested: the same city name in another state is not same_city", async () => {
  assertEquals(await reasons({ viewer: { city: "Portland", state: "OR" }, pool: [fam(1, "Portland", "ME")] }), [[
    familyId(1),
    "recent",
  ]]);
});

Deno.test("suggested: a caller with no city or state never matches on location", async () => {
  assertEquals(await reasons({ viewer: { city: "", state: "" }, pool: [fam(1, "", "")] }), [[familyId(1), "recent"]]);
});

Deno.test("suggested: a caller with no family row never matches on location", async () => {
  assertEquals(await reasons({ viewer: null, pool: [fam(1, "Oakland", "CA")] }), [[familyId(1), "recent"]]);
});

Deno.test("suggested: a city match needs a state on both sides", async () => {
  assertEquals(await reasons({ viewer: { city: "Oakland", state: "" }, pool: [fam(1, "Oakland", "")] }), [[
    familyId(1),
    "recent",
  ]]);
});

Deno.test("suggested: within a location tier, a family with an open slot comes first", async () => {
  const pool = [fam(1, "Oakland", "CA", 9), fam(2, "Oakland", "CA", 1)];
  const slots = [{ id: "s2", family_id: familyId(2), date: "2099-02-01", start_time: "10:00" }];
  assertEquals(await ids({ viewer: OAKLAND, pool, slots }), [familyId(2), familyId(1)]);
});

Deno.test("suggested: breaks ties by most recently updated", async () => {
  const pool = [fam(1, "", "", 2), fam(2, "", "", 5), fam(3, "", "", 3)];
  assertEquals(await ids({ viewer: null, pool }), [familyId(2), familyId(3), familyId(1)]);
});

Deno.test("suggested: a slot that already started by the caller's now does not count as open", async () => {
  const slots = [{ id: "s1", family_id: familyId(1), date: "2099-01-05", start_time: "08:00" }];
  const found = await reasons({ viewer: null, pool: [fam(1, "", "")], slots }, "?now=2099-01-05T09%3A00%3A00");
  assertEquals(found, [[familyId(1), "recent"]]);
});

// --- limit, pool, shape, empty ---------------------------------------------

function pool(n: number): PoolRow[] {
  return Array.from({ length: n }, (_, i) => fam(i + 1, "", "", 28 - i));
}

Deno.test("suggested: returns 3 by default", async () => {
  assertEquals((await ids({ viewer: null, pool: pool(5) })).length, 3);
});

Deno.test("suggested: returns fewer when asked for fewer", async () => {
  assertEquals((await ids({ viewer: null, pool: pool(5) }, "?limit=1")).length, 1);
});

Deno.test("suggested: clamps a limit above 3 to 3", async () => {
  assertEquals((await ids({ viewer: null, pool: pool(5) }, "?limit=40")).length, 3);
});

Deno.test("suggested: uses the default of 3 for a limit of 0, -1, abc or 1.5", async () => {
  const counts = [];
  for (const raw of ["0", "-1", "abc", "1.5"]) {
    counts.push((await ids({ viewer: null, pool: pool(5) }, `?limit=${raw}`)).length);
  }
  assertEquals(counts, [3, 3, 3, 3]);
});

Deno.test("suggested: draws from a pool of at most 50 families, newest first", async () => {
  const { supabase } = await suggest({ viewer: null, pool: [] });
  const poolCalls =
    supabase.buildersByTable["families"].find((b: Any) => !b.calls.some((c: Call) => c.method === "maybeSingle")).calls;
  assertEquals(
    [poolCalls.find((c: Call) => c.method === "order").args, poolCalls.find((c: Call) => c.method === "limit").args],
    [["updated_at", { ascending: false }], [50]],
  );
});

Deno.test("suggested: looks up slots only for families that survive the exclusions", async () => {
  const pool = [fam(1, "", ""), fam(2, "", "")];
  const { supabase } = await suggest({ viewer: null, pool, messages: [{ sender_id: ME, receiver_id: ownerId(1) }] });
  const scopes = supabase.buildersByTable["availability_slots"].map((b: Any) => argOf(b.calls, "eq", "family_id")?.[1]);
  assertEquals(scopes, [familyId(2)]);
});

Deno.test("suggested: returns an empty array when no family qualifies", async () => {
  const pool = [fam(1, "", "")];
  const { res, body } = await suggest({ viewer: null, pool, messages: [{ sender_id: ME, receiver_id: ownerId(1) }] });
  assertEquals([res.status, body], [200, []]);
});

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
  "reason",
  "state",
  "updatedAt",
];

Deno.test("suggested: every row has the /community/recent shape plus reason", async () => {
  const { body } = await suggest({ viewer: null, pool: [fam(1, "", "")] });
  assertEquals(Object.keys(body[0]).sort(), ROW_KEYS);
});

Deno.test("suggested: never exposes kidCount and marks no row as the caller's own", async () => {
  const { body } = await suggest({ viewer: null, pool: [fam(1, "", "")] });
  assertEquals([body[0].kidCount, body[0].isOwner], [null, false]);
});

Deno.test("suggested: carries the open slot's id and start on the row", async () => {
  const slots = [{ id: "s1", family_id: familyId(1), date: "2099-02-01", start_time: "10:00" }];
  const { body } = await suggest({ viewer: null, pool: [fam(1, "", "")], slots });
  assertEquals([body[0].nextFreeSlotId, body[0].nextFreeSlotStart], ["s1", "2099-02-01T10:00:00"]);
});

// --- failures fail closed --------------------------------------------------

Deno.test("suggested: returns 500 when the families query fails", async () => {
  assertEquals((await suggest({ viewer: null, fail: { pool: true } })).res.status, 500);
});

Deno.test("suggested: returns 500 rather than risk suggesting an existing thread when messages fails", async () => {
  assertEquals((await suggest({ viewer: null, pool: [fam(1, "", "")], fail: { messages: true } })).res.status, 500);
});

Deno.test("suggested: returns 500 rather than risk suggesting a blocker when that lookup fails", async () => {
  assertEquals((await suggest({ viewer: OAKLAND, pool: [fam(1, "", "")], fail: { blockedBy: true } })).res.status, 500);
});

// --- /recent is untouched --------------------------------------------------

Deno.test("recent: never creates the service client", async () => {
  const s = setup({ viewer: OAKLAND, pool: [fam(1, "", "")] });
  await handleRequest(new Request("https://x.supabase.co/community/recent"), s.supabase, s.serviceClient);
  assertEquals(s.serviceCreated(), 0);
});
