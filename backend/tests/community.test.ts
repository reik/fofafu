import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.FRONTEND_URL = 'http://localhost:5173';

const { buildApp } = await import('../src/index.js');
const { runMigrations } = await import('../src/migrate.js');
const { closeDb } = await import('../src/db.js');
const { testInbox } = await import('../src/services/email.service.js');

const app = buildApp();

let server: ReturnType<ReturnType<typeof buildApp>['listen']> | null = null;
async function listen(): Promise<number> {
  if (server) return (server.address() as { port: number }).port;
  await new Promise<void>((r) => { server = app.listen(0, () => r()); });
  return (server!.address() as { port: number }).port;
}

type Json = Record<string, unknown>;
type JsonArr = Json[];

async function call(method: string, path: string, body?: Json, headers: Record<string, string> = {}): Promise<{ status: number; body: Json | JsonArr }> {
  const port = await listen();
  const init: RequestInit = { method, headers: { 'content-type': 'application/json', ...headers } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(`http://127.0.0.1:${port}${path}`, init);
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as Json | JsonArr) : {} };
}

const userA = { email: 'a@example.com', password: 'pass-aaaa-bbbb', name: 'Garcia', city: 'Phoenix', state: 'AZ' };
const userB = { email: 'b@example.com', password: 'pass-cccc-dddd', name: 'Lee',    city: 'Seattle', state: 'WA' };
const userC = { email: 'c@example.com', password: 'pass-eeee-ffff', name: 'Martin', city: 'Denver',  state: 'CO' };

async function registerAndVerify(creds: typeof userA): Promise<string> {
  await call('POST', '/api/auth/register', creds);
  const verifyToken = testInbox[testInbox.length - 1]?.url.split('token=')[1] as string;
  await call('GET', `/api/auth/verify?token=${verifyToken}`);
  const login = await call('POST', '/api/auth/login', { email: creds.email, password: creds.password });
  return (login.body as Json)['token'] as string;
}

async function resetDb(): Promise<void> {
  await closeDb();
  await runMigrations();
  testInbox.length = 0;
}

describe('community-recent feature', () => {
  before(async () => { await runMigrations(); });
  beforeEach(async () => { await resetDb(); });
  after(() => { if (server) server.close(); });

  it('returns other families, ordered by updated_at desc, excluding the caller', async () => {
    await registerAndVerify(userA);
    await new Promise((r) => setTimeout(r, 1100));
    await registerAndVerify(userB);
    await new Promise((r) => setTimeout(r, 1100));
    const jwtC = await registerAndVerify(userC);

    const res = await call('GET', '/api/community/recent', undefined, { authorization: `Bearer ${jwtC}` });
    assert.equal(res.status, 200);
    const items = res.body as JsonArr;
    assert.equal(items.length, 2);
    assert.equal(items[0]?.['name'], 'Lee');
    assert.equal(items[1]?.['name'], 'Garcia');
    for (const it of items) assert.notEqual(it['name'], 'Martin');
  });

  it('honors the limit param', async () => {
    await registerAndVerify(userA);
    await registerAndVerify(userB);
    const jwtC = await registerAndVerify(userC);
    const res = await call('GET', '/api/community/recent?limit=1', undefined, { authorization: `Bearer ${jwtC}` });
    const items = res.body as JsonArr;
    assert.equal(items.length, 1);
  });

  it('requires auth (401)', async () => {
    const res = await call('GET', '/api/community/recent');
    assert.equal(res.status, 401);
  });
});
