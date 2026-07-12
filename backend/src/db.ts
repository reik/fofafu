import pg from 'pg';

const { Pool } = pg;

export interface RunResult {
  changes: number;
}

interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

let pool: pg.Pool | null = null;
// Set while inside db().transaction(...) so nested prepare()/exec() calls
// route through the same client (Postgres transactions are per-connection,
// unlike better-sqlite3's process-wide transaction()).
let txClient: pg.PoolClient | null = null;

function resolveConnectionString(): string {
  const isTest = process.env.NODE_ENV === 'test';
  const connectionString = isTest ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      isTest
        ? 'TEST_DATABASE_URL is required to run tests — point it at a disposable Postgres database/schema. There is no in-memory fallback for Postgres.'
        : 'DATABASE_URL is required (a Postgres connection string, e.g. from Supabase). Set it in the environment before starting the server.'
    );
  }
  return connectionString;
}

function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({ connectionString: resolveConnectionString() });
  }
  return pool;
}

function executor(): Queryable {
  return txClient ?? getPool();
}

/**
 * Compiles a `?`-placeholder or `@name`-placeholder SQL string (the
 * better-sqlite3 conventions the call sites already use) into Postgres's
 * `$1, $2, ...` positional syntax, so controllers didn't need a full
 * rewrite of every query string — just `await` added at call sites.
 */
function compile(sql: string, args: unknown[]): { text: string; values: unknown[] } {
  if (args.length === 1 && args[0] !== null && typeof args[0] === 'object' && !Array.isArray(args[0])) {
    const named = args[0] as Record<string, unknown>;
    let i = 0;
    const values: unknown[] = [];
    const text = sql.replace(/@(\w+)/g, (_match, name: string) => {
      i += 1;
      values.push(named[name]);
      return `$${i}`;
    });
    return { text, values };
  }
  let i = 0;
  const text = sql.replace(/\?/g, () => `$${++i}`);
  return { text, values: args };
}

class Statement {
  constructor(private sql: string) {}

  async get<T = any>(...args: unknown[]): Promise<T | undefined> {
    const { text, values } = compile(this.sql, args);
    const res = await executor().query(text, values);
    return res.rows[0] as T | undefined;
  }

  async all<T = any>(...args: unknown[]): Promise<T[]> {
    const { text, values } = compile(this.sql, args);
    const res = await executor().query(text, values);
    return res.rows as T[];
  }

  async run(...args: unknown[]): Promise<RunResult> {
    const { text, values } = compile(this.sql, args);
    const res = await executor().query(text, values);
    return { changes: res.rowCount ?? 0 };
  }
}

export interface DbHandle {
  prepare(sql: string): Statement;
  exec(sql: string): Promise<void>;
  /** Raw query helper for call sites that already use $1-style params (e.g. migrations). */
  query<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Mirrors better-sqlite3's `db().transaction(fn)()` two-call shape. */
  transaction<T>(fn: () => Promise<T>): () => Promise<T>;
}

const handle: DbHandle = {
  prepare(sql: string): Statement {
    return new Statement(sql);
  },
  async exec(sql: string): Promise<void> {
    await executor().query(sql);
  },
  async query<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
    const res = await executor().query(sql, params);
    return res.rows as T[];
  },
  transaction<T>(fn: () => Promise<T>): () => Promise<T> {
    return async () => {
      const client = await getPool().connect();
      const previous = txClient;
      txClient = client;
      try {
        await client.query('BEGIN');
        const result = await fn();
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        txClient = previous;
        client.release();
      }
    };
  },
};

export function db(): DbHandle {
  return handle;
}

/** Alias for `db()` — some newer modules (reply-coach-live) prefer `getDb()`. */
export function getDb(): DbHandle {
  return db();
}

// Table list kept here (rather than derived from migrate.ts) so db.ts has no
// import-time dependency on migrate.ts; used only for the test-only reset
// below. Keep in sync with the CREATE TABLE list in migrate.ts.
const ALL_TABLES = [
  'coach_events',
  'playdate_requests',
  'availability_slots',
  'reactions',
  'comments',
  'announcements',
  'messages',
  'families',
  'password_reset_tokens',
  'email_tokens',
  'users',
];

export async function closeDb(): Promise<void> {
  // better-sqlite3's `:memory:` database used to be thrown away and
  // recreated between test files; a shared Postgres database persists rows
  // across `closeDb()` calls, so tests would otherwise leak data between
  // `describe` blocks. Truncate everything before tearing down the pool,
  // but only in test — this must never run against a real database.
  if (pool && process.env.NODE_ENV === 'test') {
    try {
      await pool.query(`TRUNCATE TABLE ${ALL_TABLES.join(', ')} RESTART IDENTITY CASCADE`);
    } catch {
      // Tables may not exist yet on the very first call (before migrations
      // have ever run) — safe to ignore.
    }
  }
  if (pool) {
    await pool.end();
    pool = null;
  }
  txClient = null;
}
