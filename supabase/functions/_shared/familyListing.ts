// What community/index.ts and search/index.ts share: the family row both
// listings return, and the next-free-slot lookup that fills it in. Keeping
// them here means the two endpoints can't drift apart on shape or on which
// slot counts as "next".
//
// "Next free slot" = the family's earliest `availability_slots` row with
// status 'free' that starts strictly after the caller's `now`. Slots carry
// no timezone, so the server can't know what time it is for the viewer; the
// viewer says so, via a `now` query param in the same floating format as
// `nextFreeSlotStart` below. Without a usable `now` the lookup falls back to
// `date` >= the server's UTC calendar date, which keeps a slot from earlier
// today -- the behaviour a frontend that predates the param already relies
// on.
//
// `nextFreeSlotStart` is `<date>T<start_time>:00` with no `Z` and no offset
// (e.g. "2026-10-06T10:00:00"). `availability_slots.date` is a Postgres date
// and `start_time` is free text holding a 24h "HH:MM" wall-clock time with no
// timezone, so the composed value is deliberately a floating local time:
// `new Date(value)` reads an offset-less ISO date-time as local time, which
// makes a slot saved as 10:00 show as 10:00 for every viewer -- the same
// reading /family/:id and /playdates already give `startTime`.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export interface FamilyRow {
  id: string;
  user_id: string;
  name: string;
  bio: string;
  kid_count: number | null;
  avatar_url: string | null;
  updated_at: string;
  city?: string | null;
  state?: string | null;
}

export interface NextFreeSlot {
  id: string;
  start: string;
}

export interface ListedFamily {
  id: string;
  ownerId: string;
  name: string;
  bio: string;
  kidCount: number | null;
  avatarUrl: string | null;
  isOwner: boolean;
  updatedAt: string;
  city: string | null;
  state: string | null;
  nextFreeSlotId: string | null;
  nextFreeSlotStart: string | null;
}

interface SlotRow {
  id: string;
  family_id: string;
  date: string;
  start_time: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;
// Years 1000-2999 only: outside that, the date filter or its ceiling stops
// being a date Postgres accepts.
const LOCAL_NOW_RE = /^([12]\d{3}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;

// The most families one request may list, and so the most slot queries one
// request can issue: the lookup asks about each listed family exactly once.
// `limit` arrives from the query string, so the bound is applied where it
// enters (parseLimit) and again inside the lookup.
export const MAX_FAMILIES = 50;

// A slot further out than this is not a useful "next" slot for a listing.
const SLOT_HORIZON_DAYS = 60;

// Row cap on one family's slot query. Nothing limits how many slots a family
// creates, but each query is scoped to a single family, so only that
// family's own slots can use the cap up.
const MAX_SLOT_ROWS_PER_FAMILY = 50;

// How many slot queries one request has in flight at a time.
export const SLOT_LOOKUP_CONCURRENCY = 10;

// `limit` as sent by the caller. Only a plain whole number counts; it is
// clamped to 1..MAX_FAMILIES. Anything else (missing, zero, negative,
// fractional, not a number) gets the endpoint's default rather than a 400.
export function parseLimit(raw: string | null, fallback: number): number {
  if (!raw || !/^\d+$/.test(raw)) return fallback;
  const limit = Number(raw);
  return limit >= 1 ? Math.min(limit, MAX_FAMILIES) : fallback;
}

// Returns null when the stored values aren't a calendar date plus a clock
// time. Nothing constrains `start_time` at the database level, and a made-up
// time would be worse than no slot.
export function composeSlotStart(date: string, startTime: string): string | null {
  const time = TIME_RE.exec(startTime.trim());
  if (!time || !DATE_RE.test(date)) return null;
  return `${date}T${time[1].padStart(2, "0")}:${time[2]}:${time[3] ?? "00"}`;
}

// The caller's `now`, accepted only in exactly the floating format above.
// Anything else is treated as absent rather than as an error, so a request
// from a frontend that sends nothing (or something odd) still gets rows. The
// date part has to be a real calendar date because it goes into a Postgres
// date filter, which would otherwise fail the whole slot query.
export function parseLocalNow(raw: string | null): string | null {
  const date = raw ? LOCAL_NOW_RE.exec(raw)?.[1] : undefined;
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? raw : null;
}

// `date` is a valid YYYY-MM-DD calendar date; the result is too.
function addDays(date: string, days: number): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

// What one family's slot query came back with. `failure` is null when the
// query was answered, and otherwise the error's message, which may be empty.
interface SlotLookup {
  rows: SlotRow[];
  failure: string | null;
}

// The most of one error message that is written to the logs. supabase-js puts
// a non-JSON error response into `message` whole, so without a cap an
// upstream error page would be logged in full.
const MAX_FAILURE_MESSAGE_LENGTH = 200;

// The error arrives as whatever JSON the API answered with, so `message` is
// not guaranteed to be there or to be text.
function failureMessage(error: { message?: unknown }): string {
  return typeof error.message === "string" ? error.message.slice(0, MAX_FAILURE_MESSAGE_LENGTH) : "unknown error";
}

// One family's free slots, earliest first. Bounded on every axis: a single
// family, the date window and the row count. A failed lookup yields no rows
// instead of throwing: the listing is still useful without that family's
// playdate badge (same as the per-row lookup this replaced, which ignored
// its error). The failure is handed back alongside so the request can report
// it once.
async function freeSlotRows(supabase: SupabaseClient, familyId: string, fromDate: string): Promise<SlotLookup> {
  const { data, error } = await supabase
    .from("availability_slots")
    .select("id, family_id, date, start_time")
    .eq("family_id", familyId)
    .eq("status", "free")
    .gte("date", fromDate)
    .lte("date", addDays(fromDate, SLOT_HORIZON_DAYS))
    .order("date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(MAX_SLOT_ROWS_PER_FAMILY);
  if (error) return { rows: [], failure: failureMessage(error) };
  return { rows: (data ?? []) as SlotRow[], failure: null };
}

// Failed lookups do not change the response, so without this a listing whose
// lookups all failed is a 200 that reads as "no family has a free slot". One
// line per request in the function logs, however many lookups failed, in the
// shape of the one other warning an Edge Function writes (coach/index.ts).
// Counts and the first failure's message (first in listing order) only:
// never a family id, a user id or row data.
function warnOfFailedLookups(lookups: SlotLookup[]): void {
  const failures = lookups.flatMap((lookup) => (lookup.failure === null ? [] : [lookup.failure]));
  if (failures.length === 0) return;
  const report = { msg: "slot lookup failure", failed: failures.length, total: lookups.length, message: failures[0] };
  console.warn(JSON.stringify(report));
}

// Runs `task` over `items` with at most `width` of them in flight at once.
// Results keep the order of `items`. Each worker takes the next unclaimed
// item when its previous one settles, so the number of tasks started is
// exactly `items.length`.
async function mapPooled<T, R>(items: T[], width: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, worker));
  return results;
}

// The earliest usable slot per family among `rows`, picked by composed
// start, so the result doesn't depend on row order or on how unpadded times
// ("9:00") sort as text in Postgres. Composed starts and `localNow` share one
// zero-padded format, so comparing them as strings is comparing them as
// times.
function earliestByFamily(rows: SlotRow[], localNow: string | null): Map<string, NextFreeSlot> {
  const next = new Map<string, NextFreeSlot>();
  for (const row of rows) {
    const start = composeSlotStart(row.date, row.start_time);
    if (!start || (localNow && start <= localNow)) continue;
    const current = next.get(row.family_id);
    if (!current || start < current.start) next.set(row.family_id, { id: row.id, start });
  }
  return next;
}

// `rawNow` is the request's `now` param, unvalidated. Ids past MAX_FAMILIES
// are ignored, so a caller that forgets to clamp its own limit still cannot
// fan out.
//
// One bounded query per listed family, SLOT_LOOKUP_CONCURRENCY at a time. A
// family's result depends on its own slots alone, and the number of queries
// is the number of families listed (at most MAX_FAMILIES): neither depends
// on what any other family has stored, and no row count is used to infer
// anything. Failed lookups are reported once, in the logs only.
export async function nextFreeSlotsByFamily(
  supabase: SupabaseClient,
  familyIds: string[],
  rawNow: string | null,
  serverNow: Date = new Date(),
): Promise<Map<string, NextFreeSlot>> {
  const localNow = parseLocalNow(rawNow);
  const fromDate = (localNow ?? serverNow.toISOString()).slice(0, 10);
  const ids = familyIds.slice(0, MAX_FAMILIES);
  const lookups = await mapPooled(ids, SLOT_LOOKUP_CONCURRENCY, (id) => freeSlotRows(supabase, id, fromDate));
  warnOfFailedLookups(lookups);
  return earliestByFamily(lookups.flatMap((lookup) => lookup.rows), localNow);
}

// `kidCount` stays owner-only, as in family/index.ts. The two slot fields are
// null together or set together.
export function toListedFamily(row: FamilyRow, isOwner: boolean, slot: NextFreeSlot | undefined): ListedFamily {
  return {
    id: row.id,
    ownerId: row.user_id,
    name: row.name,
    bio: row.bio,
    kidCount: isOwner ? row.kid_count : null,
    avatarUrl: row.avatar_url,
    isOwner,
    updatedAt: row.updated_at,
    city: row.city ?? null,
    state: row.state ?? null,
    nextFreeSlotId: slot?.id ?? null,
    nextFreeSlotStart: slot?.start ?? null,
  };
}
