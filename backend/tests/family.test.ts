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
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  return (server!.address() as { port: number }).port;
}

async function call(method: string, path: string, body?: Json, headers: Record<string, string> = {}): Promise<{ status: number; body: Json }> {
  const port = await listen();
  const init: RequestInit = { method, headers: { 'content-type': 'application/json', ...headers } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(`http://127.0.0.1:${port}${path}`, init);
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as Json) : {} };
}

const userA = { email: 'a@example.com', password: 'pass-aaaa-bbbb', name: 'Garcia', city: 'Phoenix', state: 'AZ' };
const userB = { email: 'b@example.com', password: 'pass-cccc-dddd', name: 'Lee',    city: 'Seattle', state: 'WA' };

async function register(creds: typeof userA): Promise<{ jwt: string }> {
  await call('POST', '/api/auth/register', creds);
  const url = testInbox[testInbox.length - 1]?.url ?? '';
  const verifyToken = url.split('token=')[1] as string;
  await call('GET', `/api/auth/verify?token=${verifyToken}`);
  const login = await call('POST', '/api/auth/login', { email: creds.email, password: creds.password });
  return { jwt: login.body['token'] as string };
}

async function resetDb(): Promise<void> {
  await closeDb();
  await runMigrations();
  testInbox.length = 0;
}

describe('family-profiles feature', () => {
  before(async () => { await runMigrations(); });
  beforeEach(async () => { await resetDb(); });
  after(() => { if (server) server.close(); });

  it('registration auto-creates a families row with the user name as family name', async () => {
    await register(userA);
    const row = (await db().prepare('SELECT name, bio, kid_count FROM families').get()) as { name: string; bio: string; kid_count: number | null };
    assert.deepEqual(row, { name: 'Garcia', bio: '', kid_count: null });
  });

  it('GET /api/family/me returns the caller family with isOwner=true', async () => {
    const { jwt } = await register(userA);
    const res = await call('GET', '/api/family/me', undefined, { authorization: `Bearer ${jwt}` });
    assert.equal(res.status, 200);
    assert.equal(res.body['name'], 'Garcia');
    assert.equal(res.body['isOwner'], true);
    assert.equal(res.body['kidCount'], null);
  });

  it('PATCH /api/family/me updates fields and bumps updated_at', async () => {
    const { jwt } = await register(userA);
    const before = await call('GET', '/api/family/me', undefined, { authorization: `Bearer ${jwt}` });
    const beforeUpdated = before.body['updatedAt'] as string;

    await new Promise((r) => setTimeout(r, 1100));
    const res = await call('PATCH', '/api/family/me',
      { name: 'The Garcia Family', bio: 'caring for three teens since 2022', kidCount: 3 },
      { authorization: `Bearer ${jwt}` }
    );
    assert.equal(res.status, 200);
    assert.equal(res.body['name'], 'The Garcia Family');
    assert.equal(res.body['bio'], 'caring for three teens since 2022');
    assert.equal(res.body['kidCount'], 3);
    assert.notEqual(res.body['updatedAt'], beforeUpdated);
  });

  it('PATCH validates kidCount range (0..20)', async () => {
    const { jwt } = await register(userA);
    const res = await call('PATCH', '/api/family/me', { kidCount: 99 }, { authorization: `Bearer ${jwt}` });
    assert.equal(res.status, 400);
  });

  it('GET /api/family/:id by another user masks kidCount', async () => {
    const { jwt: jwtA } = await register(userA);
    await call('PATCH', '/api/family/me', { kidCount: 4 }, { authorization: `Bearer ${jwtA}` });
    const meA = await call('GET', '/api/family/me', undefined, { authorization: `Bearer ${jwtA}` });
    const familyAId = meA.body['id'] as string;

    const { jwt: jwtB } = await register(userB);
    const res = await call('GET', `/api/family/${familyAId}`, undefined, { authorization: `Bearer ${jwtB}` });
    assert.equal(res.status, 200);
    assert.equal(res.body['name'], 'Garcia');
    assert.equal(res.body['isOwner'], false);
    assert.equal(res.body['kidCount'], null);
  });

  it('GET /api/family/:id for unknown returns 404', async () => {
    const { jwt } = await register(userA);
    const res = await call('GET', '/api/family/00000000-0000-0000-0000-000000000000', undefined, { authorization: `Bearer ${jwt}` });
    assert.equal(res.status, 404);
  });

  it('all family endpoints require auth (401 without JWT)', async () => {
    await register(userA);
    const me = await call('GET', '/api/family/me');
    const patch = await call('PATCH', '/api/family/me', { name: 'x' });
    assert.equal(me.status, 401);
    assert.equal(patch.status, 401);
  });
});
