import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.FRONTEND_URL = 'http://localhost:5173';

const { buildApp } = await import('../src/index.js');
const { runMigrations } = await import('../src/migrate.js');
const { db, closeDb } = await import('../src/db.js');
const { testInbox } = await import('../src/services/email.service.js');

const app = buildApp();
type Json = Record<string, unknown>;

let server: ReturnType<ReturnType<typeof buildApp>['listen']> | null = null;
async function listen(): Promise<number> {
  if (server) return (server.address() as { port: number }).port;
  await new Promise<void>((r) => { server = app.listen(0, () => r()); });
  return (server!.address() as { port: number }).port;
}

async function call(
  method: string,
  path: string,
  body?: Json,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: Json | Json[] }> {
  const port = await listen();
  const init: RequestInit = { method, headers: { 'content-type': 'application/json', ...headers } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(`http://127.0.0.1:${port}${path}`, init);
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as Json | Json[]) : {} };
}

const userA = { email: 'a@example.com', password: 'pass-aaaa-bbbb', name: 'Garcia', city: 'Phoenix', state: 'AZ' };
const userB = { email: 'b@example.com', password: 'pass-cccc-dddd', name: 'Lee',    city: 'Seattle', state: 'WA' };

async function register(creds: typeof userA): Promise<{ jwt: string; userId: string; familyId: string }> {
  await call('POST', '/api/auth/register', creds);
  const url = testInbox[testInbox.length - 1]?.url ?? '';
  const verifyToken = url.split('token=')[1] as string;
  await call('GET', `/api/auth/verify?token=${verifyToken}`);
  const login = await call('POST', '/api/auth/login', { email: creds.email, password: creds.password });
  const loginBody = login.body as Json;
  const userId = (loginBody['user'] as Json)['id'] as string;
  const familyRow = db().prepare('SELECT id FROM families WHERE user_id = ?').get(userId) as { id: string };
  return { jwt: loginBody['token'] as string, userId, familyId: familyRow.id };
}

function resetDb(): void {
  closeDb();
  runMigrations();
  testInbox.length = 0;
}

const SLOT_BODY = {
  date: '2026-07-10',
  startTime: '10:00',
  endTime: '12:00',
};

describe('playdates feature', () => {
  before(() => { runMigrations(); });
  beforeEach(() => { resetDb(); });
  after(() => { if (server) server.close(); });

  // ── POST /api/playdates/availability ─────────────────────────────────────
  describe('POST /api/playdates/availability', () => {
    it('creates a free slot and returns 201 with the slot data', async () => {
      const a = await register(userA);
      const res = await call('POST', '/api/playdates/availability', SLOT_BODY, {
        authorization: `Bearer ${a.jwt}`,
      });
      assert.equal(res.status, 201);
      const body = res.body as Json;
      assert.equal(body['date'], '2026-07-10');
      assert.equal(body['startTime'], '10:00');
      assert.equal(body['endTime'], '12:00');
      assert.equal(body['status'], 'free');
      assert.equal(body['familyId'], a.familyId);
    });

    it('accepts busy status and an optional note', async () => {
      const a = await register(userA);
      const res = await call('POST', '/api/playdates/availability', {
        ...SLOT_BODY,
        status: 'busy',
        note: 'soccer game',
      }, { authorization: `Bearer ${a.jwt}` });
      assert.equal(res.status, 201);
      const body = res.body as Json;
      assert.equal(body['status'], 'busy');
      assert.equal(body['note'], 'soccer game');
    });

    it('rejects a slot with an invalid date format with 400', async () => {
      const a = await register(userA);
      const res = await call('POST', '/api/playdates/availability', {
        date: '07/10/2026',
        startTime: '10:00',
        endTime: '12:00',
      }, { authorization: `Bearer ${a.jwt}` });
      assert.equal(res.status, 400);
    });

    it('rejects a slot with an invalid time format with 400', async () => {
      const a = await register(userA);
      const res = await call('POST', '/api/playdates/availability', {
        date: '2026-07-10',
        startTime: '10am',
        endTime: '12pm',
      }, { authorization: `Bearer ${a.jwt}` });
      assert.equal(res.status, 400);
    });

    it('rejects a slot with an invalid status with 400', async () => {
      const a = await register(userA);
      const res = await call('POST', '/api/playdates/availability', {
        ...SLOT_BODY,
        status: 'available',
      }, { authorization: `Bearer ${a.jwt}` });
      assert.equal(res.status, 400);
    });

    it('requires authentication (401 without JWT)', async () => {
      const res = await call('POST', '/api/playdates/availability', SLOT_BODY);
      assert.equal(res.status, 401);
    });
  });

  // ── GET /api/playdates/availability/:familyId ─────────────────────────────
  describe('GET /api/playdates/availability/:familyId', () => {
    it('returns all slots (free + busy) when viewing own availability', async () => {
      const a = await register(userA);
      await call('POST', '/api/playdates/availability', { ...SLOT_BODY, status: 'free' }, { authorization: `Bearer ${a.jwt}` });
      await call('POST', '/api/playdates/availability', { ...SLOT_BODY, date: '2026-07-11', status: 'busy' }, { authorization: `Bearer ${a.jwt}` });

      const res = await call('GET', `/api/playdates/availability/${a.familyId}`, undefined, {
        authorization: `Bearer ${a.jwt}`,
      });
      assert.equal(res.status, 200);
      const items = res.body as Json[];
      assert.equal(items.length, 2);
    });

    it('returns only free slots when viewing another family', async () => {
      const a = await register(userA);
      const b = await register(userB);
      await call('POST', '/api/playdates/availability', { ...SLOT_BODY, status: 'free' }, { authorization: `Bearer ${a.jwt}` });
      await call('POST', '/api/playdates/availability', { ...SLOT_BODY, date: '2026-07-11', status: 'busy' }, { authorization: `Bearer ${a.jwt}` });

      const res = await call('GET', `/api/playdates/availability/${a.familyId}`, undefined, {
        authorization: `Bearer ${b.jwt}`,
      });
      assert.equal(res.status, 200);
      const items = res.body as Json[];
      assert.equal(items.length, 1);
      assert.equal((items[0] as Json)['status'], 'free');
    });

    it('requires authentication (401 without JWT)', async () => {
      const a = await register(userA);
      const res = await call('GET', `/api/playdates/availability/${a.familyId}`);
      assert.equal(res.status, 401);
    });
  });

  // ── PUT /api/playdates/availability/:id ───────────────────────────────────
  describe('PUT /api/playdates/availability/:id', () => {
    it('owner can update their slot', async () => {
      const a = await register(userA);
      const created = await call('POST', '/api/playdates/availability', SLOT_BODY, {
        authorization: `Bearer ${a.jwt}`,
      });
      const slotId = (created.body as Json)['id'] as string;

      const res = await call('PUT', `/api/playdates/availability/${slotId}`, {
        status: 'busy',
        note: 'changed my mind',
      }, { authorization: `Bearer ${a.jwt}` });
      assert.equal(res.status, 200);
      assert.equal((res.body as Json)['status'], 'busy');
      assert.equal((res.body as Json)['note'], 'changed my mind');
    });

    it('preserves unchanged fields when only a partial patch is sent', async () => {
      const a = await register(userA);
      const created = await call('POST', '/api/playdates/availability', { ...SLOT_BODY, note: 'original' }, {
        authorization: `Bearer ${a.jwt}`,
      });
      const slotId = (created.body as Json)['id'] as string;

      const res = await call('PUT', `/api/playdates/availability/${slotId}`, {
        status: 'busy',
      }, { authorization: `Bearer ${a.jwt}` });
      assert.equal(res.status, 200);
      assert.equal((res.body as Json)['note'], 'original');
    });

    it('non-owner gets 403', async () => {
      const a = await register(userA);
      const b = await register(userB);
      const created = await call('POST', '/api/playdates/availability', SLOT_BODY, {
        authorization: `Bearer ${a.jwt}`,
      });
      const slotId = (created.body as Json)['id'] as string;

      const res = await call('PUT', `/api/playdates/availability/${slotId}`, {
        status: 'busy',
      }, { authorization: `Bearer ${b.jwt}` });
      assert.equal(res.status, 403);
    });

    it('returns 404 for a non-existent slot', async () => {
      const a = await register(userA);
      const res = await call('PUT', '/api/playdates/availability/00000000-0000-0000-0000-000000000000', {
        status: 'busy',
      }, { authorization: `Bearer ${a.jwt}` });
      assert.equal(res.status, 404);
    });
  });

  // ── DELETE /api/playdates/availability/:id ────────────────────────────────
  describe('DELETE /api/playdates/availability/:id', () => {
    it('owner can delete their slot', async () => {
      const a = await register(userA);
      const created = await call('POST', '/api/playdates/availability', SLOT_BODY, {
        authorization: `Bearer ${a.jwt}`,
      });
      const slotId = (created.body as Json)['id'] as string;

      const res = await call('DELETE', `/api/playdates/availability/${slotId}`, undefined, {
        authorization: `Bearer ${a.jwt}`,
      });
      assert.equal(res.status, 200);
      assert.equal((res.body as Json)['success'], true);
    });

    it('non-owner gets 403', async () => {
      const a = await register(userA);
      const b = await register(userB);
      const created = await call('POST', '/api/playdates/availability', SLOT_BODY, {
        authorization: `Bearer ${a.jwt}`,
      });
      const slotId = (created.body as Json)['id'] as string;

      const res = await call('DELETE', `/api/playdates/availability/${slotId}`, undefined, {
        authorization: `Bearer ${b.jwt}`,
      });
      assert.equal(res.status, 403);
    });

    it('returns 404 for a non-existent slot', async () => {
      const a = await register(userA);
      const res = await call('DELETE', '/api/playdates/availability/00000000-0000-0000-0000-000000000000', undefined, {
        authorization: `Bearer ${a.jwt}`,
      });
      assert.equal(res.status, 404);
    });
  });

  // ── POST /api/playdates/requests ──────────────────────────────────────────
  describe('POST /api/playdates/requests', () => {
    it('happy path: creates a pending request and returns 201', async () => {
      const a = await register(userA);
      const b = await register(userB);
      const slot = await call('POST', '/api/playdates/availability', { ...SLOT_BODY, status: 'free' }, {
        authorization: `Bearer ${a.jwt}`,
      });
      const slotId = (slot.body as Json)['id'] as string;

      const res = await call('POST', '/api/playdates/requests', { slotId, message: 'Would love to join!' }, {
        authorization: `Bearer ${b.jwt}`,
      });
      assert.equal(res.status, 201);
      const body = res.body as Json;
      assert.equal(body['status'], 'pending');
      assert.equal(body['slotId'], slotId);
      assert.equal(body['message'], 'Would love to join!');
    });

    it('self-request is rejected with 400', async () => {
      const a = await register(userA);
      const slot = await call('POST', '/api/playdates/availability', SLOT_BODY, {
        authorization: `Bearer ${a.jwt}`,
      });
      const slotId = (slot.body as Json)['id'] as string;

      const res = await call('POST', '/api/playdates/requests', { slotId }, {
        authorization: `Bearer ${a.jwt}`,
      });
      assert.equal(res.status, 400);
      assert.equal((res.body as Json)['error'], 'Cannot request your own slot');
    });

    it('duplicate pending request for the same slot is rejected with 400', async () => {
      const a = await register(userA);
      const b = await register(userB);
      const slot = await call('POST', '/api/playdates/availability', SLOT_BODY, {
        authorization: `Bearer ${a.jwt}`,
      });
      const slotId = (slot.body as Json)['id'] as string;

      await call('POST', '/api/playdates/requests', { slotId }, { authorization: `Bearer ${b.jwt}` });
      const res = await call('POST', '/api/playdates/requests', { slotId }, { authorization: `Bearer ${b.jwt}` });
      assert.equal(res.status, 400);
      assert.equal((res.body as Json)['error'], 'You already have a pending request for this slot');
    });

    it('non-free (busy) slot is rejected with 404', async () => {
      const a = await register(userA);
      const b = await register(userB);
      const slot = await call('POST', '/api/playdates/availability', { ...SLOT_BODY, status: 'busy' }, {
        authorization: `Bearer ${a.jwt}`,
      });
      const slotId = (slot.body as Json)['id'] as string;

      const res = await call('POST', '/api/playdates/requests', { slotId }, {
        authorization: `Bearer ${b.jwt}`,
      });
      assert.equal(res.status, 404);
    });

    it('requires authentication (401 without JWT)', async () => {
      const res = await call('POST', '/api/playdates/requests', { slotId: '00000000-0000-0000-0000-000000000000' });
      assert.equal(res.status, 401);
    });
  });

  // ── GET /api/playdates/requests ───────────────────────────────────────────
  describe('GET /api/playdates/requests', () => {
    it('returns requests where the user is requester or owner, newest first', async () => {
      const a = await register(userA);
      const b = await register(userB);
      const slot = await call('POST', '/api/playdates/availability', SLOT_BODY, {
        authorization: `Bearer ${a.jwt}`,
      });
      const slotId = (slot.body as Json)['id'] as string;
      await call('POST', '/api/playdates/requests', { slotId, message: 'hello' }, {
        authorization: `Bearer ${b.jwt}`,
      });

      const forA = await call('GET', '/api/playdates/requests', undefined, { authorization: `Bearer ${a.jwt}` });
      assert.equal(forA.status, 200);
      assert.equal((forA.body as Json[]).length, 1);

      const forB = await call('GET', '/api/playdates/requests', undefined, { authorization: `Bearer ${b.jwt}` });
      assert.equal(forB.status, 200);
      assert.equal((forB.body as Json[]).length, 1);
    });

    it('requires authentication (401 without JWT)', async () => {
      const res = await call('GET', '/api/playdates/requests');
      assert.equal(res.status, 401);
    });
  });

  // ── PUT /api/playdates/requests/:id/respond ───────────────────────────────
  describe('PUT /api/playdates/requests/:id/respond', () => {
    async function makeRequest(a: { jwt: string }, b: { jwt: string }): Promise<string> {
      const slot = await call('POST', '/api/playdates/availability', SLOT_BODY, {
        authorization: `Bearer ${a.jwt}`,
      });
      const slotId = (slot.body as Json)['id'] as string;
      const req = await call('POST', '/api/playdates/requests', { slotId, message: 'hello' }, {
        authorization: `Bearer ${b.jwt}`,
      });
      return (req.body as Json)['id'] as string;
    }

    it('owner can accept a pending request', async () => {
      const a = await register(userA);
      const b = await register(userB);
      const reqId = await makeRequest(a, b);

      const res = await call('PUT', `/api/playdates/requests/${reqId}/respond`, { status: 'accepted' }, {
        authorization: `Bearer ${a.jwt}`,
      });
      assert.equal(res.status, 200);
      assert.equal((res.body as Json)['status'], 'accepted');
    });

    it('owner can decline a pending request', async () => {
      const a = await register(userA);
      const b = await register(userB);
      const reqId = await makeRequest(a, b);

      const res = await call('PUT', `/api/playdates/requests/${reqId}/respond`, { status: 'declined' }, {
        authorization: `Bearer ${a.jwt}`,
      });
      assert.equal(res.status, 200);
      assert.equal((res.body as Json)['status'], 'declined');
    });

    it('non-owner (requester) gets 403', async () => {
      const a = await register(userA);
      const b = await register(userB);
      const reqId = await makeRequest(a, b);

      const res = await call('PUT', `/api/playdates/requests/${reqId}/respond`, { status: 'accepted' }, {
        authorization: `Bearer ${b.jwt}`,
      });
      assert.equal(res.status, 403);
    });

    it('already-resolved request returns 400', async () => {
      const a = await register(userA);
      const b = await register(userB);
      const reqId = await makeRequest(a, b);

      await call('PUT', `/api/playdates/requests/${reqId}/respond`, { status: 'accepted' }, {
        authorization: `Bearer ${a.jwt}`,
      });
      const res = await call('PUT', `/api/playdates/requests/${reqId}/respond`, { status: 'declined' }, {
        authorization: `Bearer ${a.jwt}`,
      });
      assert.equal(res.status, 400);
      assert.equal((res.body as Json)['error'], 'Request already resolved');
    });

    it('invalid respond status value returns 400', async () => {
      const a = await register(userA);
      const b = await register(userB);
      const reqId = await makeRequest(a, b);

      const res = await call('PUT', `/api/playdates/requests/${reqId}/respond`, { status: 'maybe' }, {
        authorization: `Bearer ${a.jwt}`,
      });
      assert.equal(res.status, 400);
    });

    it('requires authentication (401 without JWT)', async () => {
      const res = await call('PUT', '/api/playdates/requests/00000000-0000-0000-0000-000000000000/respond', { status: 'accepted' });
      assert.equal(res.status, 401);
    });
  });
});
