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

async function call(method: string, path: string, body?: Json, headers: Record<string, string> = {}): Promise<{ status: number; body: Json | Json[] }> {
  const port = await listen();
  const init: RequestInit = { method, headers: { 'content-type': 'application/json', ...headers } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(`http://127.0.0.1:${port}${path}`, init);
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as Json | Json[]) : {} };
}

const userA = { email: 'a@example.com', password: 'pass-aaaa-bbbb', name: 'A', city: 'Phoenix', state: 'AZ' };
const userB = { email: 'b@example.com', password: 'pass-cccc-dddd', name: 'B', city: 'Seattle', state: 'WA' };
const userC = { email: 'c@example.com', password: 'pass-eeee-ffff', name: 'C', city: 'Denver',  state: 'CO' };

async function register(creds: typeof userA): Promise<{ jwt: string; userId: string }> {
  await call('POST', '/api/auth/register', creds);
  const verifyToken = testInbox[testInbox.length - 1]?.url.split('token=')[1] as string;
  await call('GET', `/api/auth/verify?token=${verifyToken}`);
  const login = await call('POST', '/api/auth/login', { email: creds.email, password: creds.password });
  const loginBody = login.body as Json;
  return { jwt: loginBody['token'] as string, userId: (loginBody['user'] as Json)['id'] as string };
}

async function resetDb(): Promise<void> {
  await closeDb();
  await runMigrations();
  testInbox.length = 0;
}

describe('messaging-dms feature', () => {
  before(async () => { await runMigrations(); });
  beforeEach(async () => { await resetDb(); });
  after(() => { if (server) server.close(); });

  it('sends a message and the recipient sees it in the thread', async () => {
    const a = await register(userA);
    const b = await register(userB);
    const sent = await call('POST', '/api/messages', { to: b.userId, content: 'hello B' }, { authorization: `Bearer ${a.jwt}` });
    assert.equal(sent.status, 201);
    assert.equal((sent.body as Json)['content'], 'hello B');
    assert.equal((sent.body as Json)['mine'], true);

    const threadForB = await call('GET', `/api/messages/threads/${a.userId}`, undefined, { authorization: `Bearer ${b.jwt}` });
    assert.equal(threadForB.status, 200);
    const items = threadForB.body as Json[];
    assert.equal(items.length, 1);
    assert.equal(items[0]?.['content'], 'hello B');
    assert.equal(items[0]?.['mine'], false);
  });

  it('rejects self-sends with 400', async () => {
    const a = await register(userA);
    const res = await call('POST', '/api/messages', { to: a.userId, content: 'note to self' }, { authorization: `Bearer ${a.jwt}` });
    assert.equal(res.status, 400);
  });

  it('rejects send to unknown user with 404', async () => {
    const a = await register(userA);
    const res = await call('POST', '/api/messages', { to: '00000000-0000-0000-0000-000000000000', content: 'lost' }, { authorization: `Bearer ${a.jwt}` });
    assert.equal(res.status, 404);
  });

  it('lists threads ordered by most-recent activity with unread counts', async () => {
    const a = await register(userA);
    const b = await register(userB);
    const c = await register(userC);

    await call('POST', '/api/messages', { to: a.userId, content: 'from B' }, { authorization: `Bearer ${b.jwt}` });
    await new Promise((r) => setTimeout(r, 1100));
    await call('POST', '/api/messages', { to: a.userId, content: 'from C #1' }, { authorization: `Bearer ${c.jwt}` });
    await call('POST', '/api/messages', { to: a.userId, content: 'from C #2' }, { authorization: `Bearer ${c.jwt}` });

    const threads = await call('GET', '/api/messages/threads', undefined, { authorization: `Bearer ${a.jwt}` });
    const items = threads.body as Json[];
    assert.equal(items.length, 2);
    assert.equal(items[0]?.['partnerId'], c.userId);
    assert.equal(items[0]?.['unreadCount'], 2);
    assert.equal(items[1]?.['partnerId'], b.userId);
    assert.equal(items[1]?.['unreadCount'], 1);
  });

  it('mark-thread-read flips read=1 and zeroes unread for that partner only', async () => {
    const a = await register(userA);
    const b = await register(userB);
    const c = await register(userC);
    await call('POST', '/api/messages', { to: a.userId, content: 'b1' }, { authorization: `Bearer ${b.jwt}` });
    await call('POST', '/api/messages', { to: a.userId, content: 'b2' }, { authorization: `Bearer ${b.jwt}` });
    await call('POST', '/api/messages', { to: a.userId, content: 'c1' }, { authorization: `Bearer ${c.jwt}` });

    const mark = await call('POST', `/api/messages/threads/${b.userId}/read`, undefined, { authorization: `Bearer ${a.jwt}` });
    assert.equal(mark.status, 200);
    assert.equal((mark.body as Json)['marked'], 2);

    const count = await call('GET', '/api/messages/unread/count', undefined, { authorization: `Bearer ${a.jwt}` });
    assert.equal((count.body as Json)['count'], 1);
  });

  it('unread-count returns 0 when no inbound unread', async () => {
    const a = await register(userA);
    const count = await call('GET', '/api/messages/unread/count', undefined, { authorization: `Bearer ${a.jwt}` });
    assert.equal((count.body as Json)['count'], 0);
  });

  it('ThreadDTO populates partnerName from joined families row', async () => {
    const a = await register(userA);
    const b = await register(userB);
    await call('POST', '/api/messages', { to: b.userId, content: 'hi B' }, { authorization: `Bearer ${a.jwt}` });

    const threads = await call('GET', '/api/messages/threads', undefined, { authorization: `Bearer ${a.jwt}` });
    const items = threads.body as Json[];
    assert.equal(items.length, 1);
    assert.equal(items[0]?.['partnerId'], b.userId);
    assert.equal(items[0]?.['partnerName'], userB.name);
  });

  it('ThreadDTO partnerName is null when partner family is missing', async () => {
    const a = await register(userA);
    const b = await register(userB);
    await call('POST', '/api/messages', { to: b.userId, content: 'hi B' }, { authorization: `Bearer ${a.jwt}` });
    await db().prepare('DELETE FROM families WHERE user_id = ?').run(b.userId);

    const threads = await call('GET', '/api/messages/threads', undefined, { authorization: `Bearer ${a.jwt}` });
    const items = threads.body as Json[];
    assert.equal(items[0]?.['partnerId'], b.userId);
    assert.equal(items[0]?.['partnerName'], null);
  });

  it('MessageDTO populates fromName/toName and is null when family is missing', async () => {
    const a = await register(userA);
    const b = await register(userB);
    const sent = await call('POST', '/api/messages', { to: b.userId, content: 'named send' }, { authorization: `Bearer ${a.jwt}` });
    assert.equal((sent.body as Json)['fromName'], userA.name);
    assert.equal((sent.body as Json)['toName'], userB.name);

    await db().prepare('DELETE FROM families WHERE user_id = ?').run(b.userId);
    const thread = await call('GET', `/api/messages/threads/${b.userId}`, undefined, { authorization: `Bearer ${a.jwt}` });
    const items = thread.body as Json[];
    assert.equal(items[0]?.['fromName'], userA.name);
    assert.equal(items[0]?.['toName'], null);
  });

  it('all message endpoints require auth (401 without JWT)', async () => {
    const send = await call('POST', '/api/messages', { to: '00000000-0000-0000-0000-000000000000', content: 'x' });
    const threads = await call('GET', '/api/messages/threads');
    const count = await call('GET', '/api/messages/unread/count');
    assert.equal(send.status, 401);
    assert.equal(threads.status, 401);
    assert.equal(count.status, 401);
  });
});
