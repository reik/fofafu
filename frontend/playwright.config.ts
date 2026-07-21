import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';

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
      // All app data (Auth, Postgres, Edge Functions) lives in Supabase now —
      // no local Express/sqlite backend to spin up. Specs log in as the dummy
      // families from backend/scripts/seed-dummy.ts, which must already exist
      // in the target Supabase project; run that script once beforehand if
      // they're missing.
      // Separate port from the dev server (5173) so this doesn't collide with
      // a developer's own dev server.
      command: 'npm run dev -- --port 5273',
      url: 'http://localhost:5273',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
