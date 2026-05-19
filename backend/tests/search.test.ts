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

const userA = { email: 'a@example.com', password: 'pass-aaaa-bbbb', name: 'Garcia',  city: 'Phoenix',  state: 'AZ' };
const userB = { email: 'b@example.com', password: 'pass-cccc-dddd', name: 'Lee',     city: 'Seattle',  state: 'WA' };
const userC = { email: 'c@example.com', password: 'pass-eeee-ffff', name: 'Martin',  city: 'Phoenix',  state: 'AZ' };

async function registerAndVerify(creds: typeof userA): Promise<string> {
  await call('POST', '/api/auth/register', creds);
  const verifyToken = testInbox[testInbox.length - 1]?.url.split('token=')[1] as string;
  await call('GET', `/api/auth/verify?token=${verifyToken}`);
  const login = await call('POST', '/api/auth/login', { email: creds.email, password: creds.password });
  return (login.body as Json)['token'] as string;
}

async function setBio(jwt: string, bio: string): Promise<void> {
  await call('PATCH', '/api/family/me', { bio }, { authorization: `Bearer ${jwt}` });
}

function resetDb(): void {
  closeDb();
  runMigrations();
  testInbox.length = 0;
}

describe('community-search feature', () => {
  before(() => { runMigrations(); });
  beforeEach(() => { resetDb(); });
  after(() => { if (server) server.close(); });

  it('matches by family name, case-insensitive', async () => {
    await registerAndVerify(userA);
    const jwt = await registerAndVerify(userB);
    const res = await call('GET', '/api/search/families?q=garcia', undefined, { authorization: `Bearer ${jwt}` });
    assert.equal(res.status, 200);
    const items = res.body as JsonArr;
    assert.equal(items.length, 1);
    assert.equal(items[0]?.['name'], 'Garcia');
  });

  it('matches by bio fragment', async () => {
    const jwtA = await registerAndVerify(userA);
    await setBio(jwtA, 'caring for three teens since 2022');
    const jwt = await registerAndVerify(userB);
    const res = await call('GET', '/api/search/families?q=teens', undefined, { authorization: `Bearer ${jwt}` });
    const items = res.body as JsonArr;
    assert.equal(items.length, 1);
    assert.equal(items[0]?.['name'], 'Garcia');
  });

  it('matches by city', async () => {
    await registerAndVerify(userA);
    await registerAndVerify(userC);
    const jwt = await registerAndVerify(userB);
    const res = await call('GET', '/api/search/families?q=phoenix', undefined, { authorization: `Bearer ${jwt}` });
    const items = res.body as JsonArr;
    assert.equal(items.length, 2);
  });

  it('matches by state', async () => {
    await registerAndVerify(userA);
    await registerAndVerify(userC);
    const jwt = await registerAndVerify(userB);
    const res = await call('GET', '/api/search/families?q=az', undefined, { authorization: `Bearer ${jwt}` });
    const items = res.body as JsonArr;
    assert.equal(items.length, 2);
  });

  it('rejects too-short queries with 400', async () => {
    const jwt = await registerAndVerify(userA);
    const res = await call('GET', '/api/search/families?q=a', undefined, { authorization: `Bearer ${jwt}` });
    assert.equal(res.status, 400);
  });

  it('rejects missing q with 400', async () => {
    const jwt = await registerAndVerify(userA);
    const res = await call('GET', '/api/search/families', undefined, { authorization: `Bearer ${jwt}` });
    assert.equal(res.status, 400);
  });

  it('requires auth (401 without JWT)', async () => {
    const res = await call('GET', '/api/search/families?q=garcia');
    assert.equal(res.status, 401);
  });

  it('honors the limit param', async () => {
    await registerAndVerify(userA);
    await registerAndVerify(userC);
    const jwt = await registerAndVerify(userB);
    const res = await call('GET', '/api/search/families?q=phoenix&limit=1', undefined, { authorization: `Bearer ${jwt}` });
    const items = res.body as JsonArr;
    assert.equal(items.length, 1);
  });
});
