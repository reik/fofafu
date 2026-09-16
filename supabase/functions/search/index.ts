// Ports backend/src/controllers/search.controller.ts + search.routes.ts.
// GET /search/families?q=...&limit=N
// Note: sqlite version joined families to users.city/state; that join is
// gone (see supabase/migrations/20260711020000_family_location.sql —
// city/state are now denormalized onto families itself).
//
// Block-aware filtering (fofafu_vault/features/moderation-report-block.md,
// dispatch contract D): same query-level exclusion as community/index.ts --
// see that file's comment for why RLS can't be used to hide `families` rows
// here (it would also break direct navigation to a blocked family's own
// profile page, which v1's unblock UX needs to stay reachable).
import { corsHeaders, json, supabaseForRequest } from "../_shared/client.ts";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function blockedFamilyIds(supabase: SupabaseClient, viewer: string | null): Promise<string[]> {
  // No authenticated viewer means no family of their own, so no blocks to
  // apply -- skip the query entirely rather than asking `blocks` (whose RLS
  // would return nothing useful for an anon caller anyway, since `families`
  // itself is already anon-unreadable per 20260714000000_restrict_pii_to_authenticated.sql).
  if (!viewer) return [];
  const { data, error } = await supabase.from("blocks").select("blocked_family_id");
  if (error) throw new Error(error.message);
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
  const viewer = userData.user?.id ?? null;

  const url = new URL(req.url);
  const rawQ = url.searchParams.get("q") ?? "";
  const limitParam = url.searchParams.get("limit");
  const pageSize = limitParam ? Number(limitParam) : 20;

  // rawQ is interpolated into PostgREST's .or() filter DSL below, where
  // comma/paren/quote/backslash have syntactic meaning (they can inject
  // additional filter clauses). Strip anything but the characters a
  // city/state/name/bio search term needs; escape ilike's own wildcards
  // so a literal "%" or "_" in the query doesn't act as a wildcard.
  const safeQ = rawQ.replace(/[,()"\\]/g, "").slice(0, 100);
  const needle = `%${safeQ.replace(/[%_]/g, (c) => `\\${c}`)}%`;

  const excluded = await blockedFamilyIds(supabase, viewer);

  let query = supabase
    .from("families")
    .select("*")
    .or(`name.ilike.${needle},bio.ilike.${needle},city.ilike.${needle},state.ilike.${needle}`)
    .limit(pageSize);
  if (excluded.length > 0) query = query.not("id", "in", `(${excluded.join(",")})`);
  const { data, error } = await query;
  if (error) return json({ error: error.message }, 500);

  return json((data ?? []).map((row) => {
    const isOwner = viewer === row.user_id;
    return {
      id: row.id,
      ownerId: row.user_id,
      name: row.name,
      bio: row.bio,
      kidCount: isOwner ? row.kid_count : null,
      avatarUrl: row.avatar_url,
      isOwner,
      updatedAt: row.updated_at,
    };
  }));
}

// Guarded so importing this module from a test doesn't also try to bind a
// real network port -- see admin/index.ts's identical guard comment.
if (import.meta.main) {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    return handleRequest(req, supabaseForRequest(req));
  });
}
