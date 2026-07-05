import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5273',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      // Dedicated e2e.db on a dedicated port, migrated + seeded with the dummy
      // families from backend/scripts/seed-dummy.ts so specs can log in as a
      // real user without touching a developer's port-4000 dev backend/db.
      command: 'npm run e2e:setup && npm run dev',
      cwd: path.resolve(__dirname, '../backend'),
      url: 'http://localhost:4100/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { DB_PATH: './e2e.db', PORT: '4100' },
    },
    {
      // Separate port from the dev server (5173) for the same reason.
      command: 'npm run dev -- --port 5273',
      url: 'http://localhost:5273',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { E2E_BACKEND_PORT: '4100' },
    },
  ],
});
