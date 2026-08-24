// Unit tests for handleRequest's routing/authorization/audit-logging logic.
// Everything here runs against fake clients (no network, no Postgres) --
// this repo has no local-Postgres/pgTAP harness yet, so the RLS policies and
// column-grant triggers in 20260823000000_admin_access.sql are NOT exercised
// by these tests; they're reviewed manually (see the migration's own
// comments) and should be verified against a real/staging project before
// this ships. What IS covered here: the is_admin() 403 gate applies to every
// route, each handler shapes its response correctly, and every mutation
// writes exactly the audit log row the acceptance criteria require.
import { assertEquals, assertExists } from "jsr:@std/assert@1";
import { handleRequest } from "./index.ts";
// deno-lint-ignore no-explicit-any
type Any = any;

interface Resp {
  data: unknown;
  error: unknown;
}

function makeFakeSupabase(opts: {
  userId: string | null;
  isAdmin: boolean | "error";
  responses: Record<string, Resp[]>;
}) {
  const auditInserts: Record<string, unknown>[] = [];
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
    for (const m of ["select", "eq", "order", "limit", "or", "single", "maybeSingle"]) {
      chain[m] = () => chain;
    }
    chain.update = (_patch: Record<string, unknown>) => chain;
    chain.delete = () => chain;
    chain.insert = (payload: Record<string, unknown>) => {
      if (table === "admin_audit_log") auditInserts.push(payload);
      return chain;
    };
    chain.then = (resolve: (v: unknown) => void) => resolve(nextResponse(table));
    return chain;
  }

  const fake: Any = {
    auth: { getUser: () => Promise.resolve({ data: { user: opts.userId ? { id: opts.userId } : null } }) },
    rpc: (_fn: string) =>
      opts.isAdmin === "error"
        ? Promise.resolve({ data: null, error: { message: "boom" } })
        : Promise.resolve({ data: opts.isAdmin, error: null }),
    from: (table: string) => builder(table),
    auditInserts,
  };
  return fake;
}

function makeFakeServiceRole(opts: {
  users?: Record<string, { email?: string; banned_until?: string | null }>;
  updateUserByIdResult?: Resp;
  generateLinkResult?: Resp;
}) {
  const calls: { method: string; args: unknown[] }[] = [];
  const fake: Any = {
    auth: {
      admin: {
        listUsers: (args: { page: number }) => {
          calls.push({ method: "listUsers", args: [args] });
          const entries = Object.entries(opts.users ?? {});
          const users = args.page === 1
            ? entries.map(([id, u]) => ({ id, email: u.email, banned_until: u.banned_until ?? null }))
            : [];
          return Promise.resolve({ data: { users }, error: null });
        },
        getUserById: (id: string) => {
          calls.push({ method: "getUserById", args: [id] });
          const u = opts.users?.[id];
          return Promise.resolve({
            data: { user: u ? { id, email: u.email, banned_until: u.banned_until ?? null } : null },
            error: null,
          });
        },
        updateUserById: (id: string, patch: Record<string, unknown>) => {
          calls.push({ method: "updateUserById", args: [id, patch] });
          return Promise.resolve(
            opts.updateUserByIdResult ?? { data: { user: { id, banned_until: null } }, error: null },
          );
        },
        generateLink: (args: Record<string, unknown>) => {
          calls.push({ method: "generateLink", args: [args] });
          return Promise.resolve(opts.generateLinkResult ?? { data: {}, error: null });
        },
      },
    },
    calls,
  };
  return fake;
}

// Supabase's edge-runtime strips the /functions/v1 prefix before the
// function sees req.url, so a deployed call to .../functions/v1/admin/users
// arrives here with pathname "/admin/users" (matches message/index.ts's own
// documented segment shape). handleRequest's `.slice(1)` drops the leading
// "admin" segment, not a "/functions/v1" prefix.
function req(method: string, path: string, body?: unknown): Request {
  return new Request(`https://x.supabase.co/admin${path}`, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

Deno.test("returns 401 when there is no authenticated user", async () => {
  const supabase = makeFakeSupabase({ userId: null, isAdmin: true, responses: {} });
  const res = await handleRequest(req("GET", "/users"), supabase);
  assertEquals(res.status, 401);
});

Deno.test("returns 403 for an authenticated non-admin, before touching any table", async () => {
  const supabase = makeFakeSupabase({ userId: "u-1", isAdmin: false, responses: {} });
  const res = await handleRequest(req("GET", "/users"), supabase);
  assertEquals(res.status, 403);
  assertEquals(supabase.auditInserts.length, 0);
});

Deno.test("returns 403 when the is_admin RPC itself errors", async () => {
  const supabase = makeFakeSupabase({ userId: "u-1", isAdmin: "error", responses: {} });
  const res = await handleRequest(req("GET", "/users"), supabase);
  assertEquals(res.status, 403);
});

Deno.test("GET /users merges families rows with auth email + ban status", async () => {
  const supabase = makeFakeSupabase({
    userId: "admin-1",
    isAdmin: true,
    responses: {
      families: [{
        data: [{ id: "fam-1", user_id: "u-1", name: "Garcia", bio: "", kid_count: 2, avatar_url: null, created_at: "t" }],
        error: null,
      }],
    },
  });
  const serviceRole = makeFakeServiceRole({ users: { "u-1": { email: "a@b.com", banned_until: null } } });
  const res = await handleRequest(req("GET", "/users"), supabase, () => serviceRole);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body, [{
    id: "u-1",
    familyId: "fam-1",
    name: "Garcia",
    bio: "",
    kidCount: 2,
    avatarUrl: null,
    createdAt: "t",
    email: "a@b.com",
    banned: false,
  }]);
});

Deno.test("GET /users/:id with a non-UUID segment returns 400", async () => {
  const supabase = makeFakeSupabase({ userId: "admin-1", isAdmin: true, responses: {} });
  const res = await handleRequest(req("GET", "/users/not-a-uuid"), supabase);
  assertEquals(res.status, 400);
});

Deno.test("unknown route returns 404", async () => {
  const supabase = makeFakeSupabase({ userId: "admin-1", isAdmin: true, responses: {} });
  const res = await handleRequest(req("GET", "/nonsense"), supabase);
  assertEquals(res.status, 404);
});

Deno.test("PATCH /content/comments/:id updates content and writes one audit log row", async () => {
  const id = "11111111-1111-1111-1111-111111111111";
  const before = { id, announcement_id: "a-1", user_id: "u-1", content: "old", created_at: "t1" };
  const after = { ...before, content: "new" };
  const supabase = makeFakeSupabase({
    userId: "admin-1",
    isAdmin: true,
    responses: {
      comments: [{ data: before, error: null }, { data: after, error: null }],
      admin_audit_log: [{ data: null, error: null }],
    },
  });
  const res = await handleRequest(req("PATCH", `/content/comments/${id}`, { content: "new" }), supabase);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), after);
  assertEquals(supabase.auditInserts.length, 1);
  assertEquals(supabase.auditInserts[0].action, "update_comments");
  assertEquals(supabase.auditInserts[0].target_id, id);
  assertEquals(supabase.auditInserts[0].before, before);
  assertEquals(supabase.auditInserts[0].after, after);
});

Deno.test("PATCH /content/comments/:id returns 404 when the row does not exist", async () => {
  const id = "11111111-1111-1111-1111-111111111111";
  const supabase = makeFakeSupabase({
    userId: "admin-1",
    isAdmin: true,
    responses: { comments: [{ data: null, error: null }] },
  });
  const res = await handleRequest(req("PATCH", `/content/comments/${id}`, { content: "x" }), supabase);
  assertEquals(res.status, 404);
  assertEquals(supabase.auditInserts.length, 0);
});

Deno.test("DELETE /messages/:id deletes the message and audits before/null", async () => {
  const id = "22222222-2222-2222-2222-222222222222";
  const before = { id, sender_id: "u-1", receiver_id: "u-2", content: "hi", read: false, created_at: "t1" };
  const supabase = makeFakeSupabase({
    userId: "admin-1",
    isAdmin: true,
    responses: {
      messages: [{ data: before, error: null }, { data: null, error: null }],
      admin_audit_log: [{ data: null, error: null }],
    },
  });
  const res = await handleRequest(req("DELETE", `/messages/${id}`), supabase);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { deleted: true });
  assertEquals(supabase.auditInserts[0].action, "delete_message");
  assertEquals(supabase.auditInserts[0].before, before);
  assertEquals(supabase.auditInserts[0].after, null);
});

Deno.test("POST /users/:id/ban bans via the service-role client and audits it", async () => {
  const userId = "33333333-3333-3333-3333-333333333333";
  const supabase = makeFakeSupabase({
    userId: "admin-1",
    isAdmin: true,
    responses: { admin_audit_log: [{ data: null, error: null }] },
  });
  const serviceRole = makeFakeServiceRole({
    users: { [userId]: { email: "x@y.com", banned_until: null } },
    updateUserByIdResult: { data: { user: { id: userId, banned_until: "2200-01-01T00:00:00Z" } }, error: null },
  });
  const res = await handleRequest(req("POST", `/users/${userId}/ban`, {}), supabase, () => serviceRole);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { id: userId, banned: true });
  const updateCall = serviceRole.calls.find((c: Any) => c.method === "updateUserById");
  assertExists(updateCall);
  assertEquals((updateCall!.args[1] as Any).ban_duration, `${24 * 365 * 100}h`);
  assertEquals(supabase.auditInserts[0].action, "ban_user");
});

Deno.test("POST /users/:id/ban with unban:true sends ban_duration 'none'", async () => {
  const userId = "44444444-4444-4444-4444-444444444444";
  const supabase = makeFakeSupabase({
    userId: "admin-1",
    isAdmin: true,
    responses: { admin_audit_log: [{ data: null, error: null }] },
  });
  const serviceRole = makeFakeServiceRole({
    users: { [userId]: { email: "x@y.com", banned_until: "2200-01-01T00:00:00Z" } },
    updateUserByIdResult: { data: { user: { id: userId, banned_until: null } }, error: null },
  });
  const res = await handleRequest(req("POST", `/users/${userId}/ban`, { unban: true }), supabase, () => serviceRole);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { id: userId, banned: false });
  const updateCall = serviceRole.calls.find((c: Any) => c.method === "updateUserById");
  assertEquals((updateCall!.args[1] as Any).ban_duration, "none");
  assertEquals(supabase.auditInserts[0].action, "unban_user");
});

Deno.test("a mutation that succeeds but fails to audit-log surfaces as 500, not a silent 200", async () => {
  const id = "55555555-5555-5555-5555-555555555555";
  const before = { id, announcement_id: "a-1", user_id: "u-1", content: "old", created_at: "t1" };
  const after = { ...before, content: "new" };
  const supabase = makeFakeSupabase({
    userId: "admin-1",
    isAdmin: true,
    responses: {
      comments: [{ data: before, error: null }, { data: after, error: null }],
      admin_audit_log: [{ data: null, error: { message: "insert failed" } }],
    },
  });
  const res = await handleRequest(req("PATCH", `/content/comments/${id}`, { content: "new" }), supabase);
  assertEquals(res.status, 500);
});
