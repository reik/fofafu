// Ports backend/src/controllers/message.controller.ts + message.routes.ts.
// Routes (relative to the function base URL):
//   POST /message                      -> sendMessage
//   GET  /message/threads              -> listThreads
//   GET  /message/unread/count         -> unreadCount
//   GET  /message/threads/:userId      -> getThread
//   POST /message/threads/:userId/read -> markThreadRead
import { corsHeaders, json, supabaseForRequest } from "../_shared/client.ts";

interface MessageRow {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  read: boolean;
  created_at: string;
}

function toMessageDTO(
  row: MessageRow,
  self: string,
  names: Map<string, string | null>,
): Record<string, unknown> {
  return {
    id: row.id,
    from: row.sender_id,
    fromName: names.get(row.sender_id) ?? null,
    to: row.receiver_id,
    toName: names.get(row.receiver_id) ?? null,
    content: row.content,
    read: row.read,
    createdAt: row.created_at,
    mine: row.sender_id === self,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = supabaseForRequest(req);
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;
  if (!userId) return json({ error: "Not authenticated" }, 401);

  const url = new URL(req.url);
  // segments look like ["message"], ["message","threads"],
  // ["message","threads","<id>"], ["message","threads","<id>","read"],
  // ["message","unread","count"] — drop the leading function-name segment.
  const segments = url.pathname.split("/").filter(Boolean).slice(1);

  if (req.method === "POST" && segments.length === 0) {
    const body = await req.json().catch(() => ({}));
    const to = typeof body.to === "string" ? body.to : null;
    const content = typeof body.content === "string" ? body.content : null;
    if (!to || !content) return json({ error: "to and content are required" }, 400);
    if (to === userId) return json({ error: "You can't send a message to yourself." }, 400);

    const { data: inserted, error: insertErr } = await supabase
      .from("messages")
      .insert({ sender_id: userId, receiver_id: to, content })
      .select("id, sender_id, receiver_id, content, read, created_at")
      .single();
    if (insertErr) {
      // FK violation (23503) means `to` isn't a real auth.users id.
      if (insertErr.code === "23503") return json({ error: "We couldn't find that person." }, 404);
      return json({ error: insertErr.message }, 500);
    }
    const row = inserted as MessageRow;
    const names = await namesFor(supabase, [row.sender_id, row.receiver_id]);
    return json(toMessageDTO(row, userId, names), 201);
  }

  if (req.method === "GET" && segments.length === 2 && segments[0] === "unread" && segments[1] === "count") {
    const { count, error } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("receiver_id", userId)
      .eq("read", false);
    if (error) return json({ error: error.message }, 500);
    return json({ count: count ?? 0 });
  }

  if (req.method === "GET" && segments.length === 1 && segments[0] === "threads") {
    const { data: rows, error } = await supabase
      .from("messages")
      .select("id, sender_id, receiver_id, content, read, created_at")
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order("created_at", { ascending: false });
    if (error) return json({ error: error.message }, 500);

    const partners = new Map<string, { last_content: string; last_at: string; unread_count: number }>();
    for (const r of (rows ?? []) as MessageRow[]) {
      const partnerId = r.sender_id === userId ? r.receiver_id : r.sender_id;
      if (!partners.has(partnerId)) {
        partners.set(partnerId, { last_content: r.content, last_at: r.created_at, unread_count: 0 });
      }
      if (r.receiver_id === userId && r.sender_id === partnerId && !r.read) {
        partners.get(partnerId)!.unread_count += 1;
      }
    }
    const names = await namesFor(supabase, [...partners.keys()]);
    const result = [...partners.entries()]
      .sort((a, b) => (a[1].last_at < b[1].last_at ? 1 : -1))
      .map(([partnerId, t]) => ({
        partnerId,
        partnerName: names.get(partnerId) ?? null,
        lastMessage: t.last_content,
        lastAt: t.last_at,
        unreadCount: t.unread_count,
      }));
    return json(result);
  }

  if (req.method === "GET" && segments.length === 2 && segments[0] === "threads") {
    const partnerId = segments[1];
    const { data: rows, error } = await supabase
      .from("messages")
      .select("id, sender_id, receiver_id, content, read, created_at")
      .or(
        `and(sender_id.eq.${userId},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${userId})`,
      )
      .order("created_at", { ascending: true });
    if (error) return json({ error: error.message }, 500);
    const names = await namesFor(supabase, [userId, partnerId]);
    return json(((rows ?? []) as MessageRow[]).map((r) => toMessageDTO(r, userId, names)));
  }

  if (req.method === "POST" && segments.length === 3 && segments[0] === "threads" && segments[2] === "read") {
    const partnerId = segments[1];
    const { data, error } = await supabase
      .from("messages")
      .update({ read: true })
      .eq("receiver_id", userId)
      .eq("sender_id", partnerId)
      .eq("read", false)
      .select("id");
    if (error) return json({ error: error.message }, 500);
    return json({ marked: (data ?? []).length });
  }

  return json({ error: "Not found" }, 404);
});

// deno-lint-ignore no-explicit-any
async function namesFor(supabase: any, userIds: string[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return new Map();
  const { data } = await supabase.from("families").select("user_id, name").in("user_id", unique);
  const map = new Map<string, string | null>();
  for (const id of unique) map.set(id, null);
  for (const row of (data ?? []) as { user_id: string; name: string }[]) map.set(row.user_id, row.name);
  return map;
}
