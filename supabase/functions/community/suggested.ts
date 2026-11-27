// GET /community/suggested?limit=N&now=YYYY-MM-DDTHH:MM:SS
// "Families to say hi to" on /messages (fofafu_vault/features/messages-two-pane.md).
//
// Ranked here rather than in the browser so the frontend never needs the
// viewer's own city/state: it gets back at most MAX_SUGGESTIONS rows, each
// with the one rule that put it there.
//
// Exclusions: the caller's own family; families blocked in either direction
// (see blocks.ts); families whose owner has any message with the caller,
// sent or received.
//
// Ranking, compared in order: same city AND same state as the caller's
// family; same state; has an upcoming free slot; families.updated_at, newest
// first. City/state compare trimmed and case-insensitively, and an empty
// value never matches. `reason` is the first rule the row meets; every row
// meets "recent", so the response is empty only when nothing is left after
// the exclusions.
//
// Bounded: the candidates are the SUGGESTION_POOL_SIZE most recently updated
// non-excluded families, ranked in memory. Query count per request is fixed
// (blocks, own family, blocked-by, pool, messages) plus one slot query per
// surviving candidate, so at most 5 + SUGGESTION_POOL_SIZE however many
// families exist. A family outside the pool is never suggested, even if it
// shares the caller's city.
import { json } from "../_shared/client.ts";
import {
  type FamilyRow,
  type ListedFamily,
  type NextFreeSlot,
  nextFreeSlotsByFamily,
  parseLimit,
  toListedFamily,
} from "../_shared/familyListing.ts";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { blockedFamilyIds, blockingFamilyIds, UUID_RE } from "./blocks.ts";

export const SUGGESTION_POOL_SIZE = 50;
export const MAX_SUGGESTIONS = 3;

export type SuggestionReason = "same_city" | "same_state" | "open_slot" | "recent";

export interface SuggestedFamily extends ListedFamily {
  reason: SuggestionReason;
}

interface ViewerFamily {
  id: string;
  city: string | null;
  state: string | null;
}

interface MessageEnds {
  sender_id: string;
  receiver_id: string;
}

function normalized(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

async function viewerFamily(supabase: SupabaseClient, userId: string): Promise<ViewerFamily | null> {
  const { data, error } = await supabase.from("families").select("id, city, state").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ViewerFamily | null) ?? null;
}

async function excludedFamilyIds(
  supabase: SupabaseClient,
  viewer: ViewerFamily | null,
  serviceClient: () => SupabaseClient,
): Promise<string[]> {
  const mine = await blockedFamilyIds(supabase);
  // No family row means nobody can have blocked the caller: skip the
  // service-role client entirely.
  const theirs = viewer ? await blockingFamilyIds(serviceClient(), viewer.id) : [];
  return [...new Set([...mine, ...theirs])];
}

async function candidatePool(supabase: SupabaseClient, userId: string, excluded: string[]): Promise<FamilyRow[]> {
  let query = supabase
    .from("families")
    .select("*")
    .neq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(SUGGESTION_POOL_SIZE);
  if (excluded.length > 0) query = query.not("id", "in", `(${excluded.join(",")})`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as FamilyRow[];
}

// Owners among `ownerIds` who share any message with the caller. Asked only
// about the pool's owners, so the filter string stays bounded by the pool.
// Both ids are interpolated into PostgREST's .or() DSL, so the caller has
// already narrowed `ownerIds` to UUIDs; `userId` comes from Supabase Auth.
async function threadPartners(supabase: SupabaseClient, userId: string, ownerIds: string[]): Promise<Set<string>> {
  if (ownerIds.length === 0) return new Set();
  const owners = ownerIds.join(",");
  const { data, error } = await supabase
    .from("messages")
    .select("sender_id, receiver_id")
    .or(
      `and(sender_id.eq.${userId},receiver_id.in.(${owners})),and(receiver_id.eq.${userId},sender_id.in.(${owners}))`,
    );
  if (error) throw new Error(error.message);
  const partners = new Set<string>();
  for (const m of (data ?? []) as MessageEnds[]) partners.add(m.sender_id === userId ? m.receiver_id : m.sender_id);
  return partners;
}

function reasonFor(viewer: ViewerFamily | null, row: FamilyRow, slot: NextFreeSlot | undefined): SuggestionReason {
  const state = normalized(viewer?.state);
  const city = normalized(viewer?.city);
  const sameState = state !== "" && state === normalized(row.state);
  if (sameState && city !== "" && city === normalized(row.city)) return "same_city";
  if (sameState) return "same_state";
  return slot ? "open_slot" : "recent";
}

// same_city rows also meet same_state, so a same_city row with a slot still
// outranks one without: the three rules compare in order, not just the
// first that matched.
function rankKey(reason: SuggestionReason, slot: NextFreeSlot | undefined): number {
  const city = reason === "same_city" ? 4 : 0;
  const state = reason === "same_city" || reason === "same_state" ? 2 : 0;
  return city + state + (slot ? 1 : 0);
}

function updatedAt(row: FamilyRow): number {
  const t = Date.parse(row.updated_at);
  return Number.isNaN(t) ? -Infinity : t;
}

function rank(viewer: ViewerFamily | null, rows: FamilyRow[], slots: Map<string, NextFreeSlot>): SuggestedFamily[] {
  const scored = rows.map((row) => {
    const slot = slots.get(row.id);
    const reason = reasonFor(viewer, row, slot);
    return { row, slot, reason, key: rankKey(reason, slot), at: updatedAt(row) };
  });
  // Array.prototype.sort is stable, so equal timestamps keep the pool's
  // own updated_at-desc order.
  scored.sort((a, b) => b.key - a.key || (b.at > a.at ? 1 : b.at < a.at ? -1 : 0));
  return scored.map(({ row, slot, reason }) => ({ ...toListedFamily(row, false, slot), reason }));
}

export async function handleSuggested(
  supabase: SupabaseClient,
  userId: string,
  url: URL,
  serviceClient: () => SupabaseClient,
): Promise<Response> {
  const limit = Math.min(parseLimit(url.searchParams.get("limit"), MAX_SUGGESTIONS), MAX_SUGGESTIONS);
  try {
    const viewer = await viewerFamily(supabase, userId);
    const excluded = await excludedFamilyIds(supabase, viewer, serviceClient);
    // A row whose owner id isn't a UUID can't be checked against messages
    // safely, so it is dropped rather than risk suggesting an existing thread.
    const pool = (await candidatePool(supabase, userId, excluded)).filter((row) => UUID_RE.test(row.user_id));
    const partners = await threadPartners(supabase, userId, pool.map((row) => row.user_id));
    const candidates = pool.filter((row) => !partners.has(row.user_id));
    const slots = await nextFreeSlotsByFamily(supabase, candidates.map((row) => row.id), url.searchParams.get("now"));
    return json(rank(viewer, candidates, slots).slice(0, limit));
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Query failed" }, 500);
  }
}
