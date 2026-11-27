// Ports backend/src/controllers/community.controller.ts + community.routes.ts.
// GET /community/recent?limit=N
// GET /community/suggested?limit=N&now=... -> see suggested.ts
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
import { type FamilyRow, nextFreeSlotsByFamily, parseLimit, toListedFamily } from "../_shared/familyListing.ts";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { blockedFamilyIds, serviceRoleClient } from "./blocks.ts";
import { handleSuggested } from "./suggested.ts";

// Pulled out of Deno.serve so tests can call it directly with a fake
// SupabaseClient instead of needing a live network + Postgres, same pattern
// as supabase/functions/admin/index.ts's handleRequest. `serviceClient` is
// only called by /suggested, for the one blocked-by lookup blocks.ts
// explains; tests inject a fake.
export async function handleRequest(
  req: Request,
  supabase: SupabaseClient,
  serviceClient: () => SupabaseClient = serviceRoleClient,
): Promise<Response> {
  if (req.method !== "GET") return json({ error: "Not found" }, 404);

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return json({ error: "Not authenticated" }, 401);

  const url = new URL(req.url);
  // Any other path keeps answering as /recent, as it always has.
  if (url.pathname.split("/").filter(Boolean).at(-1) === "suggested") {
    return handleSuggested(supabase, userId, url, serviceClient);
  }

  const pageSize = parseLimit(url.searchParams.get("limit"), 12);

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

  // Same row shape and slot lookup as search/index.ts. `isOwner` is always
  // false here: the caller's own family is excluded by the query above.
  const rows = (data ?? []) as FamilyRow[];
  const slots = await nextFreeSlotsByFamily(supabase, rows.map((row) => row.id), url.searchParams.get("now"));
  return json(rows.map((row) => toListedFamily(row, false, slots.get(row.id))));
}

// Guarded so importing this module from a test doesn't also try to bind a
// real network port -- see admin/index.ts's identical guard comment.
if (import.meta.main) {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    return handleRequest(req, supabaseForRequest(req));
  });
}
