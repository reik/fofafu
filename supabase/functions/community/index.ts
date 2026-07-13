// Ports backend/src/controllers/community.controller.ts + community.routes.ts.
// GET /community/recent?limit=N
import { corsHeaders, json, supabaseForRequest } from "../_shared/client.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "Not found" }, 404);

  const supabase = supabaseForRequest(req);
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return json({ error: "Not authenticated" }, 401);

  const url = new URL(req.url);
  const limitParam = url.searchParams.get("limit");
  const pageSize = limitParam ? Number(limitParam) : 12;

  const { data, error } = await supabase
    .from("families")
    .select("*")
    .neq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(pageSize);
  if (error) return json({ error: error.message }, 500);

  return json((data ?? []).map((row) => ({
    id: row.id,
    ownerId: row.user_id,
    name: row.name,
    bio: row.bio,
    kidCount: null,
    avatarUrl: row.avatar_url,
    isOwner: false,
    updatedAt: row.updated_at,
  })));
});
