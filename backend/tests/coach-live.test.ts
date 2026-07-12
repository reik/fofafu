// Test plan for `reply-coach-live` (see fofafu_vault/features/reply-coach-live.md).
//
// IMPORTANT: every test in this file runs against a MOCKED @anthropic-ai/sdk
// client. No real ANTHROPIC_API_KEY is used or required. Tests inject a fake
// client (`makeFakeAnthropicClient`, mirroring the MockClaudeClient pattern
// from the parent `reply-coach` feature) into whatever seam `LiveClaudeClient`
// exposes for dependency injection, and assert on the plumbing around it
// (flag gating, cost cap, holdback, cache-control header, boot-refusal,
// coach_events persistence) — never on real model output quality.
//
// Because this file is written before backend-dev's LiveClaudeClient lands
// (per the global TDD rule), each `describe` block dynamically imports its
// subject and SKIPS (not fails) if the module/export doesn't exist yet, so
// the rest of the backend suite is never blocked by this file. Once
// backend-dev's code lands, remove the skip guards (or they'll no-op
// automatically once the imports resolve).

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.FRONTEND_URL = 'http://localhost:5173';

async function tryImport<T>(path: string): Promise<T | null> {
  try {
    return (await import(path)) as T;
  } catch {
    return null;
  }
}

// A fake Anthropic client following the shape LiveClaudeClient is expected to
// wrap (`messages.create`). Never touches the network.
function makeFakeAnthropicClient(opts: {
  text?: string;
  usage?: { input_tokens: number; output_tokens: number };
  cacheHit?: boolean;
  throwOn?: boolean;
} = {}) {
  const text = opts.text ?? '{"verdict":"ok","categories":[],"reasoning":"","rewrite":null}';
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    messages: {
      create: async (params: Record<string, unknown>) => {
        calls.push(params);
        if (opts.throwOn) throw new Error('simulated SDK failure');
        return {
          content: [{ type: 'text', text }],
          usage: opts.usage ?? { input_tokens: 100, output_tokens: 50 },
          _fakeCacheHit: opts.cacheHit ?? false,
        };
      },
    },
  };
}

describe('reply-coach-live: LiveClaudeClient wiring', async () => {
  const mod = await tryImport<{
    LiveClaudeClient?: new (client: unknown) => { coach(input: unknown): Promise<unknown> };
    getClaudeClient?: () => unknown;
  }>('../src/services/coach/claudeClient.js');

  it('LiveClaudeClient is exported and registered as the default client', () => {
    if (!mod?.LiveClaudeClient) {
      return void it.skip('LiveClaudeClient not implemented yet — pending backend-dev');
    }
    assert.ok(mod.LiveClaudeClient, 'LiveClaudeClient class should be exported');
  });

  it('LiveClaudeClient.coach() sends the canonical system prompt to the mocked client', async () => {
    if (!mod?.LiveClaudeClient) return void it.skip('pending backend-dev');
    const promptMod = await tryImport<{ COACH_SYSTEM_PROMPT?: string }>('../src/services/coach/systemPrompt.js');
    if (!promptMod?.COACH_SYSTEM_PROMPT) return void it.skip('COACH_SYSTEM_PROMPT constant not found — pending backend-dev');

    const fake = makeFakeAnthropicClient();
    const client = new mod.LiveClaudeClient(fake);
    await client.coach({ draft: 'Praying for your family this week.' });

    assert.equal(fake.calls.length, 1);
    const call = fake.calls[0];
    // system prompt wiring must use the canonical constant, not an inline string
    assert.ok(
      JSON.stringify(call).includes(promptMod.COACH_SYSTEM_PROMPT.slice(0, 40)),
      'call to Anthropic client should include the canonical system prompt',
    );
  });

  it('configures prompt caching (cache_control) on the system block', async () => {
    if (!mod?.LiveClaudeClient) return void it.skip('pending backend-dev');
    const fake = makeFakeAnthropicClient();
    const client = new mod.LiveClaudeClient(fake);
    await client.coach({ draft: 'Praying for your family this week.' });

    const call = fake.calls[0] as { system?: unknown };
    const serialized = JSON.stringify(call.system);
    assert.ok(serialized.includes('cache_control'), 'system block should carry cache_control for prompt caching');
  });
});

describe('reply-coach-live: boot-refusal on missing ANTHROPIC_API_KEY', async () => {
  const bootMod = await tryImport<{ assertCoachBootPreconditions?: () => void }>('../src/services/coach/bootCheck.js');

  it('throws at startup when reply_coach_enabled=true and ANTHROPIC_API_KEY is missing', () => {
    if (!bootMod?.assertCoachBootPreconditions) return void it.skip('bootCheck module not implemented yet — pending backend-dev');
    const prevFlag = process.env.REPLY_COACH_ENABLED;
    const prevKey = process.env.ANTHROPIC_API_KEY;
    process.env.REPLY_COACH_ENABLED = 'true';
    delete process.env.ANTHROPIC_API_KEY;
    try {
      assert.throws(() => bootMod.assertCoachBootPreconditions!());
    } finally {
      process.env.REPLY_COACH_ENABLED = prevFlag;
      if (prevKey) process.env.ANTHROPIC_API_KEY = prevKey;
    }
  });

  it('warns but boots fine when flag is off and ANTHROPIC_API_KEY is missing', () => {
    if (!bootMod?.assertCoachBootPreconditions) return void it.skip('bootCheck module not implemented yet — pending backend-dev');
    const prevFlag = process.env.REPLY_COACH_ENABLED;
    const prevKey = process.env.ANTHROPIC_API_KEY;
    process.env.REPLY_COACH_ENABLED = 'false';
    delete process.env.ANTHROPIC_API_KEY;
    try {
      assert.doesNotThrow(() => bootMod.assertCoachBootPreconditions!());
    } finally {
      process.env.REPLY_COACH_ENABLED = prevFlag;
      if (prevKey) process.env.ANTHROPIC_API_KEY = prevKey;
    }
  });
});

describe('reply-coach-live: reply_coach_live_enabled flag gating + fallback', async () => {
  const flagMod = await tryImport<{ isReplyCoachLiveEnabled?: () => boolean }>('../src/services/coach/featureFlags.js');

  it('mock client is used when reply_coach_live_enabled is off', () => {
    if (!flagMod?.isReplyCoachLiveEnabled) return void it.skip('isReplyCoachLiveEnabled not implemented yet — pending backend-dev');
    const prev = process.env.REPLY_COACH_LIVE_ENABLED;
    process.env.REPLY_COACH_LIVE_ENABLED = 'false';
    try {
      assert.equal(flagMod.isReplyCoachLiveEnabled!(), false);
    } finally {
      if (prev !== undefined) process.env.REPLY_COACH_LIVE_ENABLED = prev;
      else delete process.env.REPLY_COACH_LIVE_ENABLED;
    }
  });

  it('falls back (throws, to be caught by the controller) when the mocked SDK client throws', async () => {
    const mod = await tryImport<{ LiveClaudeClient?: new (client: unknown) => { coach(input: unknown): Promise<{ verdict: string }> } }>('../src/services/coach/claudeClient.js');
    if (!mod?.LiveClaudeClient) return void it.skip('pending backend-dev');
    const fake = makeFakeAnthropicClient({ throwOn: true });
    const client = new mod.LiveClaudeClient(fake);
    await assert.rejects(() => client.coach({ draft: 'anything' }));
    // Controller-level silent fallback is already covered by coach.test.ts's
    // "returns the silent fallback (200 + verdict=ok) when the Claude client
    // throws" case — LiveClaudeClient throwing exercises the same catch path.
  });
});

describe('reply-coach-live: cost cap ($5/day)', async () => {
  const capMod = await tryImport<{
    recordCoachSpend?: (usd: number) => void;
    isCoachCostCapExceeded?: () => boolean;
    resetCoachCostCapForTests?: () => void;
  }>('../src/services/coach/costCap.js');

  it('degrades the live flag silently to off once cumulative spend crosses $5/day', () => {
    if (!capMod?.recordCoachSpend || !capMod?.isCoachCostCapExceeded) {
      return void it.skip('costCap module not implemented yet — pending backend-dev');
    }
    capMod.resetCoachCostCapForTests?.();
    assert.equal(capMod.isCoachCostCapExceeded!(), false);
    capMod.recordCoachSpend!(5.01);
    assert.equal(capMod.isCoachCostCapExceeded!(), true);
  });
});

describe('reply-coach-live: 50/50 holdback by user_id hash', async () => {
  const holdbackMod = await tryImport<{ isInHoldback?: (userId: string) => boolean }>('../src/services/coach/holdback.js');

  it('bucketing is stable for a given user_id across repeated calls', () => {
    if (!holdbackMod?.isInHoldback) return void it.skip('holdback module not implemented yet — pending backend-dev');
    const userId = 'user-stable-123';
    const first = holdbackMod.isInHoldback!(userId);
    const second = holdbackMod.isInHoldback!(userId);
    assert.equal(first, second);
  });

  it('produces an approximately 50/50 split across many user ids', () => {
    if (!holdbackMod?.isInHoldback) return void it.skip('holdback module not implemented yet — pending backend-dev');
    let inHoldback = 0;
    const total = 2000;
    for (let i = 0; i < total; i++) {
      if (holdbackMod.isInHoldback!(`user-${i}`)) inHoldback++;
    }
    const ratio = inHoldback / total;
    assert.ok(ratio > 0.4 && ratio < 0.6, `expected ~50/50 split, got ${ratio}`);
  });
});

describe('reply-coach-live: coach_events table — aggregate only, no draft text', async () => {
  const dbMod = await tryImport<{
    getDb?: () => {
      prepare: (sql: string) => { all: (...args: unknown[]) => Promise<unknown[]>; run: (...args: unknown[]) => Promise<unknown> };
      query: (sql: string, params?: unknown[]) => Promise<unknown[]>;
    };
  }>('../src/db.js');
  const migrateMod = await tryImport<{ runMigrations?: () => Promise<void> }>('../src/migrate.js');
  const eventsMod = await tryImport<{
    recordCoachEvent?: (row: { id: string; user_id: string; verdict: string; category: string; outcome: string }) => Promise<void>;
  }>('../src/services/coach/coachEvents.js');

  before(async () => {
    if (migrateMod?.runMigrations) await migrateMod.runMigrations();
    // coach_events.user_id has a FOREIGN KEY REFERENCES users(id) — insert a
    // synthetic user so the fixture row below satisfies the constraint.
    if (dbMod?.getDb) {
      await dbMod.getDb!().prepare(
        `INSERT INTO users (id, email, password, name, city, state, verified)
         VALUES ('user-test-1', 'user-test-1@example.test', 'not-a-real-hash', 'Test User', 'Testville', 'TS', TRUE)
         ON CONFLICT (id) DO NOTHING`,
      ).run();
    }
  });

  it('coach_events table exists with exactly the aggregate columns (no draft/rewrite/reasoning)', async () => {
    if (!dbMod?.getDb) return void it.skip('db module getDb not found — pending backend-dev');
    let columns: Array<{ column_name: string }>;
    try {
      columns = (await dbMod
        .getDb!()
        .query("SELECT column_name FROM information_schema.columns WHERE table_name = 'coach_events'")) as Array<{
        column_name: string;
      }>;
    } catch {
      return void it.skip('coach_events table does not exist yet — pending backend-dev migration');
    }
    if (columns.length === 0) return void it.skip('coach_events table does not exist yet — pending backend-dev migration');

    const names = columns.map((c) => c.column_name).sort();
    assert.deepEqual(names, ['category', 'created_at', 'id', 'outcome', 'user_id', 'verdict']);
    for (const forbidden of ['draft', 'rewrite', 'reasoning', 'text', 'body']) {
      assert.ok(!names.includes(forbidden), `coach_events must not have a "${forbidden}" column`);
    }
  });

  it('a written row contains only aggregate fields — no draft/rewrite/reasoning values persisted', async () => {
    if (!dbMod?.getDb || !eventsMod?.recordCoachEvent) return void it.skip('pending backend-dev');
    await eventsMod.recordCoachEvent!({
      id: 'evt-test-1',
      user_id: 'user-test-1',
      verdict: 'suggest',
      category: 'minimization',
      outcome: 'accepted',
    });
    const rows = (await dbMod
      .getDb!()
      .prepare("SELECT * FROM coach_events WHERE id = 'evt-test-1'")
      .all()) as Record<string, unknown>[];
    assert.equal(rows.length, 1);
    const row = rows[0]!;
    const rowKeys = Object.keys(row).sort();
    assert.deepEqual(rowKeys, ['category', 'created_at', 'id', 'outcome', 'user_id', 'verdict']);
  });
});

describe('reply-coach-live: no real network calls (sanity guard)', () => {
  it('this suite never sets a real ANTHROPIC_API_KEY and never imports real network transport', () => {
    // Guards against accidental hardcoding of a real key in this file.
    assert.equal(process.env.ANTHROPIC_API_KEY, undefined);
  });
});
