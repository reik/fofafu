// Ports backend/src/controllers/search.controller.ts + search.routes.ts.
// GET /search/families?q=...&limit=N
// Note: sqlite version joined families to users.city/state; that join is
// gone (see supabase/migrations/20260711020000_family_location.sql —
// city/state are now denormalized onto families itself).
import { corsHeaders, json, supabaseForRequest } from "../_shared/client.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "Not found" }, 404);

  const supabase = supabaseForRequest(req);
  const { data: userData } = await supabase.auth.getUser();
  const viewer = userData.user?.id ?? null;

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const limitParam = url.searchParams.get("limit");
  const pageSize = limitParam ? Number(limitParam) : 20;
  const needle = `%${q}%`;

  const { data, error } = await supabase
    .from("families")
    .select("*")
    .or(`name.ilike.${needle},bio.ilike.${needle},city.ilike.${needle},state.ilike.${needle}`)
    .limit(pageSize);
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
});
