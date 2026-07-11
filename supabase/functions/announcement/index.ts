// Ports backend/src/controllers/announcement.controller.ts + announcement.routes.ts.
// PostgREST can't do the sqlite version's LEFT JOIN families or GROUP BY
// reactions in one query (no direct FK from announcements to families —
// both merely reference auth.users independently), so author info and
// reaction counts are fetched as separate batched queries and merged here,
// same shape as the original DTOs.
//
// Routes (relative to function base URL):
//   POST   /announcement                          -> createAnnouncement
//   GET    /announcement?cursor=&limit=&familyId=  -> listAnnouncements
//   GET    /announcement/:id                       -> getAnnouncement
//   PATCH  /announcement/:id                       -> patchAnnouncement
//   DELETE /announcement/:id                       -> deleteAnnouncement
//   POST   /announcement/:id/comments              -> createComment
//   GET    /announcement/:id/comments              -> listComments
//   PATCH  /announcement/comments/:id              -> patchComment
//   DELETE /announcement/comments/:id              -> deleteComment
//   POST   /announcement/:id/react                 -> toggleReaction
import { corsHeaders, json, supabaseForRequest } from "../_shared/client.ts";

const REACTION_TYPES = ["like", "love", "hug", "celebrate", "support"] as const;
type ReactionType = typeof REACTION_TYPES[number];

async function authorLookup(supabase: any, userIds: string[]) {
  if (userIds.length === 0) return new Map<string, { name: string; avatar_url: string | null }>();
  const { data } = await supabase.from("families").select("user_id, name, avatar_url").in("user_id", userIds);
  return new Map((data ?? []).map((f: any) => [f.user_id, { name: f.name, avatar_url: f.avatar_url }]));
}

async function reactionAggregates(supabase: any, announcementIds: string[], viewerUserId: string | null) {
  const byAnnouncement = new Map<string, { reactions: Record<ReactionType, number>; myReaction: ReactionType | null }>();
  for (const id of announcementIds) {
    byAnnouncement.set(id, {
      reactions: Object.fromEntries(REACTION_TYPES.map((t) => [t, 0])) as Record<ReactionType, number>,
      myReaction: null,
    });
  }
  if (announcementIds.length === 0) return byAnnouncement;
  const { data } = await supabase.from("reactions").select("announcement_id, type, user_id").in("announcement_id", announcementIds);
  for (const r of data ?? []) {
    const entry = byAnnouncement.get(r.announcement_id);
    if (!entry) continue;
    entry.reactions[r.type as ReactionType] += 1;
    if (viewerUserId && r.user_id === viewerUserId) entry.myReaction = r.type as ReactionType;
  }
  return byAnnouncement;
}

function toAnnouncementDTO(row: any, author: { name: string; avatar_url: string | null } | undefined, agg: { reactions: Record<ReactionType, number>; myReaction: ReactionType | null }, viewerUserId: string | null) {
  return {
    id: row.id,
    authorId: row.user_id,
    authorName: author?.name ?? null,
    authorAvatarUrl: author?.avatar_url ?? null,
    content: row.content,
    mediaUrl: row.media_url,
    mediaType: row.media_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reactions: agg.reactions,
    myReaction: agg.myReaction,
    isAuthor: viewerUserId === row.user_id,
  };
}

function toCommentDTO(row: any, author: { name: string } | undefined, viewerUserId: string | null) {
  return {
    id: row.id,
    announcementId: row.announcement_id,
    authorId: row.user_id,
    authorName: author?.name ?? null,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isAuthor: viewerUserId === row.user_id,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = supabaseForRequest(req);
  const { data: userData } = await supabase.auth.getUser();
  const userId: string | null = userData.user?.id ?? null;

  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean).filter((s) => s !== "announcement");
  // segments: [] | [id] | [id, "comments"] | ["comments", id] | [id, "react"]

  // POST /announcement
  if (req.method === "POST" && segments.length === 0) {
    if (!userId) return json({ error: "Not authenticated" }, 401);
    const body = await req.json().catch(() => ({}));
    const { data, error } = await supabase
      .from("announcements")
      .insert({ user_id: userId, content: body.content, media_url: body.mediaUrl ?? null, media_type: body.mediaType ?? null })
      .select("*").single();
    if (error) return json({ error: error.message }, 500);
    const authors = await authorLookup(supabase, [userId]);
    const agg = await reactionAggregates(supabase, [data.id], userId);
    return json(toAnnouncementDTO(data, authors.get(userId), agg.get(data.id)!, userId), 201);
  }

  // GET /announcement
  if (req.method === "GET" && segments.length === 0) {
    const cursor = url.searchParams.get("cursor");
    const pageSize = Number(url.searchParams.get("limit") ?? 20);
    const familyId = url.searchParams.get("familyId");

    let authorUserId: string | null = null;
    if (familyId) {
      const { data: fam } = await supabase.from("families").select("user_id").eq("id", familyId).maybeSingle();
      if (!fam) return json({ items: [], nextCursor: null });
      authorUserId = fam.user_id;
    }

    let query = supabase.from("announcements").select("*").order("created_at", { ascending: false }).limit(pageSize);
    if (authorUserId) query = query.eq("user_id", authorUserId);
    if (cursor) query = query.lt("created_at", cursor);
    const { data, error } = await query;
    if (error) return json({ error: error.message }, 500);

    const rows = data ?? [];
    const authors = await authorLookup(supabase, [...new Set(rows.map((r: any) => r.user_id))]);
    const agg = await reactionAggregates(supabase, rows.map((r: any) => r.id), userId);
    const items = rows.map((r: any) => toAnnouncementDTO(r, authors.get(r.user_id), agg.get(r.id)!, userId));
    const nextCursor = rows.length === pageSize ? rows[rows.length - 1]?.created_at ?? null : null;
    return json({ items, nextCursor });
  }

  // /announcement/comments/:id (patch/delete comment) — checked before the generic :id branch
  if (segments[0] === "comments" && segments[1]) {
    const commentId = segments[1];
    if (!userId) return json({ error: "Not authenticated" }, 401);
    const { data: row } = await supabase.from("comments").select("user_id").eq("id", commentId).maybeSingle();
    if (!row) return json({ error: "Not found" }, 404);

    if (req.method === "PATCH") {
      if (row.user_id !== userId) return json({ error: "Only the author can edit this comment." }, 403);
      const body = await req.json().catch(() => ({}));
      const { data: updated, error } = await supabase
        .from("comments").update({ content: body.content, updated_at: new Date().toISOString() })
        .eq("id", commentId).select("*").single();
      if (error) return json({ error: error.message }, 500);
      const authors = await authorLookup(supabase, [updated.user_id]);
      return json(toCommentDTO(updated, authors.get(updated.user_id), userId));
    }
    if (req.method === "DELETE") {
      if (row.user_id !== userId) return json({ error: "Only the author can delete this comment." }, 403);
      await supabase.from("comments").delete().eq("id", commentId);
      return new Response(null, { status: 204, headers: corsHeaders });
    }
  }

  const id = segments[0];
  if (!id) return json({ error: "Not found" }, 404);

  // /announcement/:id/comments
  if (segments[1] === "comments") {
    if (req.method === "POST") {
      if (!userId) return json({ error: "Not authenticated" }, 401);
      const { data: exists } = await supabase.from("announcements").select("id").eq("id", id).maybeSingle();
      if (!exists) return json({ error: "Not found" }, 404);
      const body = await req.json().catch(() => ({}));
      const { data, error } = await supabase
        .from("comments").insert({ announcement_id: id, user_id: userId, content: body.content })
        .select("*").single();
      if (error) return json({ error: error.message }, 500);
      const authors = await authorLookup(supabase, [userId]);
      return json(toCommentDTO(data, authors.get(userId), userId), 201);
    }
    if (req.method === "GET") {
      const { data: exists } = await supabase.from("announcements").select("id").eq("id", id).maybeSingle();
      if (!exists) return json({ error: "Not found" }, 404);
      const { data, error } = await supabase
        .from("comments").select("*").eq("announcement_id", id).order("created_at", { ascending: true });
      if (error) return json({ error: error.message }, 500);
      const rows = data ?? [];
      const authors = await authorLookup(supabase, [...new Set(rows.map((r: any) => r.user_id))]);
      return json(rows.map((r: any) => toCommentDTO(r, authors.get(r.user_id), userId)));
    }
  }

  // /announcement/:id/react
  if (segments[1] === "react" && req.method === "POST") {
    if (!userId) return json({ error: "Not authenticated" }, 401);
    const { data: exists } = await supabase.from("announcements").select("id").eq("id", id).maybeSingle();
    if (!exists) return json({ error: "Not found" }, 404);
    const body = await req.json().catch(() => ({}));
    const type = body.type as ReactionType;

    const { data: existing } = await supabase
      .from("reactions").select("id, type").eq("announcement_id", id).eq("user_id", userId).maybeSingle();

    if (!existing) {
      await supabase.from("reactions").insert({ announcement_id: id, user_id: userId, type });
    } else if (existing.type === type) {
      await supabase.from("reactions").delete().eq("id", existing.id);
    } else {
      await supabase.from("reactions").update({ type }).eq("id", existing.id);
    }
    const toggled = !existing ? "added" : existing.type === type ? "removed" : "switched";
    const agg = await reactionAggregates(supabase, [id], userId);
    const result = agg.get(id)!;
    return json({ toggled, reactions: result.reactions, myReaction: result.myReaction });
  }

  // /announcement/:id (GET/PATCH/DELETE)
  if (segments.length === 1) {
    if (req.method === "GET") {
      const { data: row } = await supabase.from("announcements").select("*").eq("id", id).maybeSingle();
      if (!row) return json({ error: "Not found" }, 404);
      const authors = await authorLookup(supabase, [row.user_id]);
      const agg = await reactionAggregates(supabase, [id], userId);
      return json(toAnnouncementDTO(row, authors.get(row.user_id), agg.get(id)!, userId));
    }
    if (req.method === "PATCH") {
      if (!userId) return json({ error: "Not authenticated" }, 401);
      const { data: row } = await supabase.from("announcements").select("*").eq("id", id).maybeSingle();
      if (!row) return json({ error: "Not found" }, 404);
      if (row.user_id !== userId) return json({ error: "Only the author can change this post." }, 403);
      const patch = await req.json().catch(() => ({}));
      const next = {
        content: patch.content ?? row.content,
        media_url: patch.mediaUrl === undefined ? row.media_url : patch.mediaUrl,
        media_type: patch.mediaType === undefined ? row.media_type : patch.mediaType,
        updated_at: new Date().toISOString(),
      };
      const { data: updated, error } = await supabase.from("announcements").update(next).eq("id", id).select("*").single();
      if (error) return json({ error: error.message }, 500);
      const authors = await authorLookup(supabase, [userId]);
      const agg = await reactionAggregates(supabase, [id], userId);
      return json(toAnnouncementDTO(updated, authors.get(userId), agg.get(id)!, userId));
    }
    if (req.method === "DELETE") {
      if (!userId) return json({ error: "Not authenticated" }, 401);
      const { data: row } = await supabase.from("announcements").select("user_id").eq("id", id).maybeSingle();
      if (!row) return json({ error: "Not found" }, 404);
      if (row.user_id !== userId) return json({ error: "Only the author can delete this post." }, 403);
      await supabase.from("announcements").delete().eq("id", id);
      return new Response(null, { status: 204, headers: corsHeaders });
    }
  }

  return json({ error: "Not found" }, 404);
});
