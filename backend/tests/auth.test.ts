import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Force in-memory DB and test mode BEFORE importing app modules.
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

async function call(method: string, path: string, body?: Json, headers: Record<string, string> = {}): Promise<{ status: number; body: Json }> {
  const port = await listen();
  const url = `http://127.0.0.1:${port}${path}`;
  const init: RequestInit = {
    method,
    headers: { 'content-type': 'application/json', ...headers },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(url, init);
  const text = await res.text();
  const parsed = text ? (JSON.parse(text) as Json) : {};
  return { status: res.status, body: parsed };
}

let server: ReturnType<ReturnType<typeof buildApp>['listen']> | null = null;
async function listen(): Promise<number> {
  if (server) return (server.address() as { port: number }).port;
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  return (server!.address() as { port: number }).port;
}

function resetDb(): void {
  closeDb();
  runMigrations();
  testInbox.length = 0;
}

const validRegister = {
  email: 'jane@example.com',
  password: 'correct-horse-battery',
  name: 'Jane Garcia',
  city: 'Phoenix',
  state: 'AZ',
};

describe('auth-email feature', () => {
  before(() => {
    runMigrations();
  });

  beforeEach(() => {
    resetDb();
  });

  it('registers a new user and queues a verification email', async () => {
    const res = await call('POST', '/api/auth/register', validRegister);
    assert.equal(res.status, 201);
    assert.match(res.body['message'] as string, /verify/i);

    const userRow = db().prepare('SELECT email, verified FROM users WHERE email = ?').get(validRegister.email);
    assert.deepEqual(userRow, { email: 'jane@example.com', verified: 0 });

    const tokenRow = db().prepare('SELECT used FROM email_tokens').get() as { used: number };
    assert.equal(tokenRow.used, 0);

    assert.equal(testInbox.length, 1);
    assert.equal(testInbox[0]?.to, 'jane@example.com');
  });

  it('refuses duplicate registration with 409', async () => {
    await call('POST', '/api/auth/register', validRegister);
    const res = await call('POST', '/api/auth/register', validRegister);
    assert.equal(res.status, 409);
  });

  it('refuses invalid email with 400 (Zod)', async () => {
    const res = await call('POST', '/api/auth/register', { ...validRegister, email: 'not-an-email' });
    assert.equal(res.status, 400);
    assert.equal(res.body['error'], 'Validation failed');
  });

  it('verifies a valid token and burns it', async () => {
    await call('POST', '/api/auth/register', validRegister);
    const token = testInbox[0]?.url.split('token=')[1] as string;

    const res = await call('GET', `/api/auth/verify?token=${token}`);
    assert.equal(res.status, 200);

    const userRow = db().prepare('SELECT verified FROM users').get() as { verified: number };
    assert.equal(userRow.verified, 1);

    const tokenRow = db().prepare('SELECT used FROM email_tokens').get() as { used: number };
    assert.equal(tokenRow.used, 1);
  });

  it('rejects a second use of the same token', async () => {
    await call('POST', '/api/auth/register', validRegister);
    const token = testInbox[0]?.url.split('token=')[1] as string;
    await call('GET', `/api/auth/verify?token=${token}`);
    const res = await call('GET', `/api/auth/verify?token=${token}`);
    assert.equal(res.status, 400);
  });

  it('rejects login for unverified users with 403', async () => {
    await call('POST', '/api/auth/register', validRegister);
    const res = await call('POST', '/api/auth/login', { email: validRegister.email, password: validRegister.password });
    assert.equal(res.status, 403);
  });

  it('logs in verified users and returns a JWT', async () => {
    await call('POST', '/api/auth/register', validRegister);
    const token = testInbox[0]?.url.split('token=')[1] as string;
    await call('GET', `/api/auth/verify?token=${token}`);

    const res = await call('POST', '/api/auth/login', { email: validRegister.email, password: validRegister.password });
    assert.equal(res.status, 200);
    assert.ok(typeof res.body['token'] === 'string' && (res.body['token'] as string).length > 20);
    assert.equal((res.body['user'] as Json)?.['email'], 'jane@example.com');
  });

  it('rejects wrong password with 401', async () => {
    await call('POST', '/api/auth/register', validRegister);
    const token = testInbox[0]?.url.split('token=')[1] as string;
    await call('GET', `/api/auth/verify?token=${token}`);

    const res = await call('POST', '/api/auth/login', { email: validRegister.email, password: 'wrong-password' });
    assert.equal(res.status, 401);
  });

  it('rejects unknown email with 401 (same shape as wrong password)', async () => {
    const res = await call('POST', '/api/auth/login', { email: 'nobody@example.com', password: 'whatever1' });
    assert.equal(res.status, 401);
  });
});
