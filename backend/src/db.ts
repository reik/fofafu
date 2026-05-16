import Database from 'better-sqlite3';
import path from 'node:path';

let instance: Database.Database | null = null;

export function db(): Database.Database {
  if (!instance) {
    const dbPath = process.env.DB_PATH ?? './fofafu.db';
    instance = new Database(dbPath === ':memory:' ? ':memory:' : path.resolve(dbPath));
    instance.pragma('journal_mode = WAL');
    instance.pragma('foreign_keys = ON');
  }
  return instance;
}

export function closeDb(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
