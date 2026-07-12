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
const userB = { email: 'b@example.com', password: 'pass-cccc-dddd', name: 'Patel',  city: 'Seattle', state: 'WA' };

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

async function dropFamilyFor(userId: string): Promise<void> {
  await db().prepare('DELETE FROM families WHERE user_id = ?').run(userId);
}

async function setAvatarFor(userId: string, avatarUrl: string): Promise<void> {
  await db().prepare('UPDATE families SET avatar_url = ? WHERE user_id = ?').run(avatarUrl, userId);
}

describe('author-display-names — DTO hydration', () => {
  before(async () => { await runMigrations(); });
  beforeEach(async () => { await resetDb(); });
  after(() => { if (server) server.close(); });

  describe('announcements', () => {
    it('GET /api/announcements/:id returns authorName from the family table', async () => {
      const a = await register(userA);
      const created = await call('POST', '/api/announcements', { content: 'hi' }, { authorization: `Bearer ${a.jwt}` });
      const id = (created.body as Json)['id'] as string;

      const got = await call('GET', `/api/announcements/${id}`, undefined, { authorization: `Bearer ${a.jwt}` });
      assert.equal(got.status, 200);
      assert.equal((got.body as Json)['authorName'], 'Garcia');
      assert.equal((got.body as Json)['authorId'], a.userId);
    });

    it('GET /api/announcements (list) hydrates authorName for every item', async () => {
      const a = await register(userA);
      const b = await register(userB);
      await call('POST', '/api/announcements', { content: 'from A' }, { authorization: `Bearer ${a.jwt}` });
      await new Promise((r) => setTimeout(r, 1100));
      await call('POST', '/api/announcements', { content: 'from B' }, { authorization: `Bearer ${b.jwt}` });

      const list = await call('GET', '/api/announcements', undefined, { authorization: `Bearer ${a.jwt}` });
      const items = (list.body as Json)['items'] as Json[];
      assert.equal(items.length, 2);
      // newest first → B then A
      assert.equal(items[0]?.['authorName'], 'Patel');
      assert.equal(items[1]?.['authorName'], 'Garcia');
    });

    it('GET /api/announcements/:id returns authorName=null when the family record is missing', async () => {
      const a = await register(userA);
      const b = await register(userB);
      const created = await call('POST', '/api/announcements', { content: 'orphan post' }, { authorization: `Bearer ${a.jwt}` });
      const id = (created.body as Json)['id'] as string;

      await dropFamilyFor(a.userId);

      const got = await call('GET', `/api/announcements/${id}`, undefined, { authorization: `Bearer ${b.jwt}` });
      assert.equal(got.status, 200);
      assert.equal((got.body as Json)['authorId'], a.userId);
      assert.equal((got.body as Json)['authorName'], null);
    });

    it('GET /api/announcements/:id and list return authorAvatarUrl matching families.avatar_url when set', async () => {
      const a = await register(userA);
      await setAvatarFor(a.userId, 'https://cdn.example.com/avatars/garcia.png');

      const created = await call('POST', '/api/announcements', { content: 'with avatar' }, { authorization: `Bearer ${a.jwt}` });
      const id = (created.body as Json)['id'] as string;
      assert.equal((created.body as Json)['authorAvatarUrl'], 'https://cdn.example.com/avatars/garcia.png');

      const got = await call('GET', `/api/announcements/${id}`, undefined, { authorization: `Bearer ${a.jwt}` });
      assert.equal(got.status, 200);
      assert.equal((got.body as Json)['authorAvatarUrl'], 'https://cdn.example.com/avatars/garcia.png');

      const list = await call('GET', '/api/announcements', undefined, { authorization: `Bearer ${a.jwt}` });
      const items = (list.body as Json)['items'] as Json[];
      assert.equal(items[0]?.['authorAvatarUrl'], 'https://cdn.example.com/avatars/garcia.png');
    });

    it('GET /api/announcements/:id returns authorAvatarUrl=null when the family has no avatar_url set', async () => {
      const a = await register(userA);
      const created = await call('POST', '/api/announcements', { content: 'no avatar' }, { authorization: `Bearer ${a.jwt}` });
      const id = (created.body as Json)['id'] as string;

      const got = await call('GET', `/api/announcements/${id}`, undefined, { authorization: `Bearer ${a.jwt}` });
      assert.equal(got.status, 200);
      assert.equal((got.body as Json)['authorAvatarUrl'], null);
    });

    it('GET /api/announcements/:id returns authorAvatarUrl=null when the family record is missing', async () => {
      const a = await register(userA);
      const b = await register(userB);
      const created = await call('POST', '/api/announcements', { content: 'orphan avatar' }, { authorization: `Bearer ${a.jwt}` });
      const id = (created.body as Json)['id'] as string;

      await dropFamilyFor(a.userId);

      const got = await call('GET', `/api/announcements/${id}`, undefined, { authorization: `Bearer ${b.jwt}` });
      assert.equal(got.status, 200);
      assert.equal((got.body as Json)['authorAvatarUrl'], null);
      assert.equal((got.body as Json)['authorName'], null);
    });

    it('GET /api/announcements/:id/comments hydrates authorName per comment, null when family missing', async () => {
      const a = await register(userA);
      const b = await register(userB);
      const post = await call('POST', '/api/announcements', { content: 'a post' }, { authorization: `Bearer ${a.jwt}` });
      const id = (post.body as Json)['id'] as string;
      await call('POST', `/api/announcements/${id}/comments`, { content: 'from A' }, { authorization: `Bearer ${a.jwt}` });
      await new Promise((r) => setTimeout(r, 1100));
      await call('POST', `/api/announcements/${id}/comments`, { content: 'from B' }, { authorization: `Bearer ${b.jwt}` });

      await dropFamilyFor(b.userId);

      const list = await call('GET', `/api/announcements/${id}/comments`, undefined, { authorization: `Bearer ${a.jwt}` });
      const items = list.body as Json[];
      assert.equal(items.length, 2);
      assert.equal(items[0]?.['authorName'], 'Garcia');
      assert.equal(items[1]?.['authorName'], null);
    });

    it('POST /api/announcements echoes back authorName for the new post', async () => {
      const a = await register(userA);
      const res = await call('POST', '/api/announcements', { content: 'fresh' }, { authorization: `Bearer ${a.jwt}` });
      assert.equal(res.status, 201);
      assert.equal((res.body as Json)['authorName'], 'Garcia');
    });

    it('POST /api/announcements/:id/comments echoes back authorName for the new comment', async () => {
      const a = await register(userA);
      const post = await call('POST', '/api/announcements', { content: 'p' }, { authorization: `Bearer ${a.jwt}` });
      const id = (post.body as Json)['id'] as string;
      const res = await call('POST', `/api/announcements/${id}/comments`, { content: 'first' }, { authorization: `Bearer ${a.jwt}` });
      assert.equal(res.status, 201);
      assert.equal((res.body as Json)['authorName'], 'Garcia');
    });
  });

  describe('messages', () => {
    it('GET /api/messages/threads hydrates partnerName per row', async () => {
      const a = await register(userA);
      const b = await register(userB);
      await call('POST', '/api/messages', { to: a.userId, content: 'hi A' }, { authorization: `Bearer ${b.jwt}` });

      const threads = await call('GET', '/api/messages/threads', undefined, { authorization: `Bearer ${a.jwt}` });
      const items = threads.body as Json[];
      assert.equal(items.length, 1);
      assert.equal(items[0]?.['partnerId'], b.userId);
      assert.equal(items[0]?.['partnerName'], 'Patel');
    });

    it('GET /api/messages/threads returns partnerName=null when the partner family is missing', async () => {
      const a = await register(userA);
      const b = await register(userB);
      await call('POST', '/api/messages', { to: a.userId, content: 'hi A' }, { authorization: `Bearer ${b.jwt}` });

      await dropFamilyFor(b.userId);

      const threads = await call('GET', '/api/messages/threads', undefined, { authorization: `Bearer ${a.jwt}` });
      const items = threads.body as Json[];
      assert.equal(items.length, 1);
      assert.equal(items[0]?.['partnerId'], b.userId);
      assert.equal(items[0]?.['partnerName'], null);
    });
  });
});
