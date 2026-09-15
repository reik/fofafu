// Focused unit tests for the [[features/content-moderation-gate]] wiring in
// handleRequest -- NOT a full CRUD test suite for this Edge Function.
//
// This is the first test file for supabase/functions/announcement/index.ts.
// Before this pass the function had zero test coverage of any kind (a
// pre-existing gap, confirmed by a repo search before writing this file --
// not something this pass is on the hook to backfill wholesale, per this
// feature's own task scope). qa-engineer's ### Test plan will extend
// coverage to the rest of the CRUD surface (GET/PATCH/DELETE, reactions,
// pagination, ownership checks, etc.) in the next wave. makeFakeSupabase()
// below is written to be reusable for that -- it mirrors every chain method
// handleRequest calls anywhere in the file, not just the ones exercised by
// the tests below -- so that work extends this fixture rather than
// duplicating it.
//
// Covered here (exactly the moderation-gate branch this pass added):
//   - POST /announcement:            flag off / flag on+clean / flag on+flagged
//   - POST /announcement/:id/comments: flag off / flag on+flagged
// NOT covered here (pre-existing gap, left for qa-engineer): GET/PATCH/DELETE
// on announcements or comments, reactions, pagination, ownership/403 checks.
//
// Fixture pattern lifted directly from ../admin/index.test.ts's
// makeFakeSupabase -- same fake-client-over-real-network approach, same
// queue-per-table response shape, extended here with .in()/.lt() (which
// admin/index.ts never calls but announcement/index.ts's authorLookup /
// reactionAggregates / listAnnouncements do) and an insert-call recorder
// (used below to prove the gate's "no insert on a flagged verdict"
// guarantee -- ### Code review watch-list #1, this feature's sharpest named
// risk).
import { assertEquals } from "jsr:@std/assert@1";
import { handleRequest } from "./index.ts";
import { setModerationClassifierForTests } from "../_shared/moderation.ts";
// deno-lint-ignore no-explicit-any
type Any = any;

interface Resp {
  data: unknown;
  error: unknown;
}

function makeFakeSupabase(opts: { userId: string | null; responses: Record<string, Resp[]> }) {
  const inserts: Record<string, unknown[]> = {};
  const responses = opts.responses;

  function nextResponse(table: string): Resp {
    const queue = responses[table];
    if (!queue || queue.length === 0) {
      throw new Error(`No fake response queued for table "${table}"`);
    }
    return queue.shift()!;
  }

  function builder(table: string): Any {
    const chain: Any = {};
    for (const m of ["select", "eq", "in", "lt", "order", "limit", "single", "maybeSingle"]) {
      chain[m] = () => chain;
    }
    chain.update = (_patch: Record<string, unknown>) => chain;
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

// Supabase's edge-runtime strips the /functions/v1 prefix before the
// function sees req.url; handleRequest's own segment filter additionally
// drops the leading "announcement" segment (see index.ts's routing comment).
function req(method: string, path: string, body?: unknown): Request {
  return new Request(`https://x.supabase.co/announcement${path}`, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// Re-declared locally rather than imported -- moderation.ts's FLAG_VAR is not
// exported (same reconciliation note as ./moderation.test.ts's own copy).
const FLAG_VAR = "CONTENT_MODERATION_GATE_ENABLED";

function resetGateEnv() {
  Deno.env.delete(FLAG_VAR);
  setModerationClassifierForTests(null);
}

// ── POST /announcement ──────────────────────────────────────────────────

Deno.test("POST /announcement — gate flag off: classifier never called, insert proceeds unaffected (AC #7 default-off)", async () => {
  let classifierCalls = 0;
  setModerationClassifierForTests(() => {
    classifierCalls++;
    return Promise.resolve({ flagged: false, categories: [] });
  });
  try {
    Deno.env.delete(FLAG_VAR); // explicit: unset, not merely falsy
    const supabase = makeFakeSupabase({
      userId: "u-1",
      responses: {
        announcements: [{
          data: { id: "a-1", user_id: "u-1", content: "hello", media_url: null, media_type: null, created_at: "t", updated_at: "t" },
          error: null,
        }],
        families: [{ data: [], error: null }],
        reactions: [{ data: [], error: null }],
      },
    });
    const res = await handleRequest(req("POST", "", { content: "hello" }), supabase);
    assertEquals(res.status, 201);
    assertEquals(classifierCalls, 0);
    assertEquals(supabase.inserts.announcements.length, 1);
  } finally {
    resetGateEnv();
  }
});

Deno.test("POST /announcement — gate flag on + clean classifier: classifier runs once with the submitted content, insert proceeds, 201", async () => {
  let classifierCalls = 0;
  let receivedContent = "";
  setModerationClassifierForTests((content) => {
    classifierCalls++;
    receivedContent = content;
    return Promise.resolve({ flagged: false, categories: [] });
  });
  try {
    Deno.env.set(FLAG_VAR, "true");
    const supabase = makeFakeSupabase({
      userId: "u-1",
      responses: {
        announcements: [{
          data: { id: "a-2", user_id: "u-1", content: "hello, foster family", media_url: null, media_type: null, created_at: "t", updated_at: "t" },
          error: null,
        }],
        families: [{ data: [], error: null }],
        reactions: [{ data: [], error: null }],
      },
    });
    const res = await handleRequest(req("POST", "", { content: "hello, foster family" }), supabase);
    assertEquals(res.status, 201);
    assertEquals(classifierCalls, 1);
    assertEquals(receivedContent, "hello, foster family");
    assertEquals(supabase.inserts.announcements.length, 1);
  } finally {
    resetGateEnv();
  }
});

Deno.test("POST /announcement — gate flag on + flagged classifier: insert never runs, 422 with {code: 'content_flagged', categories}", async () => {
  setModerationClassifierForTests(() => Promise.resolve({ flagged: true, categories: ["harassment", "threats-violence"] }));
  try {
    Deno.env.set(FLAG_VAR, "true");
    // No "announcements" response queued at all -- if handleRequest ever
    // called .insert() (or any other read) on that table, nextResponse()
    // would throw "No fake response queued", failing this test loudly. This
    // is the direct test of ### Code review watch-list #1: the classify call
    // must resolve BEFORE the insert executes, never insert-then-delete.
    const supabase = makeFakeSupabase({ userId: "u-1", responses: {} });
    const res = await handleRequest(req("POST", "", { content: "flagged draft" }), supabase);
    assertEquals(res.status, 422);
    assertEquals(await res.json(), {
      error: "Content flagged by the moderation gate and was not published.",
      code: "content_flagged",
      categories: ["harassment", "threats-violence"],
    });
    assertEquals(supabase.inserts.announcements, undefined); // insert() was never called on the announcements table
  } finally {
    resetGateEnv();
  }
});

// ── POST /announcement/:id/comments ─────────────────────────────────────

Deno.test("POST /announcement/:id/comments — gate flag off: classifier never called, insert proceeds unaffected", async () => {
  let classifierCalls = 0;
  setModerationClassifierForTests(() => {
    classifierCalls++;
    return Promise.resolve({ flagged: false, categories: [] });
  });
  try {
    Deno.env.delete(FLAG_VAR);
    const supabase = makeFakeSupabase({
      userId: "u-1",
      responses: {
        announcements: [{ data: { id: "a-1" }, error: null }], // parent-post existence check
        comments: [{
          data: { id: "c-1", announcement_id: "a-1", user_id: "u-1", content: "nice!", created_at: "t", updated_at: "t" },
          error: null,
        }],
        families: [{ data: [], error: null }],
      },
    });
    const res = await handleRequest(req("POST", "/a-1/comments", { content: "nice!" }), supabase);
    assertEquals(res.status, 201);
    assertEquals(classifierCalls, 0);
    assertEquals(supabase.inserts.comments.length, 1);
  } finally {
    resetGateEnv();
  }
});

Deno.test("POST /announcement/:id/comments — gate flag on + flagged classifier: insert never runs, same response contract as the post path", async () => {
  setModerationClassifierForTests(() => Promise.resolve({ flagged: true, categories: ["spam"] }));
  try {
    Deno.env.set(FLAG_VAR, "true");
    const supabase = makeFakeSupabase({
      userId: "u-1",
      // The parent-post existence check runs BEFORE content is even read, so
      // it still needs a queued response -- only the "comments" insert must
      // never happen.
      responses: { announcements: [{ data: { id: "a-1" }, error: null }] },
    });
    const res = await handleRequest(req("POST", "/a-1/comments", { content: "flagged comment" }), supabase);
    assertEquals(res.status, 422);
    assertEquals(await res.json(), {
      error: "Content flagged by the moderation gate and was not published.",
      code: "content_flagged",
      categories: ["spam"],
    });
    assertEquals(supabase.inserts.comments, undefined);
  } finally {
    resetGateEnv();
  }
});
