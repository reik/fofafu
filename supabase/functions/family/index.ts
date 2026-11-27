// Ports backend/src/controllers/family.controller.ts + family.routes.ts.
// Routes (relative to the function base URL):
//   GET   /family/me     -> getMyFamily
//   GET   /family/:id    -> getFamily (id = family id OR owner's user id)
//   PATCH /family/me     -> patchFamily
//
// `city` / `state` (fofafu_vault/features/messages-two-pane.md) are
// additive, trimmed, and null when blank. families stores them as NOT NULL
// DEFAULT '' (20260711020000_family_location.sql), so '' means "not given".
// Not editable through PATCH here; they come from sign-up metadata.
import { corsHeaders, json, supabaseForRequest } from "../_shared/client.ts";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

interface FamilyRow {
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

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed === "" ? null : trimmed;
}

function toDTO(row: FamilyRow, viewerUserId: string | null) {
  const isOwner = viewerUserId === row.user_id;
  return {
    id: row.id,
    ownerId: row.user_id,
    name: row.name,
    bio: row.bio,
    kidCount: isOwner ? row.kid_count : null,
    avatarUrl: row.avatar_url,
    isOwner,
    updatedAt: row.updated_at,
    city: blankToNull(row.city),
    state: blankToNull(row.state),
  };
}

// Pulled out of Deno.serve so tests can call it directly with a fake
// SupabaseClient, same pattern as community/index.ts's handleRequest.
export async function handleRequest(req: Request, supabase: SupabaseClient): Promise<Response> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;

  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  // segments look like ["family", "me"] or ["family", "<id>"]
  const target = segments[segments.length - 1];

  if (req.method === "GET" && target === "me") {
    if (!userId) return json({ error: "Not authenticated" }, 401);
    const { data, error } = await supabase.from("families").select("*").eq("user_id", userId).maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!data) return json({ error: "Family not found" }, 404);
    return json(toDTO(data as FamilyRow, userId));
  }

  if (req.method === "GET" && target) {
    // target may be a family id or an owner's user id (links from
    // announcements/comments/messages only carry authorId/userId). Two
    // parameterized .eq() lookups instead of interpolating `target` into
    // the .or() filter DSL, which would let filter-syntax characters
    // (comma/paren/quote) in `target` inject additional clauses.
    const { data: byId, error: byIdErr } = await supabase
      .from("families").select("*").eq("id", target).maybeSingle();
    if (byIdErr) return json({ error: byIdErr.message }, 500);

    let data = byId;
    if (!data) {
      const { data: byUser, error: byUserErr } = await supabase
        .from("families").select("*").eq("user_id", target).maybeSingle();
      if (byUserErr) return json({ error: byUserErr.message }, 500);
      data = byUser;
    }
    if (!data) return json({ error: "Family not found" }, 404);
    return json(toDTO(data as FamilyRow, userId));
  }

  if (req.method === "PATCH" && target === "me") {
    if (!userId) return json({ error: "Not authenticated" }, 401);
    const patch = await req.json().catch(() => ({}));
    const { data: current, error: fetchErr } = await supabase
      .from("families").select("*").eq("user_id", userId).maybeSingle();
    if (fetchErr) return json({ error: fetchErr.message }, 500);
    if (!current) return json({ error: "Family not found" }, 404);

    const row = current as FamilyRow;
    const next = {
      name: patch.name ?? row.name,
      bio: patch.bio ?? row.bio,
      kid_count: patch.kidCount === undefined ? row.kid_count : patch.kidCount,
      avatar_url: patch.avatarUrl === undefined ? row.avatar_url : patch.avatarUrl,
      updated_at: new Date().toISOString(),
    };
    const { data: updated, error: updateErr } = await supabase
      .from("families").update(next).eq("id", row.id).select("*").single();
    if (updateErr) return json({ error: updateErr.message }, 500);
    return json(toDTO(updated as FamilyRow, userId));
  }

  return json({ error: "Not found" }, 404);
}

// Guarded so importing this module from a test doesn't also try to bind a
// real network port -- see admin/index.ts's identical guard comment.
if (import.meta.main) {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    return handleRequest(req, supabaseForRequest(req));
  });
}
