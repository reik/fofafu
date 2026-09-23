// fofafu_vault/features/moderation-report-block.md
//
// Routes (relative to the function base URL):
//   POST   /moderation/reports                  -> createReport
//   POST   /moderation/blocks                    -> createBlock
//   GET    /moderation/blocks                    -> listBlocks (the caller's own blocks only)
//   DELETE /moderation/blocks/:blockedFamilyId   -> deleteBlock (unblock)
//
// reporterId / blockerFamilyId / createdAt are always server-derived from
// the caller's own auth.uid() (or a families lookup off it) -- never
// accepted from the request body (dispatch contract A/B). Report and block
// are fully independent: nothing in this file ever writes to both tables in
// the same handler (contract F) -- createReport only ever touches `reports`,
// createBlock/deleteBlock only ever touch `blocks`.
//
// This file does NOT implement "blocked family is invisible to the
// blocker" for feed/threads/search -- that enforcement lives in
// supabase/migrations/20260904000000_moderation_reports_blocks.sql (RLS, for
// announcements/comments/messages) and in community/index.ts + search/index.ts
// (query-level exclusion, for the `families` rows themselves -- see those
// files' comments for why RLS can't be used there). This function only owns
// the report/block/unblock mutation surface itself.
//
// DM composer direction (raised as an open contract question by ui-designer
// in ### Visual §6, "Handoff — frontend-dev"): confirmed here as
// inbound-only. Blocking stops the blocked family's NEW inbound messages
// (enforced by the RLS policy in the migration above); it does NOT close
// the blocker's own outbound channel -- A can still message B after
// blocking them. This matches this dispatch's own contract E wording ("only
// NEW inbound messages from B are prevented"), the resolved DM Open
// Question's literal text, and ux-writer's already-landed
// dm.blocked.banner.body copy ("this does not claim the blocker's own
// outgoing is affected"). Two concrete, actionable consequences for
// frontend-dev: (1) ui-designer's Visual §1.5 "Variant B" (composer stays,
// inbound-only banner) is the one that matches this backend behavior, not
// their tentatively-recommended "Variant A" (composer fully replaced); (2)
// "Message this family" on a blocked family's profile page should stay
// enabled, not hidden/disabled.
import { corsHeaders, json, supabaseForRequest } from "../_shared/client.ts";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TARGET_TYPES = ["announcement", "comment", "message"] as const;
type TargetType = typeof TARGET_TYPES[number];
const TARGET_TABLES: Record<TargetType, string> = {
  announcement: "announcements",
  comment: "comments",
  message: "messages",
};

// Matches ux-writer's landed ### Microcopy "Stored values" line exactly
// (dispatch contract C): "unkind | privacy | unrelated | other. Single
// lowercase words, matching this codebase's existing enum convention." This
// is deliberately a plain, freely-editable array, NOT a DB CHECK/ENUM (see
// the migration) -- if the category set changes again, this is a one-line
// code change with no migration required.
const REPORT_CATEGORIES = ["unkind", "privacy", "unrelated", "other"] as const;
type ReportCategory = typeof REPORT_CATEGORIES[number];

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function validTargetType(value: unknown): TargetType | null {
  return (TARGET_TYPES as readonly string[]).includes(value as string) ? (value as TargetType) : null;
}
function validCategory(value: unknown): ReportCategory | null {
  return (REPORT_CATEGORIES as readonly string[]).includes(value as string) ? (value as ReportCategory) : null;
}
// undefined = invalid shape (not a string, or over the length cap);
// null = valid "no note provided" -- same undefined-vs-null convention as
// announcement/index.ts's validMediaUrl.
function validNote(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length > 1000) return undefined;
  return trimmed.length === 0 ? null : trimmed;
}

// deno-lint-ignore no-explicit-any
function toReportDTO(row: any) {
  return {
    id: row.id,
    reporterId: row.reporter_id,
    targetType: row.target_type,
    targetId: row.target_id,
    category: row.category,
    note: row.note,
    createdAt: row.created_at,
  };
}
// deno-lint-ignore no-explicit-any
function toBlockDTO(row: any) {
  return {
    blockerFamilyId: row.blocker_family_id,
    blockedFamilyId: row.blocked_family_id,
    createdAt: row.created_at,
  };
}

async function myFamilyId(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await supabase.from("families").select("id").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new HttpError(404, "Family not found");
  return (data as { id: string }).id;
}

// blockedFamilyId accepts either a families.id OR the family owner's
// auth.users id -- same dual-lookup convenience family/index.ts's own GET
// handler already established ("target may be a family id or an owner's
// user id"). Concrete motivation: ui-designer's landed ### Visual spec
// (§1.3) has ModerationMenu's row-level "Block the {name} family" item
// firing straight off an announcement/comment DTO's `authorId`, which is a
// USER id (toAnnouncementDTO/toCommentDTO: `authorId: row.user_id`), not a
// family id -- without this, frontend-dev would need an extra round-trip
// (GET /family/:authorId) just to resolve one before every such call.
async function resolveFamily(supabase: SupabaseClient, idOrUserId: string): Promise<{ id: string } | null> {
  const { data: byId, error: byIdErr } = await supabase
    .from("families").select("id").eq("id", idOrUserId).maybeSingle();
  if (byIdErr) throw new Error(byIdErr.message);
  if (byId) return byId as { id: string };
  const { data: byUser, error: byUserErr } = await supabase
    .from("families").select("id").eq("user_id", idOrUserId).maybeSingle();
  if (byUserErr) throw new Error(byUserErr.message);
  return (byUser as { id: string } | null) ?? null;
}

interface CreateReportBody {
  targetType?: unknown;
  targetId?: unknown;
  category?: unknown;
  note?: unknown;
}

async function createReport(supabase: SupabaseClient, userId: string, body: CreateReportBody) {
  const targetType = validTargetType(body.targetType);
  if (!targetType) throw new HttpError(400, "targetType must be one of announcement, comment, message");
  if (typeof body.targetId !== "string" || !UUID_RE.test(body.targetId)) {
    throw new HttpError(400, "targetId must be a valid id");
  }
  const category = validCategory(body.category);
  if (!category) throw new HttpError(400, `category must be one of ${REPORT_CATEGORIES.join(", ")}`);
  const note = validNote(body.note);
  if (note === undefined) throw new HttpError(400, "note must be a string of 1000 characters or fewer");

  // Existence -- and, for a DM, "is the reporter actually a party to it" --
  // is enforced by re-reading the target through the caller's own
  // forwarded-auth client. messages' RLS already restricts SELECT to
  // sender/receiver, so a family that isn't part of a DM simply can't see
  // it here either, with no extra check needed: the row comes back null and
  // this 404s exactly as if the id didn't exist.
  const table = TARGET_TABLES[targetType];
  const { data: target, error: targetErr } = await supabase
    .from(table).select("id").eq("id", body.targetId).maybeSingle();
  if (targetErr) throw new Error(targetErr.message);
  if (!target) throw new HttpError(404, "That content couldn't be found.");

  const { data, error } = await supabase
    .from("reports")
    .insert({ reporter_id: userId, target_type: targetType, target_id: body.targetId, category, note })
    .select("*").single();
  if (error) throw new Error(error.message);
  return toReportDTO(data);
}

interface CreateBlockBody {
  blockedFamilyId?: unknown;
}

async function createBlock(
  supabase: SupabaseClient,
  userId: string,
  body: CreateBlockBody,
): Promise<{ dto: ReturnType<typeof toBlockDTO>; created: boolean }> {
  if (typeof body.blockedFamilyId !== "string" || !UUID_RE.test(body.blockedFamilyId)) {
    throw new HttpError(400, "blockedFamilyId must be a valid id");
  }
  const blockerFamilyId = await myFamilyId(supabase, userId);
  const target = await resolveFamily(supabase, body.blockedFamilyId);
  if (!target) throw new HttpError(404, "Family not found");
  const blockedFamilyId = target.id;
  if (blockedFamilyId === blockerFamilyId) throw new HttpError(400, "You can't block your own family.");

  // Idempotent: re-blocking an already-blocked family is a no-op success
  // (200, not a duplicate row / raw 500) -- a client retry or a double-tap
  // on the block button shouldn't surface a unique-constraint error.
  const { data: existing, error: existingErr } = await supabase
    .from("blocks").select("*")
    .eq("blocker_family_id", blockerFamilyId).eq("blocked_family_id", blockedFamilyId).maybeSingle();
  if (existingErr) throw new Error(existingErr.message);
  if (existing) return { dto: toBlockDTO(existing), created: false };

  const { data, error } = await supabase
    .from("blocks").insert({ blocker_family_id: blockerFamilyId, blocked_family_id: blockedFamilyId })
    .select("*").single();
  if (error) {
    // 23505 = unique_violation -- a race with a concurrent identical block
    // request from the same family. Same idempotent treatment as the
    // pre-check above: fetch and return the now-existing row instead of a
    // raw 500.
    if (error.code === "23505") {
      const { data: raced, error: racedErr } = await supabase
        .from("blocks").select("*")
        .eq("blocker_family_id", blockerFamilyId).eq("blocked_family_id", blockedFamilyId).single();
      if (racedErr) throw new Error(racedErr.message);
      return { dto: toBlockDTO(raced), created: false };
    }
    throw new Error(error.message);
  }
  return { dto: toBlockDTO(data), created: true };
}

async function deleteBlock(supabase: SupabaseClient, userId: string, blockedFamilyId: string): Promise<void> {
  const blockerFamilyId = await myFamilyId(supabase, userId);
  const { error } = await supabase
    .from("blocks").delete()
    .eq("blocker_family_id", blockerFamilyId).eq("blocked_family_id", blockedFamilyId);
  if (error) throw new Error(error.message);
  // Idempotent: unblocking a family that was never blocked (or already
  // unblocked) is still treated as success -- the end state the caller
  // wants ("not blocked") is reached either way, no existence check needed.
}

async function listBlocks(supabase: SupabaseClient) {
  // No blockerFamilyId filter needed here -- `blocks`' own RLS policy
  // already restricts SELECT to rows where the caller's own family is the
  // blocker (see the migration), so this always returns exactly "my own
  // blocks," never another family's.
  const { data, error } = await supabase.from("blocks").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toBlockDTO);
}

// Pulled out of Deno.serve so tests can call it directly with a fake
// SupabaseClient instead of needing a live network + Postgres, same pattern
// as supabase/functions/admin/index.ts's handleRequest.
export async function handleRequest(req: Request, supabase: SupabaseClient): Promise<Response> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;
  if (!userId) return json({ error: "Not authenticated" }, 401);

  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean).slice(1);
  // segments: ["reports"] | ["blocks"] | ["blocks", ":blockedFamilyId"]

  try {
    if (req.method === "POST" && segments.length === 1 && segments[0] === "reports") {
      const body = await req.json().catch(() => ({}));
      return json(await createReport(supabase, userId, body), 201);
    }
    if (req.method === "POST" && segments.length === 1 && segments[0] === "blocks") {
      const body = await req.json().catch(() => ({}));
      const { dto, created } = await createBlock(supabase, userId, body);
      return json(dto, created ? 201 : 200);
    }
    if (req.method === "GET" && segments.length === 1 && segments[0] === "blocks") {
      return json(await listBlocks(supabase));
    }
    if (req.method === "DELETE" && segments.length === 2 && segments[0] === "blocks") {
      if (!UUID_RE.test(segments[1])) return json({ error: "Invalid blockedFamilyId" }, 400);
      await deleteBlock(supabase, userId, segments[1]);
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    return json({ error: "Not found" }, 404);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    return json({ error: e instanceof Error ? e.message : "Internal error" }, 500);
  }
}

// Guarded so importing this module from a test doesn't also try to bind a
// real network port -- see admin/index.ts's identical guard comment.
if (import.meta.main) {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    const supabase = supabaseForRequest(req);
    return handleRequest(req, supabase);
  });
}
