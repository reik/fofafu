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
  `);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations();
  console.log('migrations complete');
}
