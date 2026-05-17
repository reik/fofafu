import { db } from './db.js';

export function runMigrations(): void {
  db().exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      email       TEXT UNIQUE NOT NULL,
      password    TEXT NOT NULL,
      name        TEXT NOT NULL,
      city        TEXT NOT NULL,
      state       TEXT NOT NULL,
      verified    INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS email_tokens (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token       TEXT UNIQUE NOT NULL,
      expires_at  TEXT NOT NULL,
      used        INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_email_tokens_token ON email_tokens(token);
    CREATE INDEX IF NOT EXISTS idx_email_tokens_user  ON email_tokens(user_id);

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token       TEXT UNIQUE NOT NULL,
      expires_at  TEXT NOT NULL,
      used        INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);

    CREATE TABLE IF NOT EXISTS families (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      bio         TEXT NOT NULL DEFAULT '',
      kid_count   INTEGER,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_families_user ON families(user_id);

    CREATE TABLE IF NOT EXISTS announcements (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content     TEXT NOT NULL,
      media_url   TEXT,
      media_type  TEXT CHECK(media_type IN ('image','video') OR media_type IS NULL),
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_announcements_created ON announcements(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_announcements_user    ON announcements(user_id);

    CREATE TABLE IF NOT EXISTS comments (
      id              TEXT PRIMARY KEY,
      announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
      user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content         TEXT NOT NULL,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_comments_announcement ON comments(announcement_id, created_at);

    CREATE TABLE IF NOT EXISTS reactions (
      id              TEXT PRIMARY KEY,
      announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
      user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type            TEXT NOT NULL CHECK(type IN ('like','love','hug','celebrate','support')),
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(announcement_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_reactions_announcement ON reactions(announcement_id);

    CREATE TABLE IF NOT EXISTS messages (
      id          TEXT PRIMARY KEY,
      sender_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receiver_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content     TEXT NOT NULL,
      read        INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_messages_sender   ON messages(sender_id);
    CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
    CREATE INDEX IF NOT EXISTS idx_messages_pair     ON messages(sender_id, receiver_id, created_at);
  `);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations();
  console.log('migrations complete');
}
