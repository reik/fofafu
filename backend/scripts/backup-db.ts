import Database from 'better-sqlite3';
import { config } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

config({ path: new URL('../.env', import.meta.url).pathname });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEEP_COUNT = 7;

const dbPath = process.env.DB_PATH ?? './fofafu-dev.db';

if (dbPath === ':memory:') {
  console.log('[backup] skipping — in-memory DB');
  process.exit(0);
}

const resolvedDb = path.resolve(__dirname, '..', dbPath);

if (!fs.existsSync(resolvedDb)) {
  console.error(`[backup] DB not found: ${resolvedDb}`);
  process.exit(1);
}

const backupsDir = path.resolve(__dirname, '..', 'backups');
fs.mkdirSync(backupsDir, { recursive: true });

const ts = new Date().toISOString().replace(/[:.]/g, '-');
const destPath = path.join(backupsDir, `fofafu-${ts}.db`);

const source = new Database(resolvedDb, { readonly: true });
await source.backup(destPath);
source.close();

console.log(`[backup] saved → ${destPath}`);

// Prune oldest backups beyond KEEP_COUNT
const files = fs
  .readdirSync(backupsDir)
  .filter((f) => f.endsWith('.db'))
  .map((f) => ({ name: f, mtime: fs.statSync(path.join(backupsDir, f)).mtimeMs }))
  .sort((a, b) => a.mtime - b.mtime);

for (const stale of files.slice(0, Math.max(0, files.length - KEEP_COUNT))) {
  fs.unlinkSync(path.join(backupsDir, stale.name));
  console.log(`[backup] pruned → ${stale.name}`);
}
