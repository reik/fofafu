import 'dotenv/config';
import { db } from './db.js';

export async function runMigrations(): Promise<void> {
  await db().exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      email       TEXT UNIQUE NOT NULL,
      password    TEXT NOT NULL,
      name        TEXT NOT NULL,
      city        TEXT NOT NULL,
      state       TEXT NOT NULL,
      verified    BOOLEAN NOT NULL DEFAULT FALSE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS email_tokens (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token       TEXT UNIQUE NOT NULL,
      expires_at  TIMESTAMPTZ NOT NULL,
      used        BOOLEAN NOT NULL DEFAULT FALSE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_email_tokens_token ON email_tokens(token);
    CREATE INDEX IF NOT EXISTS idx_email_tokens_user  ON email_tokens(user_id);

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token       TEXT UNIQUE NOT NULL,
      expires_at  TIMESTAMPTZ NOT NULL,
      used        BOOLEAN NOT NULL DEFAULT FALSE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);

    CREATE TABLE IF NOT EXISTS families (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      bio         TEXT NOT NULL DEFAULT '',
      kid_count   INTEGER,
      avatar_url  TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_families_user ON families(user_id);

    CREATE TABLE IF NOT EXISTS announcements (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content     TEXT NOT NULL,
      media_url   TEXT,
      media_type  TEXT CHECK(media_type IN ('image','video') OR media_type IS NULL),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_announcements_created ON announcements(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_announcements_user    ON announcements(user_id);

    CREATE TABLE IF NOT EXISTS comments (
      id              TEXT PRIMARY KEY,
      announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
      user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content         TEXT NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_comments_announcement ON comments(announcement_id, created_at);

    CREATE TABLE IF NOT EXISTS reactions (
      id              TEXT PRIMARY KEY,
      announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
      user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type            TEXT NOT NULL CHECK(type IN ('like','love','hug','celebrate','support')),
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(announcement_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_reactions_announcement ON reactions(announcement_id);

    CREATE TABLE IF NOT EXISTS messages (
      id          TEXT PRIMARY KEY,
      sender_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receiver_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content     TEXT NOT NULL,
      read        BOOLEAN NOT NULL DEFAULT FALSE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_messages_sender   ON messages(sender_id);
    CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
    CREATE INDEX IF NOT EXISTS idx_messages_pair     ON messages(sender_id, receiver_id, created_at);

    -- Availability slots. fofa keys this to users(id); fofafu has a separate
    -- families table (1:1 with users), so we key to families(id) instead so
    -- the DTO can expose familyId directly (matches the /family/:id surface).
    CREATE TABLE IF NOT EXISTS availability_slots (
      id         TEXT PRIMARY KEY,
      family_id  TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
      date       TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time   TEXT NOT NULL,
      status     TEXT NOT NULL CHECK(status IN ('free', 'busy')) DEFAULT 'free',
      note       TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_slots_family_date ON availability_slots(family_id, date);

    -- Playdate requests. Same family_id keying rationale as availability_slots.
    CREATE TABLE IF NOT EXISTS playdate_requests (
      id                  TEXT PRIMARY KEY,
      slot_id             TEXT NOT NULL REFERENCES availability_slots(id) ON DELETE CASCADE,
      requester_family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
      owner_family_id     TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
      message             TEXT,
      status              TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'declined')) DEFAULT 'pending',
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_requests_requester ON playdate_requests(requester_family_id);
    CREATE INDEX IF NOT EXISTS idx_requests_owner     ON playdate_requests(owner_family_id);
    CREATE INDEX IF NOT EXISTS idx_requests_slot      ON playdate_requests(slot_id);

    -- reply-coach-live: aggregate-only analytics for coach verdicts. NEVER
    -- add a column here for draft/rewrite/reasoning text — see
    -- fofafu_vault/features/reply-coach-live.md ## Out of scope.
    CREATE TABLE IF NOT EXISTS coach_events (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      verdict     TEXT NOT NULL CHECK(verdict IN ('ok', 'suggest')),
      category    TEXT,
      outcome     TEXT NOT NULL CHECK(outcome IN ('shown', 'accepted', 'edited', 'dismissed', 'none')) DEFAULT 'none',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_coach_events_user    ON coach_events(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_coach_events_created ON coach_events(created_at);
  `);

  // Defensive backfill for columns added after the initial schema.
  await ensureColumn('families', 'avatar_url', 'TEXT');
  // seed-prod-sample-data: marks rows created by scripts/seed-prod-sample-data.ts
  // so sample content stays distinguishable from real signups and prunable later.
  await ensureColumn('users', 'is_sample', 'BOOLEAN NOT NULL DEFAULT FALSE');
  await ensureColumn('families', 'is_sample', 'BOOLEAN NOT NULL DEFAULT FALSE');
  // edit-comment: comments.updated_at added in 2026-05-21. Backfill from
  // created_at for any rows that predate the column.
  if (await ensureColumn('comments', 'updated_at', 'TIMESTAMPTZ')) {
    await db().exec(`UPDATE comments SET updated_at = created_at WHERE updated_at IS NULL`);
  }

  // Some environments (e.g. tables pre-created via the Supabase dashboard
  // before this migration ever ran) ended up with families.user_id pointed
  // at Supabase's built-in auth.users instead of our own public.users,
  // which made every registration fail with a foreign-key violation.
  // Repoint it if that's still the case.
  await ensureForeignKeyTarget('families', 'families_user_id_fkey', 'user_id', 'users', 'CASCADE');
}

async function ensureForeignKeyTarget(
  table: string,
  constraintName: string,
  column: string,
  targetTable: string,
  onDelete: 'CASCADE' | 'SET NULL' | 'RESTRICT'
): Promise<void> {
  const rows = await db().query<{ confrelid: string }>(
    `SELECT confrelid::regclass::text AS confrelid FROM pg_constraint WHERE conname = $1`,
    [constraintName]
  );
  const current = rows[0]?.confrelid;
  const wantedUnqualified = targetTable;
  const wantedQualified = `public.${targetTable}`;
  if (current && current !== wantedUnqualified && current !== wantedQualified) {
    await db().exec(`ALTER TABLE ${table} DROP CONSTRAINT ${constraintName}`);
    await db().exec(
      `ALTER TABLE ${table} ADD CONSTRAINT ${constraintName} FOREIGN KEY (${column}) REFERENCES public.${targetTable}(id) ON DELETE ${onDelete}`
    );
  }
}

async function ensureColumn(table: string, column: string, type: string): Promise<boolean> {
  const rows = await db().query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
    [table, column]
  );
  if (rows.length === 0) {
    await db().exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    return true;
  }
  return false;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => console.log('migrations complete'))
    .catch((err) => {
      console.error('migrations failed', err);
      process.exitCode = 1;
    });
}
