// fofafu_vault/features/admin-access.md
// Routes (relative to the function base URL):
//   GET   /admin/users                          -> listUsers
//   GET   /admin/users/:id                       -> getUser
//   PATCH /admin/users/:id                       -> updateUser (families fields + optional email)
//   POST  /admin/users/:id/ban                   -> setUserBan ({ hours?, unban? })
//   POST  /admin/users/:id/reset-password        -> forcePasswordReset
//   GET   /admin/content/:table                  -> listContent (announcements|comments|reactions)
//   PATCH /admin/content/:table/:id              -> updateContent (announcements|comments only)
//   DELETE /admin/content/:table/:id             -> deleteContent
//   GET   /admin/messages/:userIdA/:userIdB      -> getConversation
//   PATCH /admin/messages/:id                    -> updateMessage
//   DELETE /admin/messages/:id                   -> deleteMessage
//
// Every route calls rpc('is_admin') and 403s before touching any data (see
// handleRequest's single gate below) -- that RLS-backed check, not anything
// the frontend does, is the actual security boundary. Table reads/writes use
// the caller's own forwarded-auth client (supabaseForRequest), relying on the
// admin RLS policies added in 20260823000000_admin_access.sql -- NOT a
// service-role key. A service-role client is constructed (serviceRoleClient)
// only inside the handlers that need Supabase Auth's own admin API
// (email/ban/password-reset), only after the is_admin() gate has already
// passed, and never returned to the caller.
import { corsHeaders, json, supabaseForRequest } from "../_shared/client.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTENT_TABLES = new Set(["announcements", "comments", "reactions"]);
const CONTENT_SELECT: Record<string, string> = {
  announcements: "id, user_id, content, media_url, media_type, created_at, updated_at",
  comments: "id, announcement_id, user_id, content, created_at, updated_at",
  reactions: "id, announcement_id, user_id, type, created_at",
};

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function serviceRoleClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function isBanned(bannedUntil: string | null | undefined): boolean {
  if (!bannedUntil) return false;
  const t = Date.parse(bannedUntil);
  return !Number.isNaN(t) && t > Date.now();
}

// Every admin mutation is expected to log in the same request (acceptance
// criterion: "No admin write path skips the audit log"). The table write and
// this insert are two separate PostgREST calls, not one DB transaction, so
// true atomicity would need a wrapping stored procedure per action -- out of
// scope for v1. If the log write itself fails we surface a loud 500 rather
// than silently succeeding with no trail, so a real failure here can't pass
// unnoticed.
async function writeAuditLog(
  supabase: SupabaseClient,
  adminUserId: string,
  action: string,
  targetType: string,
  targetId: string | null,
  before: unknown,
  after: unknown,
): Promise<void> {
  const { error } = await supabase.from("admin_audit_log").insert({
    admin_user_id: adminUserId,
    action,
    target_type: targetType,
    target_id: targetId,
    before: before ?? null,
    after: after ?? null,
  });
  if (error) throw new Error(`Action succeeded but audit log write failed: ${error.message}`);
}

async function listUsers(supabase: SupabaseClient, getServiceRoleClient: () => SupabaseClient) {
  const { data: families, error } = await supabase
    .from("families")
    .select("id, user_id, name, bio, kid_count, avatar_url, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const admin = getServiceRoleClient();
  const byId = new Map<string, { email: string | undefined; bannedUntil: string | null | undefined }>();
  const perPage = 200;
  for (let page = 1; ; page += 1) {
    const { data, error: listErr } = await admin.auth.admin.listUsers({ page, perPage });
    if (listErr) throw new Error(listErr.message);
    for (const u of data.users) byId.set(u.id, { email: u.email, bannedUntil: u.banned_until });
    if (data.users.length < perPage) break;
  }

  return (families ?? []).map((f) => ({
    id: f.user_id,
    familyId: f.id,
    name: f.name,
    bio: f.bio,
    kidCount: f.kid_count,
    avatarUrl: f.avatar_url,
    createdAt: f.created_at,
    email: byId.get(f.user_id)?.email ?? null,
    banned: isBanned(byId.get(f.user_id)?.bannedUntil),
  }));
}

async function getUser(supabase: SupabaseClient, userId: string, getServiceRoleClient: () => SupabaseClient) {
  const { data: family, error } = await supabase
    .from("families")
    .select("id, user_id, name, bio, kid_count, avatar_url, created_at, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!family) throw new HttpError(404, "User not found");

  const admin = getServiceRoleClient();
  const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(userId);
  if (authErr) throw new Error(authErr.message);

  return {
    id: family.user_id,
    familyId: family.id,
    name: family.name,
    bio: family.bio,
    kidCount: family.kid_count,
    avatarUrl: family.avatar_url,
    createdAt: family.created_at,
    updatedAt: family.updated_at,
    email: authUser.user?.email ?? null,
    banned: isBanned(authUser.user?.banned_until),
  };
}

interface UpdateUserBody {
  name?: string;
  bio?: string;
  kidCount?: number | null;
  avatarUrl?: string | null;
  email?: string;
}

async function updateUser(
  supabase: SupabaseClient,
  adminUserId: string,
  userId: string,
  body: UpdateUserBody,
  getServiceRoleClient: () => SupabaseClient,
) {
  const { data: before, error: beforeErr } = await supabase
    .from("families").select("*").eq("user_id", userId).maybeSingle();
  if (beforeErr) throw new Error(beforeErr.message);
  if (!before) throw new HttpError(404, "User not found");

  const familyPatch: Record<string, unknown> = {};
  if (body.name !== undefined) familyPatch.name = body.name;
  if (body.bio !== undefined) familyPatch.bio = body.bio;
  if (body.kidCount !== undefined) familyPatch.kid_count = body.kidCount;
  if (body.avatarUrl !== undefined) familyPatch.avatar_url = body.avatarUrl;

  // Two independent audit-log writes, one per persisted mutation, each
  // immediately after that mutation succeeds -- NOT one deferred call at the
  // end. If the family patch commits but the later email change then fails
  // (a realistic case: duplicate/invalid email), a single combined call
  // would throw before ever logging the family patch, leaving a real,
  // already-persisted mutation with zero audit trail. Every write below is
  // paired with its own log entry before either can be skipped by a later
  // failure.
  if (Object.keys(familyPatch).length > 0) {
    const { data: after, error } = await supabase
      .from("families").update(familyPatch).eq("user_id", userId).select("*").single();
    if (error) throw new Error(error.message);
    await writeAuditLog(supabase, adminUserId, "update_user", "user", userId, before, after);
  }

  // Admin trusted to set a pre-verified address directly -- no re-verification
  // email is sent (see feature file Open Questions; flagged as an assumption).
  if (body.email !== undefined && body.email !== null) {
    if (typeof body.email !== "string") throw new HttpError(400, "email must be a string");
    const admin = getServiceRoleClient();
    const { error } = await admin.auth.admin.updateUserById(userId, { email: body.email, email_confirm: true });
    if (error) throw new Error(error.message);
    await writeAuditLog(supabase, adminUserId, "update_user_email", "user", userId, null, { email: body.email });
  }

  return await getUser(supabase, userId, getServiceRoleClient);
}

async function setUserBan(
  supabase: SupabaseClient,
  adminUserId: string,
  userId: string,
  body: { hours?: number; unban?: boolean },
  getServiceRoleClient: () => SupabaseClient,
) {
  const admin = getServiceRoleClient();
  const { data: beforeUser, error: beforeErr } = await admin.auth.admin.getUserById(userId);
  if (beforeErr) throw new Error(beforeErr.message);

  const unban = body.unban === true;
  const hours = typeof body.hours === "number" && Number.isFinite(body.hours) ? body.hours : 24 * 365 * 100;

  // Soft delete/ban, not hard delete (feature decision, 2026-08-23): keeps
  // the account's data intact and reversible via unban.
  const banDuration = unban ? "none" : `${hours}h`;
  const { data, error } = await admin.auth.admin.updateUserById(userId, { ban_duration: banDuration });
  if (error) throw new Error(error.message);

  await writeAuditLog(
    supabase,
    adminUserId,
    unban ? "unban_user" : "ban_user",
    "user",
    userId,
    { bannedUntil: beforeUser.user?.banned_until ?? null },
    { bannedUntil: data.user.banned_until ?? null },
  );
  return { id: userId, banned: isBanned(data.user.banned_until) };
}

async function forcePasswordReset(
  supabase: SupabaseClient,
  adminUserId: string,
  userId: string,
  getServiceRoleClient: () => SupabaseClient,
) {
  const admin = getServiceRoleClient();
  const { data: user, error: getErr } = await admin.auth.admin.getUserById(userId);
  if (getErr) throw new Error(getErr.message);
  const email = user.user?.email;
  if (!email) throw new HttpError(404, "User has no email on file");

  // generateLink both mints the recovery token and (given SMTP is configured
  // on the project) sends the email using the project's own recovery
  // template -- the same delivery path a self-service reset would use.
  const { error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  if (error) throw new Error(error.message);

  await writeAuditLog(supabase, adminUserId, "force_password_reset", "user", userId, null, { email });
  return { id: userId, sent: true };
}

async function listContent(supabase: SupabaseClient, table: string) {
  const { data, error } = await supabase
    .from(table)
    .select(CONTENT_SELECT[table])
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function updateContent(
  supabase: SupabaseClient,
  adminUserId: string,
  table: string,
  id: string,
  body: { content?: string },
) {
  if (typeof body.content !== "string") throw new HttpError(400, "content must be a string");
  const { data: before, error: beforeErr } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
  if (beforeErr) throw new Error(beforeErr.message);
  if (!before) throw new HttpError(404, `${table} row not found`);

  const { data: after, error } = await supabase
    .from(table).update({ content: body.content }).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);

  await writeAuditLog(supabase, adminUserId, `update_${table}`, table, id, before, after);
  return after;
}

async function deleteContent(supabase: SupabaseClient, adminUserId: string, table: string, id: string) {
  const { data: before, error: beforeErr } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
  if (beforeErr) throw new Error(beforeErr.message);
  if (!before) throw new HttpError(404, `${table} row not found`);

  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw new Error(error.message);

  await writeAuditLog(supabase, adminUserId, `delete_${table}`, table, id, before, null);
  return { deleted: true };
}

async function getConversation(supabase: SupabaseClient, userA: string, userB: string) {
  const { data, error } = await supabase
    .from("messages")
    .select("id, sender_id, receiver_id, content, read, created_at")
    .or(`and(sender_id.eq.${userA},receiver_id.eq.${userB}),and(sender_id.eq.${userB},receiver_id.eq.${userA})`)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function updateMessage(supabase: SupabaseClient, adminUserId: string, id: string, body: { content?: string }) {
  if (typeof body.content !== "string") throw new HttpError(400, "content must be a string");
  const { data: before, error: beforeErr } = await supabase.from("messages").select("*").eq("id", id).maybeSingle();
  if (beforeErr) throw new Error(beforeErr.message);
  if (!before) throw new HttpError(404, "Message not found");

  const { data: after, error } = await supabase
    .from("messages").update({ content: body.content }).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);

  await writeAuditLog(supabase, adminUserId, "update_message", "message", id, before, after);
  return after;
}

async function deleteMessage(supabase: SupabaseClient, adminUserId: string, id: string) {
  const { data: before, error: beforeErr } = await supabase.from("messages").select("*").eq("id", id).maybeSingle();
  if (beforeErr) throw new Error(beforeErr.message);
  if (!before) throw new HttpError(404, "Message not found");

  const { error } = await supabase.from("messages").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await writeAuditLog(supabase, adminUserId, "delete_message", "message", id, before, null);
  return { deleted: true };
}

// Pulled out of Deno.serve so tests can call it directly with a fake/stub
// SupabaseClient instead of needing a live network + Postgres. The
// service-role client is a factory, not a value, for the same reason: tests
// substitute a fake, production leaves the default (real serviceRoleClient,
// constructed lazily so it's never built at all for non-admin/read-only
// requests that never need it).
export async function handleRequest(
  req: Request,
  supabase: SupabaseClient,
  getServiceRoleClient: () => SupabaseClient = serviceRoleClient,
): Promise<Response> {
  const { data: userData } = await supabase.auth.getUser();
  const adminUserId = userData.user?.id ?? null;
  if (!adminUserId) return json({ error: "Not authenticated" }, 401);

  const { data: isAdminResult, error: isAdminErr } = await supabase.rpc("is_admin");
  if (isAdminErr || isAdminResult !== true) return json({ error: "Forbidden" }, 403);

  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean).slice(1);

  try {
    if (req.method === "GET" && segments.length === 1 && segments[0] === "users") {
      return json(await listUsers(supabase, getServiceRoleClient));
    }
    if (segments[0] === "users" && segments.length === 2 && UUID_RE.test(segments[1])) {
      if (req.method === "GET") return json(await getUser(supabase, segments[1], getServiceRoleClient));
      if (req.method === "PATCH") {
        const body = await req.json().catch(() => ({}));
        return json(await updateUser(supabase, adminUserId, segments[1], body, getServiceRoleClient));
      }
    }
    if (segments[0] === "users" && segments.length === 2 && !UUID_RE.test(segments[1])) {
      return json({ error: "Invalid userId" }, 400);
    }
    if (req.method === "POST" && segments[0] === "users" && segments.length === 3 && segments[2] === "ban") {
      if (!UUID_RE.test(segments[1])) return json({ error: "Invalid userId" }, 400);
      const body = await req.json().catch(() => ({}));
      return json(await setUserBan(supabase, adminUserId, segments[1], body, getServiceRoleClient));
    }
    if (
      req.method === "POST" && segments[0] === "users" && segments.length === 3 &&
      segments[2] === "reset-password"
    ) {
      if (!UUID_RE.test(segments[1])) return json({ error: "Invalid userId" }, 400);
      return json(await forcePasswordReset(supabase, adminUserId, segments[1], getServiceRoleClient));
    }

    if (
      req.method === "GET" && segments[0] === "content" && segments.length === 2 && CONTENT_TABLES.has(segments[1])
    ) {
      return json(await listContent(supabase, segments[1]));
    }
    if (segments[0] === "content" && segments.length === 3 && CONTENT_TABLES.has(segments[1])) {
      const table = segments[1];
      const id = segments[2];
      if (!UUID_RE.test(id)) return json({ error: "Invalid id" }, 400);
      if (req.method === "PATCH" && table !== "reactions") {
        const body = await req.json().catch(() => ({}));
        return json(await updateContent(supabase, adminUserId, table, id, body));
      }
      if (req.method === "DELETE") return json(await deleteContent(supabase, adminUserId, table, id));
    }

    if (req.method === "GET" && segments[0] === "messages" && segments.length === 3) {
      const [, userA, userB] = segments;
      if (!UUID_RE.test(userA) || !UUID_RE.test(userB)) return json({ error: "Invalid userId" }, 400);
      return json(await getConversation(supabase, userA, userB));
    }
    if (segments[0] === "messages" && segments.length === 2 && UUID_RE.test(segments[1])) {
      if (req.method === "PATCH") {
        const body = await req.json().catch(() => ({}));
        return json(await updateMessage(supabase, adminUserId, segments[1], body));
      }
      if (req.method === "DELETE") return json(await deleteMessage(supabase, adminUserId, segments[1]));
    }

    return json({ error: "Not found" }, 404);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    return json({ error: e instanceof Error ? e.message : "Internal error" }, 500);
  }
}

// Guarded so importing this module from a test doesn't also try to bind a
// real network port -- Supabase's edge-runtime executes this file as the
// entry point (import.meta.main === true) in actual deployment, so this is
// a no-op behavior change there.
if (import.meta.main) {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    const supabase = supabaseForRequest(req);
    return handleRequest(req, supabase);
  });
}
