import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

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

const userA = { email: 'a@example.com', password: 'pass-aaaa-bbbb', name: 'A', city: 'Phoenix', state: 'AZ' };

type Json = Record<string, unknown>;

async function callJson(method: string, p: string, body?: Json, headers: Record<string, string> = {}): Promise<{ status: number; body: Json }> {
  const port = await listen();
  const init: RequestInit = { method, headers: { 'content-type': 'application/json', ...headers } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(`http://127.0.0.1:${port}${p}`, init);
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as Json) : {} };
}

async function register(): Promise<string> {
  await callJson('POST', '/api/auth/register', userA);
  const verifyToken = testInbox[testInbox.length - 1]?.url.split('token=')[1] as string;
  await callJson('GET', `/api/auth/verify?token=${verifyToken}`);
  const login = await callJson('POST', '/api/auth/login', { email: userA.email, password: userA.password });
  return login.body['token'] as string;
}

async function postMultipart(path: string, fileBytes: Buffer, mime: string, filename: string, jwt?: string): Promise<{ status: number; body: Json }> {
  const port = await listen();
  const form = new FormData();
  const blob = new Blob([fileBytes], { type: mime });
  form.append('file', blob, filename);
  const init: RequestInit = { method: 'POST', body: form };
  if (jwt) init.headers = { authorization: `Bearer ${jwt}` };
  const res = await fetch(`http://127.0.0.1:${port}${path}`, init);
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as Json) : {} };
}

// 1x1 PNG (transparent)
const TINY_PNG = Buffer.from(
  '89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000A49444154789C63000100000005000196250003F50000000049454E44AE426082',
  'hex'
);

function resetDb(): void {
  closeDb();
  runMigrations();
  testInbox.length = 0;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.resolve(__dirname, '../uploads');

async function purgeUploadDir(): Promise<void> {
  try {
    const files = await fs.readdir(UPLOAD_DIR);
    await Promise.all(files
      .filter((f) => f !== '.gitkeep')
      .map((f) => fs.unlink(path.join(UPLOAD_DIR, f)).catch(() => undefined)));
  } catch {
    // dir may not exist in some envs — ignore.
  }
}

describe('uploads-images feature', () => {
  before(() => { runMigrations(); });
  beforeEach(async () => {
    resetDb();
    await purgeUploadDir();
  });
  after(async () => {
    if (server) server.close();
    await purgeUploadDir();
  });

  it('uploads a PNG and serves it back from /uploads', async () => {
    const jwt = await register();
    const res = await postMultipart('/api/uploads', TINY_PNG, 'image/png', 'a.png', jwt);
    assert.equal(res.status, 201);
    assert.equal(res.body['mediaType'], 'image');
    const url = res.body['url'] as string;
    assert.match(url, /^\/uploads\/[0-9a-f-]+\.png$/);

    const port = await listen();
    const fetched = await fetch(`http://127.0.0.1:${port}${url}`);
    assert.equal(fetched.status, 200);
    assert.equal(fetched.headers.get('content-type'), 'image/png');
  });

  it('rejects non-image MIME with 400', async () => {
    const jwt = await register();
    const res = await postMultipart('/api/uploads', Buffer.from('hello'), 'text/plain', 'a.txt', jwt);
    assert.equal(res.status, 400);
  });

  it('rejects images > 5 MB with 413', async () => {
    const jwt = await register();
    const oversize = Buffer.alloc(6 * 1024 * 1024, 0x00);
    const res = await postMultipart('/api/uploads', oversize, 'image/png', 'big.png', jwt);
    assert.equal(res.status, 413);
  });

  it('rejects unauthenticated uploads with 401', async () => {
    const res = await postMultipart('/api/uploads', TINY_PNG, 'image/png', 'a.png');
    assert.equal(res.status, 401);
  });
});
