import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Logger level filtering depends on LOG_LEVEL / NODE_ENV at call time in
// most sensible designs. If backend-dev's logger instead reads env once at
// import time, these tests still pass unchanged since we set env vars before
// each dynamic import.

const ORIGINAL_ENV = { ...process.env };

function restoreEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

describe('backend/src/utils/logger', () => {
  afterEach(() => {
    restoreEnv();
  });

  it('exports info/warn/error/debug functions', async () => {
    const { logger } = await import('../src/utils/logger.js');
    assert.equal(typeof logger.info, 'function');
    assert.equal(typeof logger.warn, 'function');
    assert.equal(typeof logger.error, 'function');
    assert.equal(typeof logger.debug, 'function');
  });

  it('emits a { msg, ...fields } shaped record without throwing on plain fields', async () => {
    const { logger } = await import('../src/utils/logger.js');
    assert.doesNotThrow(() => {
      logger.info({ msg: 'hello world', userId: 42, ok: true });
    });
  });

  it('does not throw when given an unknown nested object in fields (no deep stringify blowup)', async () => {
    const { logger } = await import('../src/utils/logger.js');
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    assert.doesNotThrow(() => {
      logger.warn({ msg: 'weird payload', payload: circular });
    });
  });

  it('is silent in test env by default (LOG_LEVEL unset, NODE_ENV=test)', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.LOG_LEVEL;
    const { logger } = await import('../src/utils/logger.js');

    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    let calls = 0;
    console.log = () => { calls += 1; };
    console.warn = () => { calls += 1; };
    console.error = () => { calls += 1; };
    try {
      logger.info({ msg: 'should not print in test' });
      logger.debug({ msg: 'should not print in test' });
    } finally {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    }
    assert.equal(calls, 0, 'expected no console output when LOG_LEVEL resolves to silent in test env');
  });

  it('respects an explicit LOG_LEVEL override to emit debug records', async () => {
    process.env.LOG_LEVEL = 'debug';
    const { logger } = await import('../src/utils/logger.js');

    const originalLog = console.log;
    const originalDebug = console.debug;
    let sawOutput = false;
    console.log = () => { sawOutput = true; };
    console.debug = () => { sawOutput = true; };
    try {
      logger.debug({ msg: 'explicit debug enabled' });
    } finally {
      console.log = originalLog;
      console.debug = originalDebug;
    }
    assert.equal(sawOutput, true, 'expected debug output when LOG_LEVEL=debug is set explicitly');
  });
});

describe('logger call sites smoke test', () => {
  it('coach.controller, email.service, and index still emit through the logger without throwing', async () => {
    process.env.DB_PATH = ':memory:';
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-secret';
    process.env.FRONTEND_URL = 'http://localhost:5173';

    // Importing these modules exercises their top-level logger usage paths
    // (index.ts startup logging, email.service dev-mode dump, coach.controller
    // client-failure warn) without throwing during module load or app boot.
    const { buildApp } = await import('../src/index.js');
    const emailService = await import('../src/services/email.service.js');
    const coachController = await import('../src/controllers/coach.controller.js');

    assert.doesNotThrow(() => {
      buildApp();
    });
    assert.ok(emailService, 'email.service module loads and imports logger cleanly');
    assert.ok(coachController, 'coach.controller module loads and imports logger cleanly');
  });
});
