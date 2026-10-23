import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll, afterAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import { server } from './msw-server';

// jsdom doesn't implement matchMedia. Default stand-in so any component using
// usePrefersReducedMotion() doesn't throw in tests that don't care about
// reduced-motion behavior; usePrefersReducedMotion.test.ts installs its own
// richer mock (with a working addEventListener) per-test as needed.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  // Clear persisted auth state between tests.
  if (typeof localStorage !== 'undefined') localStorage.clear();
});
afterAll(() => server.close());
