// Ports backend/src/controllers/community.controller.ts + community.routes.ts.
// GET /community/recent?limit=N
//
// Block-aware filtering (fofafu_vault/features/moderation-report-block.md,
// dispatch contract D): `families` rows can't be hidden from a blocker via
// RLS the way announcements/comments/messages are (see
// supabase/migrations/20260904000000_moderation_reports_blocks.sql) --
// doing that would ALSO hide the blocked family's own profile page, which
// v1's "unblock lives on the previously-blocked family's profile, no
// block-list screen" requirement needs to stay directly reachable. So
// exclusion here is query-level instead: fetch the caller's own blocked
// family ids (blocks' own RLS already scopes `.from("blocks").select(...)`
// to "my blocks only" -- see supabase/functions/moderation/index.ts) and
// filter them out of this listing specifically.
import { corsHeaders, json, supabaseForRequest } from "../_shared/client.ts";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function blockedFamilyIds(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.from("blocks").select("blocked_family_id");
  if (error) throw new Error(error.message);
  // Defensive UUID filter, same reasoning as search/index.ts's own query
  // sanitization: these ids get interpolated into a PostgREST .not(...,"in",
  // "(...)") filter string below, so only well-formed UUID characters
  // (which can't contain the DSL's own comma/paren/quote syntax) are let
  // through.
  return (data ?? [])
    .map((r: { blocked_family_id: string }) => r.blocked_family_id)
    .filter((id: string) => UUID_RE.test(id));
}

// Pulled out of Deno.serve so tests can call it directly with a fake
// SupabaseClient instead of needing a live network + Postgres, same pattern
// as supabase/functions/admin/index.ts's handleRequest.
export async function handleRequest(req: Request, supabase: SupabaseClient): Promise<Response> {
  if (req.method !== "GET") return json({ error: "Not found" }, 404);

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return json({ error: "Not authenticated" }, 401);

  const url = new URL(req.url);
  const limitParam = url.searchParams.get("limit");
  const pageSize = limitParam ? Number(limitParam) : 12;

  const excluded = await blockedFamilyIds(supabase);

  let query = supabase
    .from("families")
    .select("*")
    .neq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(pageSize);
  if (excluded.length > 0) query = query.not("id", "in", `(${excluded.join(",")})`);
  const { data, error } = await query;
  if (error) return json({ error: error.message }, 500);

  const rows = data ?? [];
  const today = new Date().toISOString().slice(0, 10);

  // One slot lookup per row rather than a single grouped query: pageSize is
  // capped at a handful of families (Home dashboard's Community sidebar), so
  // N+1 here trades a little latency for reusing the plain PostgREST client
  // instead of hand-writing a correlated-subquery RPC.
  const nextFreeSlotIds = await Promise.all(rows.map(async (row) => {
    const { data: slot } = await supabase
      .from("availability_slots")
      .select("id")
      .eq("family_id", row.id)
      .eq("status", "free")
      .gte("date", today)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(1)
      .maybeSingle();
    return slot?.id ?? null;
  }));

  return json(rows.map((row, i) => ({
    id: row.id,
    ownerId: row.user_id,
    name: row.name,
    bio: row.bio,
    kidCount: null,
    avatarUrl: row.avatar_url,
    isOwner: false,
    updatedAt: row.updated_at,
    city: row.city,
    state: row.state,
    nextFreeSlotId: nextFreeSlotIds[i],
  })));
}

// Guarded so importing this module from a test doesn't also try to bind a
// real network port -- see admin/index.ts's identical guard comment.
if (import.meta.main) {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    return handleRequest(req, supabaseForRequest(req));
  });
}
