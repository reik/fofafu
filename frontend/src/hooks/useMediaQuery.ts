import { useSyncExternalStore } from 'react';

/** Tailwind's `md` and `lg` breakpoints, for layouts that must also change what mounts. */
export const MEDIA_MD = '(min-width: 768px)';
export const MEDIA_LG = '(min-width: 1024px)';

/**
 * Live-tracks a CSS media query. Use it only where the breakpoint decides
 * what mounts (and so what fetches or what assistive tech sees); a purely
 * visual change belongs in a Tailwind `md:` class instead.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
  );
}
