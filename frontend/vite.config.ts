import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    port: 5173,
    proxy: {
      '/api': `http://localhost:${process.env.E2E_BACKEND_PORT ?? '4000'}`,
      '/uploads': `http://localhost:${process.env.E2E_BACKEND_PORT ?? '4000'}`,
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/tests/setup.ts'],
    exclude: [...configDefaults.exclude, 'e2e/**'],
    // Test-only stand-ins for supabaseClient.ts's required env vars. Never
    // hits a real Supabase project: msw intercepts every request this
    // client/edgeClient/GoTrue call makes in tests (see msw-server.ts).
    env: {
      VITE_SUPABASE_URL: 'https://test-project.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
});
