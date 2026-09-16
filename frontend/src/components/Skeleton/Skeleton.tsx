import { cn } from '@/utils/cn';

export type SkeletonShape = 'bar' | 'circle' | 'block';

const SHAPE_CLASSES: Record<SkeletonShape, string> = {
  // Text-line / pill bones — fully rounded, mirrors the approved mock's
  // `.bone.bone-round` treatment (docs/screenshots/feed-skeleton-proposal/mock.html).
  bar: 'rounded-full',
  // Avatar bones — same fully-rounded radius as `bar`, kept as a distinct
  // shape name for call-site clarity (an avatar bone vs. a text-line bone).
  circle: 'rounded-full',
  // Media-placeholder bones — the mock's plain `.bone` (no `.bone-round`),
  // i.e. the same `rounded` (8px) radius as real card chrome.
  block: 'rounded',
};

export interface SkeletonProps {
  /** @default 'bar' */
  shape?: SkeletonShape;
  className?: string;
  /** Optional `data-testid`, for the rare bone a test needs to target directly (e.g. the media placeholder). */
  testId?: string;
}

/**
 * A single loading "bone". Always `aria-hidden` — the loading state itself is
 * announced by the ancestor container's `aria-busy`, per this feature's
 * accessibility acceptance criteria; a screen reader has nothing useful to
 * read from an individual bone.
 *
 * Uses `surface.subtle` (no new color tokens) with Tailwind's built-in
 * `animate-pulse`, gated behind the `motion-safe:` variant so
 * `prefers-reduced-motion: reduce` yields fully static bones instead of a
 * disabled-but-still-present animation.
 */
export function Skeleton({ shape = 'bar', className, testId }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      data-testid={testId}
      className={cn('bg-surface-subtle motion-safe:animate-pulse', SHAPE_CLASSES[shape], className)}
    />
  );
}
