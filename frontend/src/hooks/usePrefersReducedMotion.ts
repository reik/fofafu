import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Live-tracks the OS-level `prefers-reduced-motion` preference. Consumed by
 * `AnnouncementCardSkeleton` / `CommunityRowSkeleton` to drop the
 * pulse/shimmer animation for reduced-motion users (static bones instead),
 * per [[features/feed-skeleton-loading]]'s acceptance criteria. Backed by
 * `matchMedia` + a `change` listener (not polling) so it updates without a
 * remount if the preference flips while the app is open.
 */
export function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => window.matchMedia(QUERY).matches);

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const handleChange = (event: MediaQueryListEvent) => setPrefersReducedMotion(event.matches);
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  return prefersReducedMotion;
}
