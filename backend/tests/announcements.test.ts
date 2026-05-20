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

async function call(method: string, path: string, body?: Json, headers: Record<string, string> = {}): Promise<{ status: number; body: Json }> {
  const port = await listen();
  const init: RequestInit = { method, headers: { 'content-type': 'application/json', ...headers } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(`http://127.0.0.1:${port}${path}`, init);
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as Json) : {} };
}

const userA = { email: 'a@example.com', password: 'pass-aaaa-bbbb', name: 'A', city: 'Phoenix', state: 'AZ' };
const userB = { email: 'b@example.com', password: 'pass-cccc-dddd', name: 'B', city: 'Seattle', state: 'WA' };

async function register(creds: typeof userA): Promise<string> {
  await call('POST', '/api/auth/register', creds);
  const verifyToken = testInbox[testInbox.length - 1]?.url.split('token=')[1] as string;
  await call('GET', `/api/auth/verify?token=${verifyToken}`);
  const login = await call('POST', '/api/auth/login', { email: creds.email, password: creds.password });
  return login.body['token'] as string;
}

function resetDb(): void {
  closeDb();
  runMigrations();
  testInbox.length = 0;
}

describe('announcements-feed feature', () => {
  before(() => { runMigrations(); });
  beforeEach(() => { resetDb(); });
  after(() => { if (server) server.close(); });

  it('creates and reads back an announcement', async () => {
    const jwt = await register(userA);
    const res = await call('POST', '/api/announcements', { content: 'hello from the Garcias' }, { authorization: `Bearer ${jwt}` });
    assert.equal(res.status, 201);
    const id = res.body['id'] as string;
    const got = await call('GET', `/api/announcements/${id}`, undefined, { authorization: `Bearer ${jwt}` });
    assert.equal(got.body['content'], 'hello from the Garcias');
    assert.equal(got.body['isAuthor'], true);
    assert.deepEqual(got.body['reactions'], { like: 0, love: 0, hug: 0, celebrate: 0, support: 0 });
  });

  it('lists announcements newest first with cursor pagination', async () => {
    const jwt = await register(userA);
    for (let i = 0; i < 3; i++) {
      await call('POST', '/api/announcements', { content: `post ${i}` }, { authorization: `Bearer ${jwt}` });
      await new Promise((r) => setTimeout(r, 1100));
    }
    const page1 = await call('GET', '/api/announcements?limit=2', undefined, { authorization: `Bearer ${jwt}` });
    assert.equal(page1.status, 200);
    const items1 = page1.body['items'] as Json[];
    assert.equal(items1.length, 2);
    assert.equal(items1[0]?.['content'], 'post 2');
    assert.equal(items1[1]?.['content'], 'post 1');
    const cursor = page1.body['nextCursor'] as string;
    assert.ok(cursor);

    const page2 = await call('GET', `/api/announcements?limit=2&cursor=${encodeURIComponent(cursor)}`, undefined, { authorization: `Bearer ${jwt}` });
    const items2 = page2.body['items'] as Json[];
    assert.equal(items2.length, 1);
    assert.equal(items2[0]?.['content'], 'post 0');
    assert.equal(page2.body['nextCursor'], null);
  });

  it('only the author can PATCH an announcement', async () => {
    const jwtA = await register(userA);
    const created = await call('POST', '/api/announcements', { content: 'original' }, { authorization: `Bearer ${jwtA}` });
    const id = created.body['id'] as string;

    const jwtB = await register(userB);
    const denied = await call('PATCH', `/api/announcements/${id}`, { content: 'hijacked' }, { authorization: `Bearer ${jwtB}` });
    assert.equal(denied.status, 403);

    const ok = await call('PATCH', `/api/announcements/${id}`, { content: 'edited by author' }, { authorization: `Bearer ${jwtA}` });
    assert.equal(ok.status, 200);
    assert.equal(ok.body['content'], 'edited by author');
  });

  it('only the author can DELETE an announcement', async () => {
    const jwtA = await register(userA);
    const created = await call('POST', '/api/announcements', { content: 'will be deleted' }, { authorization: `Bearer ${jwtA}` });
    const id = created.body['id'] as string;
    const jwtB = await register(userB);
    const denied = await call('DELETE', `/api/announcements/${id}`, undefined, { authorization: `Bearer ${jwtB}` });
    assert.equal(denied.status, 403);
    const ok = await call('DELETE', `/api/announcements/${id}`, undefined, { authorization: `Bearer ${jwtA}` });
    assert.equal(ok.status, 204);
    const gone = await call('GET', `/api/announcements/${id}`, undefined, { authorization: `Bearer ${jwtA}` });
    assert.equal(gone.status, 404);
  });

  it('creates, lists, and (author-only) deletes comments', async () => {
    const jwtA = await register(userA);
    const post = await call('POST', '/api/announcements', { content: 'a post' }, { authorization: `Bearer ${jwtA}` });
    const id = post.body['id'] as string;
    const jwtB = await register(userB);
    const cA = await call('POST', `/api/announcements/${id}/comments`, { content: 'A comments' }, { authorization: `Bearer ${jwtA}` });
    const cB = await call('POST', `/api/announcements/${id}/comments`, { content: 'B comments' }, { authorization: `Bearer ${jwtB}` });
    assert.equal(cA.status, 201);
    assert.equal(cB.status, 201);

    const list = await call('GET', `/api/announcements/${id}/comments`, undefined, { authorization: `Bearer ${jwtA}` });
    const items = list.body as unknown as Json[];
    assert.equal(items.length, 2);
    assert.equal(items[0]?.['isAuthor'], true);
    assert.equal(items[1]?.['isAuthor'], false);

    const denied = await call('DELETE', `/api/comments/${cB.body['id']}`, undefined, { authorization: `Bearer ${jwtA}` });
    assert.equal(denied.status, 403);
    const ok = await call('DELETE', `/api/comments/${cB.body['id']}`, undefined, { authorization: `Bearer ${jwtB}` });
    assert.equal(ok.status, 204);
  });

  it('reaction toggle: add, then same type removes', async () => {
    const jwtA = await register(userA);
    const post = await call('POST', '/api/announcements', { content: 'react to me' }, { authorization: `Bearer ${jwtA}` });
    const id = post.body['id'] as string;

    const r1 = await call('POST', `/api/announcements/${id}/reactions`, { type: 'love' }, { authorization: `Bearer ${jwtA}` });
    assert.equal(r1.body['toggled'], 'added');
    assert.equal((r1.body['reactions'] as Json)['love'], 1);
    assert.equal(r1.body['myReaction'], 'love');

    const r2 = await call('POST', `/api/announcements/${id}/reactions`, { type: 'love' }, { authorization: `Bearer ${jwtA}` });
    assert.equal(r2.body['toggled'], 'removed');
    assert.equal((r2.body['reactions'] as Json)['love'], 0);
    assert.equal(r2.body['myReaction'], null);
  });

  it('reaction toggle: different type switches without doubling', async () => {
    const jwtA = await register(userA);
    const post = await call('POST', '/api/announcements', { content: 'switch me' }, { authorization: `Bearer ${jwtA}` });
    const id = post.body['id'] as string;
    await call('POST', `/api/announcements/${id}/reactions`, { type: 'like' }, { authorization: `Bearer ${jwtA}` });
    const switched = await call('POST', `/api/announcements/${id}/reactions`, { type: 'hug' }, { authorization: `Bearer ${jwtA}` });
    assert.equal(switched.body['toggled'], 'switched');
    assert.equal((switched.body['reactions'] as Json)['like'], 0);
    assert.equal((switched.body['reactions'] as Json)['hug'], 1);
    assert.equal(switched.body['myReaction'], 'hug');
  });

  it('aggregates reactions across multiple users on GET', async () => {
    const jwtA = await register(userA);
    const post = await call('POST', '/api/announcements', { content: 'aggregate me' }, { authorization: `Bearer ${jwtA}` });
    const id = post.body['id'] as string;
    const jwtB = await register(userB);
    await call('POST', `/api/announcements/${id}/reactions`, { type: 'love' }, { authorization: `Bearer ${jwtA}` });
    await call('POST', `/api/announcements/${id}/reactions`, { type: 'love' }, { authorization: `Bearer ${jwtB}` });
    const got = await call('GET', `/api/announcements/${id}`, undefined, { authorization: `Bearer ${jwtA}` });
    assert.equal((got.body['reactions'] as Json)['love'], 2);
    assert.equal(got.body['myReaction'], 'love');
  });

  it('rejects an unknown reaction type via Zod', async () => {
    const jwtA = await register(userA);
    const post = await call('POST', '/api/announcements', { content: 'x' }, { authorization: `Bearer ${jwtA}` });
    const id = post.body['id'] as string;
    const bad = await call('POST', `/api/announcements/${id}/reactions`, { type: 'fire' }, { authorization: `Bearer ${jwtA}` });
    assert.equal(bad.status, 400);
  });

  it('rejects empty content via Zod', async () => {
    const jwt = await register(userA);
    const res = await call('POST', '/api/announcements', { content: '' }, { authorization: `Bearer ${jwt}` });
    assert.equal(res.status, 400);
  });

  it('AnnouncementDTO populates authorName from joined families row', async () => {
    const jwt = await register(userA);
    const created = await call('POST', '/api/announcements', { content: 'with name' }, { authorization: `Bearer ${jwt}` });
    assert.equal(created.status, 201);
    assert.equal(created.body['authorName'], userA.name);

    const id = created.body['id'] as string;
    const got = await call('GET', `/api/announcements/${id}`, undefined, { authorization: `Bearer ${jwt}` });
    assert.equal(got.body['authorName'], userA.name);

    const list = await call('GET', '/api/announcements', undefined, { authorization: `Bearer ${jwt}` });
    const items = list.body['items'] as Json[];
    assert.equal(items[0]?.['authorName'], userA.name);
  });

  it('AnnouncementDTO authorName is null when family record is missing (orphaned author)', async () => {
    const jwt = await register(userA);
    const aRow = db().prepare('SELECT id FROM users WHERE email = ?').get(userA.email) as { id: string };
    db().prepare('INSERT INTO announcements (id, user_id, content) VALUES (?, ?, ?)')
      .run('11111111-1111-1111-1111-111111111111', aRow.id, 'orphan post');
    db().prepare('DELETE FROM families WHERE user_id = ?').run(aRow.id);

    const got = await call('GET', '/api/announcements/11111111-1111-1111-1111-111111111111', undefined, { authorization: `Bearer ${jwt}` });
    assert.equal(got.status, 200);
    assert.equal(got.body['authorName'], null);
    assert.equal(got.body['authorId'], aRow.id);
  });

  it('CommentDTO populates authorName and is null when family is missing', async () => {
    const jwtA = await register(userA);
    const post = await call('POST', '/api/announcements', { content: 'parent' }, { authorization: `Bearer ${jwtA}` });
    const postId = post.body['id'] as string;
    const jwtB = await register(userB);
    const cB = await call('POST', `/api/announcements/${postId}/comments`, { content: 'B says hi' }, { authorization: `Bearer ${jwtB}` });
    assert.equal(cB.body['authorName'], userB.name);

    const bRow = db().prepare('SELECT id FROM users WHERE email = ?').get(userB.email) as { id: string };
    db().prepare('DELETE FROM families WHERE user_id = ?').run(bRow.id);

    const list = await call('GET', `/api/announcements/${postId}/comments`, undefined, { authorization: `Bearer ${jwtA}` });
    const items = list.body as unknown as Json[];
    const orphan = items.find((i) => i['id'] === cB.body['id']);
    assert.equal(orphan?.['authorName'], null);
    assert.equal(orphan?.['authorId'], bRow.id);
  });

  it('all endpoints require auth (401 without JWT)', async () => {
    const list = await call('GET', '/api/announcements');
    const create = await call('POST', '/api/announcements', { content: 'x' });
    assert.equal(list.status, 401);
    assert.equal(create.status, 401);
  });
});
