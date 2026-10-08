import { vi } from 'vitest';

/**
 * Replaces `window.matchMedia` with a fake that reports `matches: initialMatches`
 * for every query, so tests can force a specific `prefers-reduced-motion` (or
 * any other media-query) state instead of relying on jsdom's always-false
 * default (see tests/setup.ts). Callers should `vi.restoreAllMocks()` in
 * `afterEach` to avoid leaking the mock across tests.
 */
export function installMatchMedia(initialMatches: boolean) {
  let changeHandler: ((e: { matches: boolean }) => void) | undefined;
  const mql = {
    matches: initialMatches,
    media: '',
    addEventListener: (_type: 'change', cb: (e: { matches: boolean }) => void) => {
      changeHandler = cb;
    },
    removeEventListener: () => {
      changeHandler = undefined;
    },
  };
  window.matchMedia = vi.fn().mockReturnValue(mql) as unknown as typeof window.matchMedia;
  return {
    fireChange(matches: boolean) {
      mql.matches = matches;
      changeHandler?.({ matches });
    },
  };
}
