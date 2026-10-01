import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';
import { MOCK_SUPABASE_ANON_KEY, MOCK_SUPABASE_URL } from './e2e/utils/login';

// src/lib/supabaseClient.ts throws at import if VITE_SUPABASE_URL /
// VITE_SUPABASE_ANON_KEY are missing, so the dev server needs *some* value
// to boot even in a sandbox with no frontend/.env — e2e/utils/login.ts never
// makes a real Supabase Auth network call (see its top-of-file comment), so
// these never need to resolve. Only fills in what's missing: a populated
// frontend/.env (or already-exported env vars) always wins.
const supabaseEnvFallback: Record<string, string> = {};
if (!process.env.VITE_SUPABASE_URL) supabaseEnvFallback.VITE_SUPABASE_URL = MOCK_SUPABASE_URL;
if (!process.env.VITE_SUPABASE_ANON_KEY) supabaseEnvFallback.VITE_SUPABASE_ANON_KEY = MOCK_SUPABASE_ANON_KEY;

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
      env: supabaseEnvFallback,
    },
  ],
});
