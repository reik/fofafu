import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.FRONTEND_URL = 'http://localhost:5173';
// Flag flips per-test; default it on so most cases run the happy path.
process.env.REPLY_COACH_ENABLED = 'true';

const { buildApp } = await import('../src/index.js');
const { runMigrations } = await import('../src/migrate.js');
const { closeDb } = await import('../src/db.js');
const { testInbox } = await import('../src/services/email.service.js');
const { resetCoachRateLimitForTests } = await import('../src/services/coach/rateLimit.js');
const { setClaudeClientForTests } = await import('../src/services/coach/claudeClient.js');

const app = buildApp();
type Json = Record<string, unknown>;

let server: ReturnType<ReturnType<typeof buildApp>['listen']> | null = null;
async function listen(): Promise<number> {
  if (server) return (server.address() as { port: number }).port;
  await new Promise<void>((r) => { server = app.listen(0, () => r()); });
  return (server!.address() as { port: number }).port;
}

async function call(method: string, path: string, body?: Json, headers: Record<string, string> = {}): Promise<{ status: number; body: Json; headers: Headers }> {
  const port = await listen();
  const init: RequestInit = { method, headers: { 'content-type': 'application/json', ...headers } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(`http://127.0.0.1:${port}${path}`, init);
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as Json) : {}, headers: res.headers };
}

const userA = { email: 'a@example.com', password: 'pass-aaaa-bbbb', name: 'A', city: 'Phoenix', state: 'AZ' };

async function register(creds: typeof userA): Promise<string> {
  await call('POST', '/api/auth/register', creds);
  const verifyToken = testInbox[testInbox.length - 1]?.url.split('token=')[1] as string;
  await call('GET', `/api/auth/verify?token=${verifyToken}`);
  const login = await call('POST', '/api/auth/login', { email: creds.email, password: creds.password });
  return login.body['token'] as string;
}

async function resetDb(): Promise<void> {
  await closeDb();
  await runMigrations();
  testInbox.length = 0;
  resetCoachRateLimitForTests();
  setClaudeClientForTests(null);
  process.env.REPLY_COACH_ENABLED = 'true';
}

describe('reply-coach feature', () => {
  before(async () => { await runMigrations(); });
  beforeEach(async () => { await resetDb(); });
  after(() => { if (server) server.close(); });

  it('returns the neutral fixture for a benign draft (verdict=ok)', async () => {
    const jwt = await register(userA);
    const res = await call('POST', '/api/comments/coach', {
      draft: 'Praying for your family this week.',
    }, { authorization: `Bearer ${jwt}` });
    assert.equal(res.status, 200);
    assert.equal(res.body['verdict'], 'ok');
    assert.deepEqual(res.body['categories'], []);
    assert.equal(res.body['reasoning'], '');
    assert.equal(res.body['rewrite'], null);
  });

  it('returns the minimization fixture for the canonical "at least" draft', async () => {
    const jwt = await register(userA);
    const res = await call('POST', '/api/comments/coach', {
      draft: 'At least you got to keep her for a while.',
    }, { authorization: `Bearer ${jwt}` });
    assert.equal(res.status, 200);
    assert.equal(res.body['verdict'], 'suggest');
    assert.deepEqual(res.body['categories'], ['minimization']);
    assert.equal(
      res.body['rewrite'],
      "The time you had with her mattered, and I'm sorry it's ending this way.",
    );
    assert.equal(
      res.body['reasoning'],
      '"At least" can shrink a loss the family is still carrying — a phrasing that stays with the loss tends to land softer.',
    );
  });

  it('returns the savior-framing fixture for the canonical "saint" draft', async () => {
    const jwt = await register(userA);
    const res = await call('POST', '/api/comments/coach', {
      draft: "You're such a saint for taking him in.",
    }, { authorization: `Bearer ${jwt}` });
    assert.equal(res.status, 200);
    assert.equal(res.body['verdict'], 'suggest');
    assert.deepEqual(res.body['categories'], ['savior-framing']);
    assert.equal(
      res.body['rewrite'],
      "He's lucky to have you showing up for him like this.",
    );
    assert.equal(
      res.body['reasoning'],
      'Calling a foster parent a saint can make the everyday work feel like a performance — naming the care directly tends to feel closer.',
    );
  });

  it('falls back to verdict=ok for any unrecognised draft', async () => {
    const jwt = await register(userA);
    const res = await call('POST', '/api/comments/coach', {
      draft: 'Something completely unrelated that the mock has no opinion on.',
    }, { authorization: `Bearer ${jwt}` });
    assert.equal(res.status, 200);
    assert.equal(res.body['verdict'], 'ok');
    assert.equal(res.body['rewrite'], null);
  });

  it('accepts optional threadContext without changing the verdict', async () => {
    const jwt = await register(userA);
    const res = await call('POST', '/api/comments/coach', {
      draft: 'Praying for your family this week.',
      threadContext: {
        postTitle: 'Hard week',
        recentComments: [
          { author: 'Garcia', body: 'thinking of you' },
          { author: 'Lee', body: 'sending love' },
        ],
      },
    }, { authorization: `Bearer ${jwt}` });
    assert.equal(res.status, 200);
    assert.equal(res.body['verdict'], 'ok');
  });

  it('rejects malformed bodies with 400', async () => {
    const jwt = await register(userA);
    const res = await call('POST', '/api/comments/coach', {
      // draft missing entirely
      threadContext: { postTitle: 'x', recentComments: [] },
    } as unknown as Json, { authorization: `Bearer ${jwt}` });
    assert.equal(res.status, 400);
  });

  it('rejects empty drafts with 400', async () => {
    const jwt = await register(userA);
    const res = await call('POST', '/api/comments/coach', { draft: '' }, { authorization: `Bearer ${jwt}` });
    assert.equal(res.status, 400);
  });

  it('rejects oversized drafts (4001 chars) with 400', async () => {
    const jwt = await register(userA);
    // Schema cap is z.string().min(1).max(4000); one byte over should fail Zod validation.
    const oversized = 'a'.repeat(4001);
    const res = await call('POST', '/api/comments/coach', { draft: oversized }, { authorization: `Bearer ${jwt}` });
    assert.equal(res.status, 400);
  });

  it('rejects threadContext.recentComments with more than 10 items (11) with 400', async () => {
    const jwt = await register(userA);
    // Schema cap is .max(10); 11 items should fail Zod validation.
    const recentComments = Array.from({ length: 11 }, (_, i) => ({
      author: `author-${i}`,
      body: `body-${i}`,
    }));
    const res = await call('POST', '/api/comments/coach', {
      draft: 'Praying for your family this week.',
      threadContext: { postTitle: 'Hard week', recentComments },
    }, { authorization: `Bearer ${jwt}` });
    assert.equal(res.status, 400);
  });

  it('returns 404 when the feature flag is off (and skips auth)', async () => {
    const jwt = await register(userA);
    process.env.REPLY_COACH_ENABLED = 'false';
    const res = await call('POST', '/api/comments/coach', {
      draft: 'Praying for your family this week.',
    }, { authorization: `Bearer ${jwt}` });
    assert.equal(res.status, 404);
  });

  it('returns 404 when the flag is off even without auth', async () => {
    process.env.REPLY_COACH_ENABLED = 'false';
    const res = await call('POST', '/api/comments/coach', { draft: 'whatever' });
    assert.equal(res.status, 404);
  });

  it('requires auth (401 without JWT) when the flag is on', async () => {
    const res = await call('POST', '/api/comments/coach', { draft: 'whatever' });
    assert.equal(res.status, 401);
  });

  it('rate-limits at 60 calls per user per rolling hour (61st returns 429)', async () => {
    const jwt = await register(userA);
    const headers = { authorization: `Bearer ${jwt}` };
    for (let i = 0; i < 60; i++) {
      const res = await call('POST', '/api/comments/coach', { draft: `draft ${i}` }, headers);
      assert.equal(res.status, 200, `call ${i + 1} should succeed`);
    }
    const over = await call('POST', '/api/comments/coach', { draft: 'one too many' }, headers);
    assert.equal(over.status, 429);
    const retryAfter = Number(over.headers.get('retry-after'));
    assert.ok(Number.isFinite(retryAfter) && retryAfter >= 1, 'Retry-After should be a positive integer (seconds)');
  });

  it('returns the silent fallback (200 + verdict=ok) when the Claude client throws', async () => {
    const jwt = await register(userA);
    setClaudeClientForTests({
      async coach() { throw new Error('simulated upstream timeout'); },
    });
    const res = await call('POST', '/api/comments/coach', {
      draft: 'At least you got to keep her for a while.',
    }, { authorization: `Bearer ${jwt}` });
    assert.equal(res.status, 200);
    assert.equal(res.body['verdict'], 'ok');
    assert.deepEqual(res.body['categories'], []);
    assert.equal(res.body['reasoning'], '');
    assert.equal(res.body['rewrite'], null);
  });
});
