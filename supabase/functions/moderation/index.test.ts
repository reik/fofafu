// Unit tests for handleRequest's routing/validation/authorization logic.
// Everything here runs against fake clients (no network, no Postgres) --
// same caveat as admin/index.test.ts: this repo has no local-Postgres/pgTAP
// harness yet, so the RLS policies in
// 20260904000000_moderation_reports_blocks.sql (including the RESTRICTIVE
// block-visibility policies on announcements/comments/messages) are NOT
// exercised by these tests; they're reviewed manually (see the migration's
// own comments) and should be verified against a real/staging project
// before this ships. What IS covered here: the 401 gate, that
// reporterId/blockerFamilyId are always server-derived (never taken from
// the request body), category/targetType/note validation, the DM-target
// 404-not-leak path, and block/unblock idempotency.
import { assertEquals } from "jsr:@std/assert@1";
import { handleRequest } from "./index.ts";
// deno-lint-ignore no-explicit-any
type Any = any;

interface Resp {
  data: unknown;
  error: unknown;
}

function makeFakeSupabase(opts: { userId: string | null; responses: Record<string, Resp[]> }) {
  const responses = opts.responses;
  const inserts: Record<string, Record<string, unknown>[]> = {};

  function nextResponse(table: string): Resp {
    const queue = responses[table];
    if (!queue || queue.length === 0) {
      throw new Error(`No fake response queued for table "${table}"`);
    }
    return queue.shift()!;
  }

  function builder(table: string): Any {
    const chain: Any = {};
    for (const m of ["select", "eq", "order", "limit", "maybeSingle", "single"]) {
      chain[m] = () => chain;
    }
    chain.delete = () => chain;
    chain.insert = (payload: Record<string, unknown>) => {
      (inserts[table] ??= []).push(payload);
      return chain;
    };
    chain.then = (resolve: (v: unknown) => void) => resolve(nextResponse(table));
    return chain;
  }

  const fake: Any = {
    auth: { getUser: () => Promise.resolve({ data: { user: opts.userId ? { id: opts.userId } : null } }) },
    from: (table: string) => builder(table),
    inserts,
  };
  return fake;
}

// Same segment shape note as admin/index.test.ts: Supabase's edge-runtime
// strips /functions/v1 before the function sees req.url, so a deployed call
// to .../functions/v1/moderation/blocks arrives here with pathname
// "/moderation/blocks". handleRequest's .slice(1) drops the leading
// "moderation" segment.
function req(method: string, path: string, body?: unknown): Request {
  return new Request(`https://x.supabase.co/moderation${path}`, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const FAMILY_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const FAMILY_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const ANNOUNCEMENT_ID = "11111111-1111-1111-1111-111111111111";

Deno.test("returns 401 when there is no authenticated user", async () => {
  const supabase = makeFakeSupabase({ userId: null, responses: {} });
  const res = await handleRequest(req("POST", "/reports", {}), supabase);
  assertEquals(res.status, 401);
});

Deno.test("unknown route returns 404", async () => {
  const supabase = makeFakeSupabase({ userId: "u-1", responses: {} });
  const res = await handleRequest(req("GET", "/nonsense"), supabase);
  assertEquals(res.status, 404);
});

// --- reports ---------------------------------------------------------------

Deno.test("POST /reports rejects an invalid targetType before touching any table", async () => {
  const supabase = makeFakeSupabase({ userId: "u-1", responses: {} });
  const res = await handleRequest(
    req("POST", "/reports", { targetType: "user", targetId: ANNOUNCEMENT_ID, category: "other" }),
    supabase,
  );
  assertEquals(res.status, 400);
});

Deno.test("POST /reports rejects an invalid category", async () => {
  const supabase = makeFakeSupabase({ userId: "u-1", responses: {} });
  const res = await handleRequest(
    req("POST", "/reports", { targetType: "announcement", targetId: ANNOUNCEMENT_ID, category: "spam" }),
    supabase,
  );
  assertEquals(res.status, 400);
});

Deno.test("POST /reports rejects a non-UUID targetId", async () => {
  const supabase = makeFakeSupabase({ userId: "u-1", responses: {} });
  const res = await handleRequest(
    req("POST", "/reports", { targetType: "announcement", targetId: "not-a-uuid", category: "other" }),
    supabase,
  );
  assertEquals(res.status, 400);
});

Deno.test("POST /reports rejects a note over 1000 characters", async () => {
  const supabase = makeFakeSupabase({ userId: "u-1", responses: {} });
  const res = await handleRequest(
    req("POST", "/reports", {
      targetType: "announcement",
      targetId: ANNOUNCEMENT_ID,
      category: "other",
      note: "x".repeat(1001),
    }),
    supabase,
  );
  assertEquals(res.status, 400);
});

Deno.test("POST /reports 404s when the target doesn't exist (or isn't visible to the reporter)", async () => {
  // Same fake-response shape covers both "the id is fake" and "this is a DM
  // the reporter isn't a party to, so RLS already hid it" -- from this
  // function's point of view they're indistinguishable, which is the point.
  const supabase = makeFakeSupabase({
    userId: "u-1",
    responses: { announcements: [{ data: null, error: null }] },
  });
  const res = await handleRequest(
    req("POST", "/reports", { targetType: "announcement", targetId: ANNOUNCEMENT_ID, category: "other" }),
    supabase,
  );
  assertEquals(res.status, 404);
});

Deno.test("POST /reports creates a report with a server-derived reporterId, ignoring any client-supplied one", async () => {
  const created = {
    id: "r-1",
    reporter_id: "u-1",
    target_type: "announcement",
    target_id: ANNOUNCEMENT_ID,
    category: "other",
    note: "not okay",
    created_at: "2026-09-04T00:00:00Z",
  };
  const supabase = makeFakeSupabase({
    userId: "u-1",
    responses: {
      announcements: [{ data: { id: ANNOUNCEMENT_ID }, error: null }],
      reports: [{ data: created, error: null }],
    },
  });
  const res = await handleRequest(
    req("POST", "/reports", {
      targetType: "announcement",
      targetId: ANNOUNCEMENT_ID,
      category: "other",
      note: "not okay",
      reporterId: "someone-else", // must be ignored -- never trusted from the body
      createdAt: "2000-01-01T00:00:00Z", // must be ignored -- server-derived
    }),
    supabase,
  );
  assertEquals(res.status, 201);
  const body = await res.json();
  assertEquals(body, {
    id: "r-1",
    reporterId: "u-1",
    targetType: "announcement",
    targetId: ANNOUNCEMENT_ID,
    category: "other",
    note: "not okay",
    createdAt: "2026-09-04T00:00:00Z",
  });
  assertEquals(supabase.inserts.reports.length, 1);
  assertEquals(supabase.inserts.reports[0].reporter_id, "u-1");
  assertEquals(supabase.inserts.reports[0].note, "not okay");
});

Deno.test("POST /reports stores note as null when omitted", async () => {
  const created = {
    id: "r-2",
    reporter_id: "u-1",
    target_type: "comment",
    target_id: ANNOUNCEMENT_ID,
    category: "privacy",
    note: null,
    created_at: "t",
  };
  const supabase = makeFakeSupabase({
    userId: "u-1",
    responses: {
      comments: [{ data: { id: ANNOUNCEMENT_ID }, error: null }],
      reports: [{ data: created, error: null }],
    },
  });
  const res = await handleRequest(
    req("POST", "/reports", { targetType: "comment", targetId: ANNOUNCEMENT_ID, category: "privacy" }),
    supabase,
  );
  assertEquals(res.status, 201);
  assertEquals(supabase.inserts.reports[0].note, null);
});

// --- blocks ------------------------------------------------------------

Deno.test("POST /blocks rejects a missing/invalid blockedFamilyId", async () => {
  const supabase = makeFakeSupabase({ userId: "u-1", responses: {} });
  const res = await handleRequest(req("POST", "/blocks", {}), supabase);
  assertEquals(res.status, 400);
});

Deno.test("POST /blocks rejects self-block", async () => {
  const supabase = makeFakeSupabase({
    userId: "u-1",
    responses: {
      // [0] myFamilyId (blocker), [1] resolveFamily's byId lookup for the
      // target -- both resolve to the caller's own family.
      families: [{ data: { id: FAMILY_A }, error: null }, { data: { id: FAMILY_A }, error: null }],
    },
  });
  const res = await handleRequest(req("POST", "/blocks", { blockedFamilyId: FAMILY_A }), supabase);
  assertEquals(res.status, 400);
});

Deno.test("POST /blocks 404s when the target family doesn't exist by id or by user id", async () => {
  const supabase = makeFakeSupabase({
    userId: "u-1",
    responses: {
      // [0] myFamilyId, [1] resolveFamily's byId lookup (miss), [2]
      // resolveFamily's byUser fallback lookup (also miss).
      families: [
        { data: { id: FAMILY_A }, error: null },
        { data: null, error: null },
        { data: null, error: null },
      ],
    },
  });
  const res = await handleRequest(req("POST", "/blocks", { blockedFamilyId: FAMILY_B }), supabase);
  assertEquals(res.status, 404);
});

Deno.test("POST /blocks resolves blockedFamilyId when it's the target family owner's user id, not a family id", async () => {
  // Concrete regression for the friction point ui-designer's landed ###
  // Visual spec flagged: ModerationMenu's row-level block item only has an
  // announcement/comment DTO's `authorId` (a user id) in hand.
  const created = { blocker_family_id: FAMILY_A, blocked_family_id: FAMILY_B, created_at: "t" };
  const ownerUserId = "dddddddd-dddd-dddd-dddd-dddddddddddd";
  const supabase = makeFakeSupabase({
    userId: "u-1",
    responses: {
      // [0] myFamilyId, [1] resolveFamily's byId lookup (miss, since
      // ownerUserId isn't a families.id), [2] resolveFamily's byUser
      // fallback lookup (hit, resolves to FAMILY_B).
      families: [
        { data: { id: FAMILY_A }, error: null },
        { data: null, error: null },
        { data: { id: FAMILY_B }, error: null },
      ],
      blocks: [{ data: null, error: null }, { data: created, error: null }],
    },
  });
  const res = await handleRequest(req("POST", "/blocks", { blockedFamilyId: ownerUserId }), supabase);
  assertEquals(res.status, 201);
  assertEquals(await res.json(), { blockerFamilyId: FAMILY_A, blockedFamilyId: FAMILY_B, createdAt: "t" });
  assertEquals(supabase.inserts.blocks[0], { blocker_family_id: FAMILY_A, blocked_family_id: FAMILY_B });
});

Deno.test("POST /blocks creates a block with a server-derived blockerFamilyId, ignoring any client-supplied one", async () => {
  const created = { blocker_family_id: FAMILY_A, blocked_family_id: FAMILY_B, created_at: "t" };
  const supabase = makeFakeSupabase({
    userId: "u-1",
    responses: {
      families: [{ data: { id: FAMILY_A }, error: null }, { data: { id: FAMILY_B }, error: null }],
      blocks: [{ data: null, error: null }, { data: created, error: null }],
    },
  });
  const res = await handleRequest(
    req("POST", "/blocks", { blockedFamilyId: FAMILY_B, blockerFamilyId: "someone-else" }),
    supabase,
  );
  assertEquals(res.status, 201);
  assertEquals(await res.json(), { blockerFamilyId: FAMILY_A, blockedFamilyId: FAMILY_B, createdAt: "t" });
  assertEquals(supabase.inserts.blocks.length, 1);
  assertEquals(supabase.inserts.blocks[0], { blocker_family_id: FAMILY_A, blocked_family_id: FAMILY_B });
});

Deno.test("POST /blocks is idempotent: blocking an already-blocked family returns 200 and inserts nothing", async () => {
  const existing = { blocker_family_id: FAMILY_A, blocked_family_id: FAMILY_B, created_at: "t" };
  const supabase = makeFakeSupabase({
    userId: "u-1",
    responses: {
      families: [{ data: { id: FAMILY_A }, error: null }, { data: { id: FAMILY_B }, error: null }],
      blocks: [{ data: existing, error: null }],
    },
  });
  const res = await handleRequest(req("POST", "/blocks", { blockedFamilyId: FAMILY_B }), supabase);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { blockerFamilyId: FAMILY_A, blockedFamilyId: FAMILY_B, createdAt: "t" });
  assertEquals(supabase.inserts.blocks, undefined);
});

Deno.test("GET /blocks lists the caller's own blocks (RLS already scopes the underlying query)", async () => {
  const rows = [
    { blocker_family_id: FAMILY_A, blocked_family_id: FAMILY_B, created_at: "t2" },
  ];
  const supabase = makeFakeSupabase({ userId: "u-1", responses: { blocks: [{ data: rows, error: null }] } });
  const res = await handleRequest(req("GET", "/blocks"), supabase);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), [{ blockerFamilyId: FAMILY_A, blockedFamilyId: FAMILY_B, createdAt: "t2" }]);
});

Deno.test("DELETE /blocks/:id rejects a non-UUID segment", async () => {
  const supabase = makeFakeSupabase({ userId: "u-1", responses: {} });
  const res = await handleRequest(req("DELETE", "/blocks/not-a-uuid"), supabase);
  assertEquals(res.status, 400);
});

Deno.test("DELETE /blocks/:id unblocks and returns 204", async () => {
  const supabase = makeFakeSupabase({
    userId: "u-1",
    responses: {
      families: [{ data: { id: FAMILY_A }, error: null }],
      blocks: [{ data: null, error: null }],
    },
  });
  const res = await handleRequest(req("DELETE", `/blocks/${FAMILY_B}`), supabase);
  assertEquals(res.status, 204);
});

Deno.test("DELETE /blocks/:id is idempotent when there was nothing to unblock", async () => {
  // The fake delete always "succeeds" with no error regardless of whether a
  // row matched, mirroring real DELETE ... WHERE semantics -- this test
  // documents that handleRequest never turns "0 rows matched" into a 404.
  const supabase = makeFakeSupabase({
    userId: "u-1",
    responses: {
      families: [{ data: { id: FAMILY_A }, error: null }],
      blocks: [{ data: null, error: null }],
    },
  });
  const res = await handleRequest(req("DELETE", `/blocks/${FAMILY_B}`), supabase);
  assertEquals(res.status, 204);
});

Deno.test("a report and a block never touch each other's table in the same request", async () => {
  // Regression guard for contract F ("reporting never auto-blocks; blocking
  // never auto-reports"): a report POST must never write to `blocks`, and a
  // block POST must never write to `reports`. Only responses for the tables
  // each handler is expected to touch are queued -- if either handler
  // reached for the other table, makeFakeSupabase would throw
  // "No fake response queued," failing the test loudly instead of silently
  // passing.
  const reportSupabase = makeFakeSupabase({
    userId: "u-1",
    responses: {
      announcements: [{ data: { id: ANNOUNCEMENT_ID }, error: null }],
      reports: [{ data: {
        id: "r-3",
        reporter_id: "u-1",
        target_type: "announcement",
        target_id: ANNOUNCEMENT_ID,
        category: "other",
        note: null,
        created_at: "t",
      }, error: null }],
    },
  });
  const reportRes = await handleRequest(
    req("POST", "/reports", { targetType: "announcement", targetId: ANNOUNCEMENT_ID, category: "other" }),
    reportSupabase,
  );
  assertEquals(reportRes.status, 201);

  const blockSupabase = makeFakeSupabase({
    userId: "u-1",
    responses: {
      families: [{ data: { id: FAMILY_A }, error: null }, { data: { id: FAMILY_B }, error: null }],
      blocks: [{ data: null, error: null }, {
        data: { blocker_family_id: FAMILY_A, blocked_family_id: FAMILY_B, created_at: "t" },
        error: null,
      }],
    },
  });
  const blockRes = await handleRequest(req("POST", "/blocks", { blockedFamilyId: FAMILY_B }), blockSupabase);
  assertEquals(blockRes.status, 201);
});
