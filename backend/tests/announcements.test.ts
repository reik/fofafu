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

  it('PATCH /api/comments/:id — too-long content returns 400 (Zod max 2000)', async () => {
    const jwtA = await register(userA);
    const post = await call('POST', '/api/announcements', { content: 'parent' }, { authorization: `Bearer ${jwtA}` });
    const postId = post.body['id'] as string;
    const created = await call('POST', `/api/announcements/${postId}/comments`, { content: 'orig' }, { authorization: `Bearer ${jwtA}` });
    const commentId = created.body['id'] as string;

    const tooLong = 'x'.repeat(2001);
    const bad = await call('PATCH', `/api/comments/${commentId}`, { content: tooLong }, { authorization: `Bearer ${jwtA}` });
    assert.equal(bad.status, 400);
  });

  it('listing roundtrip: after PATCH /api/comments/:id the listing endpoint reports the new updatedAt and content', async () => {
    const jwtA = await register(userA);
    const post = await call('POST', '/api/announcements', { content: 'parent' }, { authorization: `Bearer ${jwtA}` });
    const postId = post.body['id'] as string;
    const created = await call('POST', `/api/announcements/${postId}/comments`, { content: 'before edit' }, { authorization: `Bearer ${jwtA}` });
    const commentId = created.body['id'] as string;
    const createdAt = created.body['createdAt'] as string;

    await new Promise((r) => setTimeout(r, 1100));
    const patched = await call('PATCH', `/api/comments/${commentId}`, { content: 'after edit' }, { authorization: `Bearer ${jwtA}` });
    assert.equal(patched.status, 200);

    const list = await call('GET', `/api/announcements/${postId}/comments`, undefined, { authorization: `Bearer ${jwtA}` });
    const items = list.body as unknown as Json[];
    const found = items.find((i) => i['id'] === commentId);
    assert.ok(found, 'edited comment must appear in listing');
    assert.equal(found?.['content'], 'after edit');
    const listedUpdatedAt = found?.['updatedAt'] as string;
    assert.ok(listedUpdatedAt, 'listing endpoint must expose updatedAt');
    assert.ok(
      new Date(listedUpdatedAt).getTime() > new Date(createdAt).getTime(),
      'listing endpoint must reflect the new updatedAt after PATCH',
    );
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

  it('AnnouncementDTO populates authorAvatarUrl from joined families row', async () => {
    const jwt = await register(userA);
    await call('PATCH', '/api/family/me', { avatarUrl: 'https://example.com/avatar.png' }, { authorization: `Bearer ${jwt}` });

    const created = await call('POST', '/api/announcements', { content: 'with avatar' }, { authorization: `Bearer ${jwt}` });
    assert.equal(created.status, 201);
    assert.equal(created.body['authorAvatarUrl'], 'https://example.com/avatar.png');

    const id = created.body['id'] as string;
    const got = await call('GET', `/api/announcements/${id}`, undefined, { authorization: `Bearer ${jwt}` });
    assert.equal(got.body['authorAvatarUrl'], 'https://example.com/avatar.png');

    const list = await call('GET', '/api/announcements', undefined, { authorization: `Bearer ${jwt}` });
    const items = list.body['items'] as Json[];
    assert.equal(items[0]?.['authorAvatarUrl'], 'https://example.com/avatar.png');
  });

  it('AnnouncementDTO authorAvatarUrl is null when the family has no avatar set', async () => {
    const jwt = await register(userA);
    const created = await call('POST', '/api/announcements', { content: 'no avatar' }, { authorization: `Bearer ${jwt}` });
    assert.equal(created.body['authorAvatarUrl'], null);
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

  it('PATCH /api/comments/:id — author can edit own comment; updatedAt advances', async () => {
    const jwtA = await register(userA);
    const post = await call('POST', '/api/announcements', { content: 'parent post' }, { authorization: `Bearer ${jwtA}` });
    const postId = post.body['id'] as string;
    const created = await call('POST', `/api/announcements/${postId}/comments`, { content: 'first draft' }, { authorization: `Bearer ${jwtA}` });
    assert.equal(created.status, 201);
    const commentId = created.body['id'] as string;
    const createdAt = created.body['createdAt'] as string;
    assert.equal(created.body['updatedAt'], createdAt, 'on create, updatedAt should equal createdAt');

    // Sleep at least 1s so SQLite datetime('now') (1s resolution) advances.
    await new Promise((r) => setTimeout(r, 1100));

    const edited = await call('PATCH', `/api/comments/${commentId}`, { content: 'fixed typo' }, { authorization: `Bearer ${jwtA}` });
    assert.equal(edited.status, 200);
    assert.equal(edited.body['content'], 'fixed typo');
    assert.equal(edited.body['id'], commentId);
    assert.equal(edited.body['authorName'], userA.name, 'edited DTO carries authorName');
    assert.equal(edited.body['isAuthor'], true);
    assert.equal(edited.body['createdAt'], createdAt, 'createdAt is immutable');
    assert.ok(
      (edited.body['updatedAt'] as string) > createdAt,
      `updatedAt (${String(edited.body['updatedAt'])}) should advance past createdAt (${createdAt})`,
    );

    const list = await call('GET', `/api/announcements/${postId}/comments`, undefined, { authorization: `Bearer ${jwtA}` });
    const items = list.body as unknown as Json[];
    const found = items.find((i) => i['id'] === commentId);
    assert.equal(found?.['content'], 'fixed typo');
    assert.equal(found?.['updatedAt'], edited.body['updatedAt']);
  });

  it('PATCH /api/comments/:id — non-author gets 403; comment unchanged', async () => {
    const jwtA = await register(userA);
    const post = await call('POST', '/api/announcements', { content: 'parent' }, { authorization: `Bearer ${jwtA}` });
    const postId = post.body['id'] as string;
    const created = await call('POST', `/api/announcements/${postId}/comments`, { content: 'A says hi' }, { authorization: `Bearer ${jwtA}` });
    const commentId = created.body['id'] as string;

    const jwtB = await register(userB);
    const denied = await call('PATCH', `/api/comments/${commentId}`, { content: 'hijacked' }, { authorization: `Bearer ${jwtB}` });
    assert.equal(denied.status, 403);

    const list = await call('GET', `/api/announcements/${postId}/comments`, undefined, { authorization: `Bearer ${jwtA}` });
    const items = list.body as unknown as Json[];
    assert.equal(items[0]?.['content'], 'A says hi');
  });

  it('PATCH /api/comments/:id — 404 for unknown id, 400 for empty content, 401 without JWT', async () => {
    const jwtA = await register(userA);
    const missing = await call('PATCH', '/api/comments/00000000-0000-0000-0000-000000000000', { content: 'x' }, { authorization: `Bearer ${jwtA}` });
    assert.equal(missing.status, 404);

    const post = await call('POST', '/api/announcements', { content: 'p' }, { authorization: `Bearer ${jwtA}` });
    const postId = post.body['id'] as string;
    const created = await call('POST', `/api/announcements/${postId}/comments`, { content: 'real' }, { authorization: `Bearer ${jwtA}` });
    const commentId = created.body['id'] as string;

    const empty = await call('PATCH', `/api/comments/${commentId}`, { content: '' }, { authorization: `Bearer ${jwtA}` });
    assert.equal(empty.status, 400);

    const noAuth = await call('PATCH', `/api/comments/${commentId}`, { content: 'nope' });
    assert.equal(noAuth.status, 401);
  });

  it('CommentDTO shape — createComment + listComments expose updatedAt', async () => {
    const jwtA = await register(userA);
    const post = await call('POST', '/api/announcements', { content: 'parent' }, { authorization: `Bearer ${jwtA}` });
    const postId = post.body['id'] as string;
    const created = await call('POST', `/api/announcements/${postId}/comments`, { content: 'hello' }, { authorization: `Bearer ${jwtA}` });
    assert.ok('updatedAt' in created.body, 'createComment response must include updatedAt');
    assert.equal(typeof created.body['updatedAt'], 'string');

    const list = await call('GET', `/api/announcements/${postId}/comments`, undefined, { authorization: `Bearer ${jwtA}` });
    const items = list.body as unknown as Json[];
    assert.ok(items[0] && 'updatedAt' in items[0], 'listComments items must include updatedAt');
    assert.equal(typeof items[0]?.['updatedAt'], 'string');
  });

  // family-recent-posts: GET /api/announcements?familyId=<id> filters the feed
  // to posts authored by that family. Preserves the cursor/limit/nextCursor
  // contract and returns the same DTO shape as the home feed.
  describe('family-recent-posts: GET /api/announcements?familyId=<id>', () => {
    async function familyIdFor(jwt: string): Promise<string> {
      const me = await call('GET', '/api/family/me', undefined, { authorization: `Bearer ${jwt}` });
      return me.body['id'] as string;
    }

    it('filters to only that family\'s posts and paginates via the shared cursor', async () => {
      const jwtA = await register(userA);
      const jwtB = await register(userB);

      // A posts 3, B posts 2 — interleaved so naive ORDER BY would mix them.
      await call('POST', '/api/announcements', { content: 'A-1' }, { authorization: `Bearer ${jwtA}` });
      await new Promise((r) => setTimeout(r, 1100));
      await call('POST', '/api/announcements', { content: 'B-1' }, { authorization: `Bearer ${jwtB}` });
      await new Promise((r) => setTimeout(r, 1100));
      await call('POST', '/api/announcements', { content: 'A-2' }, { authorization: `Bearer ${jwtA}` });
      await new Promise((r) => setTimeout(r, 1100));
      await call('POST', '/api/announcements', { content: 'B-2' }, { authorization: `Bearer ${jwtB}` });
      await new Promise((r) => setTimeout(r, 1100));
      await call('POST', '/api/announcements', { content: 'A-3' }, { authorization: `Bearer ${jwtA}` });

      const familyA = await familyIdFor(jwtA);

      const page1 = await call('GET', `/api/announcements?familyId=${familyA}&limit=2`, undefined, { authorization: `Bearer ${jwtB}` });
      assert.equal(page1.status, 200);
      const items1 = page1.body['items'] as Json[];
      assert.equal(items1.length, 2);
      assert.equal(items1[0]?.['content'], 'A-3');
      assert.equal(items1[1]?.['content'], 'A-2');
      // Same DTO shape as home feed.
      assert.ok('reactions' in (items1[0] as Json));
      assert.ok('myReaction' in (items1[0] as Json));
      assert.ok('authorName' in (items1[0] as Json));
      assert.ok('isAuthor' in (items1[0] as Json));
      const cursor = page1.body['nextCursor'] as string;
      assert.ok(cursor, 'nextCursor should be set when a full page comes back');

      const page2 = await call('GET', `/api/announcements?familyId=${familyA}&limit=2&cursor=${encodeURIComponent(cursor)}`, undefined, { authorization: `Bearer ${jwtB}` });
      const items2 = page2.body['items'] as Json[];
      assert.equal(items2.length, 1, 'last page has the single remaining A-1 post');
      assert.equal(items2[0]?.['content'], 'A-1');
      assert.equal(page2.body['nextCursor'], null, 'nextCursor is null when fewer than limit rows returned');

      // Spot-check the filter: no B-* content appears in any A page.
      const allContent = [...items1, ...items2].map((i) => i['content']);
      assert.ok(!allContent.includes('B-1'));
      assert.ok(!allContent.includes('B-2'));
    });

    it('returns a single-item page when the family has exactly one post', async () => {
      const jwtA = await register(userA);
      await call('POST', '/api/announcements', { content: 'only post' }, { authorization: `Bearer ${jwtA}` });
      const familyA = await familyIdFor(jwtA);

      const res = await call('GET', `/api/announcements?familyId=${familyA}&limit=20`, undefined, { authorization: `Bearer ${jwtA}` });
      assert.equal(res.status, 200);
      const items = res.body['items'] as Json[];
      assert.equal(items.length, 1);
      assert.equal(items[0]?.['content'], 'only post');
      assert.equal(res.body['nextCursor'], null);
    });

    it('returns an empty page when the family has never posted', async () => {
      const jwtA = await register(userA);
      // userA registers but never posts.
      const familyA = await familyIdFor(jwtA);

      const res = await call('GET', `/api/announcements?familyId=${familyA}`, undefined, { authorization: `Bearer ${jwtA}` });
      assert.equal(res.status, 200);
      assert.deepEqual(res.body['items'], []);
      assert.equal(res.body['nextCursor'], null);
    });

    it('returns an empty page (not 404) when familyId is unknown', async () => {
      const jwtA = await register(userA);
      // A real-looking but non-existent UUID.
      const unknown = '00000000-0000-0000-0000-000000000000';
      const res = await call('GET', `/api/announcements?familyId=${unknown}`, undefined, { authorization: `Bearer ${jwtA}` });
      assert.equal(res.status, 200);
      assert.deepEqual(res.body['items'], []);
      assert.equal(res.body['nextCursor'], null);
    });

    it('rejects a non-UUID familyId with 400 (Zod)', async () => {
      const jwtA = await register(userA);
      const res = await call('GET', '/api/announcements?familyId=not-a-uuid', undefined, { authorization: `Bearer ${jwtA}` });
      assert.equal(res.status, 400);
    });

    it('requires auth (401 without JWT)', async () => {
      const res = await call('GET', '/api/announcements?familyId=00000000-0000-0000-0000-000000000000');
      assert.equal(res.status, 401);
    });
  });
});
