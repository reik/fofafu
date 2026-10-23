import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';
import { installMatchMedia } from '@/tests/installMatchMedia';

/**
 * Contract this spec locks in (frontend-dev: implement `usePrefersReducedMotion`
 * to match — written ahead of the implementation per this repo's TDD rule; see
 * [[features/feed-skeleton-loading]] ### Test plan for the full writeup):
 *
 * - `frontend/src/hooks/usePrefersReducedMotion.ts` exports a named hook
 *   `usePrefersReducedMotion(): boolean`.
 * - It wraps `window.matchMedia('(prefers-reduced-motion: reduce)')` and returns
 *   the current `.matches` value.
 * - It re-renders when the OS-level preference changes at runtime, subscribed via
 *   the MediaQueryList's `addEventListener('change', ...)` (not polling).
 *
 * Consumed by `AnnouncementCardSkeleton` (see its own spec) to drop the
 * pulse/shimmer animation for `prefers-reduced-motion` per the feature's
 * acceptance criteria.
 */

describe('usePrefersReducedMotion', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false when the OS has no reduced-motion preference', () => {
    installMatchMedia(false);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });

  it('returns true when the OS prefers reduced motion', () => {
    installMatchMedia(true);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
  });

  it('updates live when the preference changes at runtime (no remount required)', () => {
    const { fireChange } = installMatchMedia(false);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);

    act(() => fireChange(true));
    expect(result.current).toBe(true);
  });

  it('queries the standard prefers-reduced-motion media feature', () => {
    installMatchMedia(false);
    renderHook(() => usePrefersReducedMotion());
    expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  });
});
