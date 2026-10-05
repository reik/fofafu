// Unit tests for the family-listing row and next-free-slot lookup shared by
// community/index.ts and search/index.ts. Same scope note as those
// functions' own tests: a fake SupabaseClient, no network/Postgres, so real
// PostgREST filter behavior is reviewed manually. What IS covered: the exact
// query issued, the one-bounded-query-per-family shape and how many of those
// are in flight at once, the earliest-slot pick, the `nextFreeSlotStart` wire
// format the frontend parses with `new Date()`, and the row shape both
// endpoints return.
import { assertEquals } from "jsr:@std/assert@1";
import {
  composeSlotStart,
  MAX_FAMILIES,
  nextFreeSlotsByFamily,
  parseLimit,
  parseLocalNow,
  SLOT_LOOKUP_CONCURRENCY,
  toListedFamily,
} from "./familyListing.ts";
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

type Responder = (calls: Call[]) => Resp | Promise<Resp>;

function later(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

// `responses` is either a queue answered in order (enough for one family), or
// a function that answers by what was asked. The function form is for tests
// with several families, where queue order would be an accident of
// scheduling.
//
// A query counts as in flight from the moment it is awaited until it is
// answered, and it is answered on a later task, as a real round trip would
// be. Queries started together are therefore in flight together, and
// `peakInFlight` is the most that ever overlapped.
//
// The chain has no `in` method on purpose: a query spanning several families
// is the one thing this lookup must not issue, and it would throw here.
function makeFakeSupabase(responses: Resp[] | Responder) {
  const builders: Any[] = [];
  const fake: Any = { builders, inFlight: 0, peakInFlight: 0 };
  const answer = (calls: Call[]) => {
    const next = typeof responses === "function" ? responses(calls) : responses.shift();
    if (!next) throw new Error("No fake response queued");
    return next;
  };
  fake.from = (table: string) => {
    const calls: Call[] = [];
    const chain: Any = { table, calls };
    for (const m of ["select", "eq", "gte", "lte", "order", "limit"]) {
      chain[m] = (...args: unknown[]) => {
        calls.push({ method: m, args });
        return chain;
      };
    }
    chain.then = (resolve: (v: Resp) => void, reject: (e: unknown) => void) => {
      fake.inFlight += 1;
      fake.peakInFlight = Math.max(fake.peakInFlight, fake.inFlight);
      later(0).then(() => answer(calls)).finally(() => (fake.inFlight -= 1)).then(resolve, reject);
    };
    builders.push(chain);
    return chain;
  };
  return fake;
}

function familyOf(calls: Call[]): string | undefined {
  return calls.find((c) => c.method === "eq" && c.args[0] === "family_id")?.args[1] as string | undefined;
}

// Each family's own answer, given only to the query scoped to that family
// with `eq family_id`, which is what that filter does in Postgres. A family
// with no entry has no rows. A query not scoped to one family is refused.
function perFamilySupabase(own: Record<string, Resp>) {
  return makeFakeSupabase((calls) => {
    const family = familyOf(calls);
    if (!family) throw new Error("Slot query is not scoped to a single family");
    return own[family] ?? { data: [], error: null };
  });
}

function queriedFamilies(supabase: Any): (string | undefined)[] {
  return supabase.builders.map((b: Any) => familyOf(b.calls));
}

const FAMILY_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const FAMILY_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const FAMILY_C = "cccccccc-cccc-cccc-cccc-cccccccccccc";
// The server's clock, used only when the caller sends no usable `now`.
const SERVER_NOW = new Date("2026-10-03T20:45:00Z");
// The caller's own wall clock, in the same floating format as slot starts.
const LOCAL_NOW = "2026-10-03T12:00:00";

function slot(id: string, familyId: string, date: string, startTime: string) {
  return { id, family_id: familyId, date, start_time: startTime };
}

Deno.test("composeSlotStart joins date and HH:MM into an offset-less ISO 8601 local date-time", () => {
  assertEquals(composeSlotStart("2026-10-06", "10:00"), "2026-10-06T10:00:00");
});

Deno.test("composeSlotStart zero-pads a single-digit hour", () => {
  assertEquals(composeSlotStart("2026-10-06", "9:30"), "2026-10-06T09:30:00");
});

Deno.test("composeSlotStart keeps seconds when the stored time has them", () => {
  assertEquals(composeSlotStart("2026-10-06", "14:05:30"), "2026-10-06T14:05:30");
});

Deno.test("composeSlotStart returns null for a time that is not a clock time", () => {
  assertEquals(composeSlotStart("2026-10-06", "morning"), null);
});

Deno.test("composeSlotStart returns null for an out-of-range hour", () => {
  assertEquals(composeSlotStart("2026-10-06", "24:00"), null);
});

Deno.test("composeSlotStart output parses to the same wall-clock time in whatever zone runs it", () => {
  const parsed = new Date(composeSlotStart("2026-10-06", "10:00")!);
  assertEquals([parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), parsed.getHours(), parsed.getMinutes()], [2026, 9, 6, 10, 0]);
});

Deno.test("issues no query at all when there are no families to look up", async () => {
  const supabase = makeFakeSupabase([]);
  const result = await nextFreeSlotsByFamily(supabase, [], null, SERVER_NOW);
  assertEquals(result.size, 0);
  assertEquals(supabase.builders.length, 0);
});

// The whole of one family's slot query, as the fake client receives it.
function slotQueryFor(familyId: string): Call[] {
  return [
    { method: "select", args: ["id, family_id, date, start_time"] },
    { method: "eq", args: ["family_id", familyId] },
    { method: "eq", args: ["status", "free"] },
    { method: "gte", args: ["date", "2026-10-03"] },
    { method: "lte", args: ["date", "2026-12-02"] },
    { method: "order", args: ["date", { ascending: true }] },
    { method: "order", args: ["start_time", { ascending: true }] },
    { method: "limit", args: [50] },
  ];
}

const THREE_FAMILIES = [FAMILY_A, FAMILY_B, FAMILY_C];

Deno.test("issues exactly one availability_slots query per listed family", async () => {
  const supabase = perFamilySupabase({});
  await nextFreeSlotsByFamily(supabase, THREE_FAMILIES, null, SERVER_NOW);
  assertEquals(supabase.builders.map((b: Any) => b.table), THREE_FAMILIES.map(() => "availability_slots"));
});

Deno.test("scopes each slot query to one family: status free, date floor and ceiling, earliest first, 50 rows", async () => {
  const supabase = perFamilySupabase({});
  await nextFreeSlotsByFamily(supabase, THREE_FAMILIES, null, SERVER_NOW);
  assertEquals(supabase.builders.map((b: Any) => b.calls), THREE_FAMILIES.map(slotQueryFor));
});

function callsOf(supabase: Any, method: string) {
  return supabase.builders[0].calls.filter((c: Any) => c.method === method);
}

Deno.test("the slot query stops 60 days after its starting date", async () => {
  const supabase = makeFakeSupabase([{ data: [], error: null }]);
  await nextFreeSlotsByFamily(supabase, [FAMILY_A], null, SERVER_NOW);
  assertEquals(callsOf(supabase, "lte"), [{ method: "lte", args: ["date", "2026-12-02"] }]);
});

Deno.test("with now: the 60-day ceiling is counted from the caller's date, not the server's", async () => {
  const supabase = makeFakeSupabase([{ data: [], error: null }]);
  await nextFreeSlotsByFamily(supabase, [FAMILY_A], "2026-10-03T20:45:00", new Date("2026-10-04T03:45:00Z"));
  assertEquals(callsOf(supabase, "lte"), [{ method: "lte", args: ["date", "2026-12-02"] }]);
});

Deno.test("the slot query carries an explicit per-family row limit of 50", async () => {
  const supabase = makeFakeSupabase([{ data: [], error: null }]);
  await nextFreeSlotsByFamily(supabase, [FAMILY_A], null, SERVER_NOW);
  assertEquals(callsOf(supabase, "limit"), [{ method: "limit", args: [50] }]);
});

Deno.test("the row limit is applied after the earliest-first ordering, so only later slots can be cut", async () => {
  const supabase = makeFakeSupabase([{ data: [], error: null }]);
  await nextFreeSlotsByFamily(supabase, [FAMILY_A], null, SERVER_NOW);
  const methods = supabase.builders[0].calls.map((c: Any) => c.method);
  assertEquals(methods.slice(-3), ["order", "order", "limit"]);
});

Deno.test("looks up only the first 50 families however many ids it is given, each exactly once", async () => {
  const ids = Array.from({ length: 60 }, (_, i) => `id-${i}`);
  const supabase = perFamilySupabase({});
  await nextFreeSlotsByFamily(supabase, ids, null, SERVER_NOW);
  assertEquals(queriedFamilies(supabase).sort(), ids.slice(0, MAX_FAMILIES).sort());
});

Deno.test("the maximum number of families per request is 50", () => {
  assertEquals(MAX_FAMILIES, 50);
});

// Nothing limits how many free slots one family can store. Each family is
// asked about on its own, so what one family stored can change neither
// another family's answer nor how many queries the request costs.
const CROWD_OF_A = Array.from({ length: 600 }, (_, i) => slot(`a-${i}`, FAMILY_A, "2026-10-04", "09:00"));
const B_LATER = slot("b-later", FAMILY_B, "2026-10-20", "10:00");

function crowdedSupabase() {
  return perFamilySupabase({
    [FAMILY_A]: { data: CROWD_OF_A, error: null },
    [FAMILY_B]: { data: [B_LATER], error: null },
  });
}

Deno.test("a family with hundreds of early slots does not change another family's next slot", async () => {
  const result = await nextFreeSlotsByFamily(crowdedSupabase(), [FAMILY_A, FAMILY_B], null, SERVER_NOW);
  assertEquals(result.get(FAMILY_B), { id: "b-later", start: "2026-10-20T10:00:00" });
});

Deno.test("a family with hundreds of early slots does not change the number of slot queries", async () => {
  const supabase = crowdedSupabase();
  await nextFreeSlotsByFamily(supabase, [FAMILY_A, FAMILY_B], null, SERVER_NOW);
  assertEquals(queriedFamilies(supabase), [FAMILY_A, FAMILY_B]);
});

Deno.test("a family with hundreds of early slots keeps its own earliest slot", async () => {
  const result = await nextFreeSlotsByFamily(crowdedSupabase(), [FAMILY_A, FAMILY_B], null, SERVER_NOW);
  assertEquals(result.get(FAMILY_A), { id: "a-0", start: "2026-10-04T09:00:00" });
});

// The lookups are not all fired at once: at most SLOT_LOOKUP_CONCURRENCY are
// in flight at any moment, whatever the number of families.
Deno.test("the number of slot queries in flight at once is 10", () => {
  assertEquals(SLOT_LOOKUP_CONCURRENCY, 10);
});

Deno.test("slot queries in flight peak at the concurrency limit and never exceed it, even for 50 families", async () => {
  const ids = Array.from({ length: MAX_FAMILIES }, (_, i) => `id-${i}`);
  const supabase = perFamilySupabase({});
  await nextFreeSlotsByFamily(supabase, ids, null, SERVER_NOW);
  assertEquals(supabase.peakInFlight, SLOT_LOOKUP_CONCURRENCY);
});

Deno.test("every family gets its own slot when there are more families than the limit and answers arrive out of order", async () => {
  const ids = Array.from({ length: 25 }, (_, i) => `id-${i}`);
  const supabase = makeFakeSupabase(async (calls) => {
    const family = familyOf(calls)!;
    // The first family asked about is the last to be answered.
    if (family === ids[0]) await later(20);
    return { data: [slot(`slot-of-${family}`, family, "2026-10-06", "10:00")], error: null };
  });
  const result = await nextFreeSlotsByFamily(supabase, ids, null, SERVER_NOW);
  assertEquals(
    Object.fromEntries(result),
    Object.fromEntries(ids.map((id) => [id, { id: `slot-of-${id}`, start: "2026-10-06T10:00:00" }])),
  );
});

// A failed lookup costs one family its slot fields and nothing else.
function oneFailingSupabase() {
  return perFamilySupabase({
    [FAMILY_A]: { data: [slot("slot-a", FAMILY_A, "2026-10-06", "10:00")], error: null },
    [FAMILY_B]: { data: null, error: { message: "boom" } },
    [FAMILY_C]: { data: [slot("slot-c", FAMILY_C, "2026-10-07", "15:30")], error: null },
  });
}

Deno.test("one family's lookup erroring leaves that family without a slot and the others intact", async () => {
  const result = await nextFreeSlotsByFamily(oneFailingSupabase(), THREE_FAMILIES, null, SERVER_NOW);
  assertEquals(Object.fromEntries(result), {
    [FAMILY_A]: { id: "slot-a", start: "2026-10-06T10:00:00" },
    [FAMILY_C]: { id: "slot-c", start: "2026-10-07T15:30:00" },
  });
});

Deno.test("a lookup that errors is not retried: still exactly one query per family", async () => {
  const supabase = oneFailingSupabase();
  await nextFreeSlotsByFamily(supabase, THREE_FAMILIES, null, SERVER_NOW);
  assertEquals(queriedFamilies(supabase), THREE_FAMILIES);
});

// Failed lookups are also reported in the function logs: one line per
// request, however many failed. `console.warn` is swapped for a recorder for
// the length of one lookup and put back whatever happens, so the line never
// reaches the real console and no other test sees the stub.
async function lookupRecordingWarnings(supabase: Any, familyIds: string[]) {
  const warnings: unknown[][] = [];
  const realWarn = console.warn;
  console.warn = (...args: unknown[]) => void warnings.push(args);
  try {
    const result = await nextFreeSlotsByFamily(supabase, familyIds, null, SERVER_NOW);
    return { result, warnings };
  } finally {
    console.warn = realWarn;
  }
}

function twoFailingSupabase() {
  return perFamilySupabase({
    [FAMILY_A]: { data: null, error: { message: "permission denied for table availability_slots" } },
    [FAMILY_B]: { data: [slot("slot-b", FAMILY_B, "2026-10-06", "10:00")], error: null },
    [FAMILY_C]: { data: null, error: { message: "canceling statement due to statement timeout" } },
  });
}

function allAnsweringSupabase() {
  return perFamilySupabase({
    [FAMILY_A]: { data: [slot("slot-a", FAMILY_A, "2026-10-06", "10:00")], error: null },
    [FAMILY_B]: { data: [], error: null },
    [FAMILY_C]: { data: [slot("slot-c", FAMILY_C, "2026-10-07", "15:30")], error: null },
  });
}

Deno.test("two of three lookups failing writes one warning for the request, not one per failed family", async () => {
  const { warnings } = await lookupRecordingWarnings(twoFailingSupabase(), THREE_FAMILIES);
  assertEquals(warnings.length, 1);
});

Deno.test("the warning is one JSON line: 2 of 3 lookups failed, the first error's message, and no id or row data", async () => {
  const { warnings } = await lookupRecordingWarnings(twoFailingSupabase(), THREE_FAMILIES);
  assertEquals(warnings.map(([line, ...rest]) => [JSON.parse(line as string), rest]), [[
    { msg: "slot lookup failure", failed: 2, total: 3, message: "permission denied for table availability_slots" },
    [],
  ]]);
});

Deno.test("two of three lookups failing leaves the result as it was: the family that answered keeps its slot", async () => {
  const { result } = await lookupRecordingWarnings(twoFailingSupabase(), THREE_FAMILIES);
  assertEquals(Object.fromEntries(result), { [FAMILY_B]: { id: "slot-b", start: "2026-10-06T10:00:00" } });
});

Deno.test("no warning is written when every lookup succeeds, including one that finds no slot", async () => {
  const { warnings } = await lookupRecordingWarnings(allAnsweringSupabase(), THREE_FAMILIES);
  assertEquals(warnings, []);
});

Deno.test("every lookup succeeding leaves the result as it was: each family with a slot gets its own", async () => {
  const { result } = await lookupRecordingWarnings(allAnsweringSupabase(), THREE_FAMILIES);
  assertEquals(Object.fromEntries(result), {
    [FAMILY_A]: { id: "slot-a", start: "2026-10-06T10:00:00" },
    [FAMILY_C]: { id: "slot-c", start: "2026-10-07T15:30:00" },
  });
});

Deno.test("a failed lookup whose error has no message is still counted, and reported as unknown error", async () => {
  const supabase = perFamilySupabase({ [FAMILY_A]: { data: null, error: {} } });
  const { warnings } = await lookupRecordingWarnings(supabase, [FAMILY_A]);
  assertEquals(warnings.map(([line]) => JSON.parse(line as string)), [
    { msg: "slot lookup failure", failed: 1, total: 1, message: "unknown error" },
  ]);
});

// The message a failed lookup logs, for one family whose query answers with
// `error`.
async function loggedMessageFor(error: unknown): Promise<unknown[]> {
  const supabase = perFamilySupabase({ [FAMILY_A]: { data: null, error } });
  const { warnings } = await lookupRecordingWarnings(supabase, [FAMILY_A]);
  return warnings.map(([line]) => JSON.parse(line as string).message);
}

// supabase-js puts a non-JSON error response into `message` whole, so an
// upstream error page would otherwise be logged in full.
Deno.test("a 5,000-character error message is logged cut to its first 200 characters", async () => {
  const logged = await loggedMessageFor({ message: "a".repeat(200) + "b".repeat(4800) });
  assertEquals(logged, ["a".repeat(200)]);
});

Deno.test("an error whose message is not a string does not throw: each is reported as unknown error", async () => {
  const odd = [{ message: 42 }, { message: null }, { message: { text: "boom" } }, "boom"];
  const logged = [];
  for (const error of odd) logged.push(...await loggedMessageFor(error));
  assertEquals(logged, odd.map(() => "unknown error"));
});

Deno.test("parseLimit returns a whole number from 1 to 50 as is", () => {
  assertEquals(["1", "30", "50"].map((raw) => parseLimit(raw, 12)), [1, 30, 50]);
});

Deno.test("parseLimit clamps anything above the maximum to 50", () => {
  assertEquals(["51", "100000", "99999999999999999999999"].map((raw) => parseLimit(raw, 12)), [50, 50, 50]);
});

Deno.test("parseLimit falls back to the endpoint default for 0, -5, 1.5, abc and empty", () => {
  assertEquals(["0", "-5", "1.5", "abc", "", null].map((raw) => parseLimit(raw, 12)), [12, 12, 12, 12, 12, 12]);
});

Deno.test("parseLimit falls back for number-like strings that are not plain whole numbers", () => {
  const odd = [" 5", "5 ", "+5", "5.0", "1e3", "0x10", "Infinity", "NaN"];
  assertEquals(odd.map((raw) => parseLimit(raw, 20)), odd.map(() => 20));
});

Deno.test("returns each family's slot id with its composed start", async () => {
  const supabase = perFamilySupabase({
    [FAMILY_A]: { data: [slot("slot-a", FAMILY_A, "2026-10-06", "10:00")], error: null },
    [FAMILY_B]: { data: [slot("slot-b", FAMILY_B, "2026-10-07", "15:30")], error: null },
  });
  const result = await nextFreeSlotsByFamily(supabase, [FAMILY_A, FAMILY_B], null, SERVER_NOW);
  assertEquals(Object.fromEntries(result), {
    [FAMILY_A]: { id: "slot-a", start: "2026-10-06T10:00:00" },
    [FAMILY_B]: { id: "slot-b", start: "2026-10-07T15:30:00" },
  });
});

Deno.test("picks the earliest slot per family even when rows arrive out of order", async () => {
  const supabase = makeFakeSupabase([{
    data: [
      slot("later-day", FAMILY_A, "2026-10-08", "09:00"),
      slot("same-day-later", FAMILY_A, "2026-10-06", "14:00"),
      slot("earliest", FAMILY_A, "2026-10-06", "10:00"),
    ],
    error: null,
  }]);
  const result = await nextFreeSlotsByFamily(supabase, [FAMILY_A], null, SERVER_NOW);
  assertEquals(result.get(FAMILY_A), { id: "earliest", start: "2026-10-06T10:00:00" });
});

Deno.test("leaves a family with no future free slot out of the result", async () => {
  const supabase = perFamilySupabase({
    [FAMILY_A]: { data: [slot("slot-a", FAMILY_A, "2026-10-06", "10:00")], error: null },
  });
  const result = await nextFreeSlotsByFamily(supabase, [FAMILY_A, FAMILY_B], null, SERVER_NOW);
  assertEquals(result.has(FAMILY_B), false);
});

Deno.test("skips a slot whose stored time cannot be composed and uses the family's next valid one", async () => {
  const supabase = makeFakeSupabase([{
    data: [slot("broken", FAMILY_A, "2026-10-05", "morning"), slot("valid", FAMILY_A, "2026-10-06", "10:00")],
    error: null,
  }]);
  const result = await nextFreeSlotsByFamily(supabase, [FAMILY_A], null, SERVER_NOW);
  assertEquals(result.get(FAMILY_A), { id: "valid", start: "2026-10-06T10:00:00" });
});

Deno.test("degrades to no slots when the lookup errors, rather than failing the listing", async () => {
  const supabase = makeFakeSupabase([{ data: null, error: { message: "boom" } }]);
  const result = await nextFreeSlotsByFamily(supabase, [FAMILY_A], null, SERVER_NOW);
  assertEquals(result.size, 0);
});

Deno.test("parseLocalNow accepts the floating format slot starts use", () => {
  assertEquals(parseLocalNow("2026-10-03T12:00:00"), "2026-10-03T12:00:00");
});

Deno.test("parseLocalNow rejects anything else, including offsets, missing seconds and impossible dates", () => {
  const rejected = [
    null,
    "",
    "now",
    "2026-10-03T12:00:00Z",
    "2026-10-03T12:00:00-07:00",
    "2026-10-03T12:00",
    "2026-10-03 12:00:00",
    "2026-10-03T24:00:00",
    "2026-02-30T12:00:00",
    "2026-13-01T12:00:00",
    // Years the date filter or its 60-day ceiling could not express.
    "0000-01-01T00:00:00",
    "9999-12-31T23:59:59",
  ];
  assertEquals(rejected.map(parseLocalNow), rejected.map(() => null));
});

function todayAndTomorrow(...slots: ReturnType<typeof slot>[]) {
  return makeFakeSupabase([{ data: slots, error: null }]);
}

Deno.test("with now: a past slot today is skipped in favour of tomorrow's", async () => {
  const supabase = todayAndTomorrow(
    slot("past-today", FAMILY_A, "2026-10-03", "09:00"),
    slot("tomorrow", FAMILY_A, "2026-10-04", "10:00"),
  );
  const result = await nextFreeSlotsByFamily(supabase, [FAMILY_A], LOCAL_NOW, SERVER_NOW);
  assertEquals(result.get(FAMILY_A), { id: "tomorrow", start: "2026-10-04T10:00:00" });
});

Deno.test("with now: a slot later today is returned", async () => {
  const supabase = todayAndTomorrow(
    slot("past-today", FAMILY_A, "2026-10-03", "09:00"),
    slot("later-today", FAMILY_A, "2026-10-03", "15:30"),
    slot("tomorrow", FAMILY_A, "2026-10-04", "10:00"),
  );
  const result = await nextFreeSlotsByFamily(supabase, [FAMILY_A], LOCAL_NOW, SERVER_NOW);
  assertEquals(result.get(FAMILY_A), { id: "later-today", start: "2026-10-03T15:30:00" });
});

Deno.test("with now: a family whose only slot today has passed gets no slot", async () => {
  const supabase = todayAndTomorrow(slot("past-today", FAMILY_A, "2026-10-03", "09:00"));
  const result = await nextFreeSlotsByFamily(supabase, [FAMILY_A], LOCAL_NOW, SERVER_NOW);
  assertEquals(result.has(FAMILY_A), false);
});

Deno.test("with now: a slot starting exactly at now is not returned, only strictly later ones", async () => {
  const supabase = todayAndTomorrow(slot("starting-now", FAMILY_A, "2026-10-03", "12:00"));
  const result = await nextFreeSlotsByFamily(supabase, [FAMILY_A], LOCAL_NOW, SERVER_NOW);
  assertEquals(result.has(FAMILY_A), false);
});

Deno.test("with now: queries from the caller's date, not the server's UTC date", async () => {
  // 8:45 pm on the 3rd for the caller is already the 4th in UTC.
  const supabase = todayAndTomorrow();
  await nextFreeSlotsByFamily(supabase, [FAMILY_A], "2026-10-03T20:45:00", new Date("2026-10-04T03:45:00Z"));
  const gte = supabase.builders[0].calls.find((c: Any) => c.method === "gte");
  assertEquals(gte.args, ["date", "2026-10-03"]);
});

Deno.test("a malformed now is ignored: same query date as when now is absent", async () => {
  const supabase = todayAndTomorrow();
  await nextFreeSlotsByFamily(supabase, [FAMILY_A], "2026-10-01T12:00:00Z", SERVER_NOW);
  const gte = supabase.builders[0].calls.find((c: Any) => c.method === "gte");
  assertEquals(gte.args, ["date", "2026-10-03"]);
});

Deno.test("a malformed now is ignored: a slot earlier today is still returned, as when now is absent", async () => {
  const supabase = todayAndTomorrow(
    slot("past-today", FAMILY_A, "2026-10-03", "09:00"),
    slot("tomorrow", FAMILY_A, "2026-10-04", "10:00"),
  );
  const result = await nextFreeSlotsByFamily(supabase, [FAMILY_A], "noon", SERVER_NOW);
  assertEquals(result.get(FAMILY_A), { id: "past-today", start: "2026-10-03T09:00:00" });
});

Deno.test("without now: a slot earlier today is still returned (unchanged date-only behaviour)", async () => {
  const supabase = todayAndTomorrow(
    slot("past-today", FAMILY_A, "2026-10-03", "09:00"),
    slot("tomorrow", FAMILY_A, "2026-10-04", "10:00"),
  );
  const result = await nextFreeSlotsByFamily(supabase, [FAMILY_A], null, SERVER_NOW);
  assertEquals(result.get(FAMILY_A), { id: "past-today", start: "2026-10-03T09:00:00" });
});

const ROW = {
  id: FAMILY_A,
  user_id: "u-2",
  name: "Lee",
  bio: "Two kids and a dog.",
  kid_count: 2,
  avatar_url: null,
  updated_at: "2026-10-01T12:00:00+00:00",
  city: "Austin",
  state: "TX",
};

Deno.test("toListedFamily returns the full row both endpoints share", () => {
  assertEquals(toListedFamily(ROW, false, { id: "slot-a", start: "2026-10-06T10:00:00" }), {
    id: FAMILY_A,
    ownerId: "u-2",
    name: "Lee",
    bio: "Two kids and a dog.",
    kidCount: null,
    avatarUrl: null,
    isOwner: false,
    updatedAt: "2026-10-01T12:00:00+00:00",
    city: "Austin",
    state: "TX",
    nextFreeSlotId: "slot-a",
    nextFreeSlotStart: "2026-10-06T10:00:00",
  });
});

Deno.test("toListedFamily returns null for both slot fields together when there is no slot", () => {
  const listed = toListedFamily(ROW, false, undefined);
  assertEquals([listed.nextFreeSlotId, listed.nextFreeSlotStart], [null, null]);
});

Deno.test("toListedFamily shows kidCount only to the family's owner", () => {
  assertEquals([toListedFamily(ROW, true, undefined).kidCount, toListedFamily(ROW, false, undefined).kidCount], [2, null]);
});

Deno.test("toListedFamily reports a row without city or state as null, never as a missing key", () => {
  const { city: _city, state: _state, ...bare } = ROW;
  const listed = toListedFamily(bare, false, undefined);
  assertEquals([listed.city, listed.state], [null, null]);
});

// Added by qa-engineer for search-browse-directory.

// frontend/src/api/community.ts reads a start that does not match this as "no
// slot", so a start in any other shape would silently remove the badge.
const FRONTEND_FLOATING_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

Deno.test("every composed start has the shape the frontend schema accepts", () => {
  const starts = ["9:30", "09:30", "0:00", "23:59", "14:05:30", " 10:00 "].map((time) => composeSlotStart("2026-10-06", time));
  assertEquals(starts.map((start) => FRONTEND_FLOATING_LOCAL.test(start ?? "")), starts.map(() => true));
});

Deno.test("parseLocalNow accepts the first and last supported years and rejects the year either side", () => {
  const edges = ["1000-01-01T00:00:00", "2999-12-31T23:59:59", "0999-12-31T23:59:59", "3000-01-01T00:00:00"];
  assertEquals(edges.map(parseLocalNow), ["1000-01-01T00:00:00", "2999-12-31T23:59:59", null, null]);
});

Deno.test("parseLocalNow accepts 29 February in a leap year only", () => {
  assertEquals(["2028-02-29T08:00:00", "2027-02-29T08:00:00"].map(parseLocalNow), ["2028-02-29T08:00:00", null]);
});

Deno.test("parseLocalNow rejects what Date.prototype.toISOString produces, with or without its Z", () => {
  const iso = new Date("2026-10-03T12:00:00Z").toISOString();
  assertEquals([iso, iso.slice(0, -1)].map(parseLocalNow), [null, null]);
});

Deno.test("with now: the 60-day ceiling carries over a year boundary", async () => {
  const supabase = makeFakeSupabase([{ data: [], error: null }]);
  await nextFreeSlotsByFamily(supabase, [FAMILY_A], "2026-12-15T10:00:00", SERVER_NOW);
  assertEquals(callsOf(supabase, "lte"), [{ method: "lte", args: ["date", "2027-02-13"] }]);
});

Deno.test("with now: the last supported moment still gets a real calendar date as its ceiling", async () => {
  const supabase = makeFakeSupabase([{ data: [], error: null }]);
  await nextFreeSlotsByFamily(supabase, [FAMILY_A], "2999-12-31T23:59:59", SERVER_NOW);
  assertEquals(callsOf(supabase, "lte"), [{ method: "lte", args: ["date", "3000-03-01"] }]);
});

Deno.test("picks by clock time, not text order, when a stored hour is not zero-padded", async () => {
  // As text "10:00" sorts before "9:30"; as a time 9:30 is the earlier one.
  const supabase = todayAndTomorrow(
    slot("ten", FAMILY_A, "2026-10-06", "10:00"),
    slot("half-past-nine", FAMILY_A, "2026-10-06", "9:30"),
  );
  const result = await nextFreeSlotsByFamily(supabase, [FAMILY_A], null, SERVER_NOW);
  assertEquals(result.get(FAMILY_A), { id: "half-past-nine", start: "2026-10-06T09:30:00" });
});

Deno.test("with now: an unpadded time earlier today counts as already started", async () => {
  // As text "9:00" sorts after "12:00:00"; as a time it is three hours before.
  const supabase = todayAndTomorrow(
    slot("nine", FAMILY_A, "2026-10-03", "9:00"),
    slot("tomorrow", FAMILY_A, "2026-10-04", "10:00"),
  );
  const result = await nextFreeSlotsByFamily(supabase, [FAMILY_A], LOCAL_NOW, SERVER_NOW);
  assertEquals(result.get(FAMILY_A), { id: "tomorrow", start: "2026-10-04T10:00:00" });
});

Deno.test("with now: a slot one second after now is returned", async () => {
  const supabase = todayAndTomorrow(slot("just-after", FAMILY_A, "2026-10-03", "12:00:01"));
  const result = await nextFreeSlotsByFamily(supabase, [FAMILY_A], LOCAL_NOW, SERVER_NOW);
  assertEquals(result.get(FAMILY_A), { id: "just-after", start: "2026-10-03T12:00:01" });
});
