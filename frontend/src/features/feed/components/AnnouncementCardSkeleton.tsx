import { cn } from '@/utils/cn';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

const LINE_WIDTH_CLASSES = ['w-full', 'w-[92%]', 'w-[78%]', 'w-[64%]'];

// Real `ReactionBar` always renders all 5 REACTION_TYPES pills (never fewer),
// each sized to its label ("Like" vs "Celebrate"). The approved mock shows
// only 2-3 generic pills; per design-lead's audit (### Visual, discrepancy
// #2) that undersizes the row and risks the exact layout-pop this feature
// exists to prevent, so this mirrors the real 5-pill row's approximate
// per-label widths instead of copying the mock literally.
const REACTION_PILL_WIDTH_CLASSES = ['w-[68px]', 'w-[70px]', 'w-[64px]', 'w-[96px]', 'w-[84px]'];

export interface AnnouncementCardSkeletonProps {
  /** Number of body-text bone lines to render (clamped to 2–4, mirrors real post length variance). */
  lines?: number;
  /** Whether to include a media placeholder block, mirroring posts that carry an image. */
  withMedia?: boolean;
  className?: string;
}

/**
 * Placeholder shown in place of an `AnnouncementCard` while the feed is
 * loading. Mirrors the real card's anatomy (avatar circle → author-name line
 * → timestamp line → body text lines → reaction pill row) so there is no
 * layout pop when real content replaces it. Visually matches the
 * human-approved mock at docs/screenshots/feed-skeleton-proposal/mock.html.
 *
 * `aria-hidden` — this is decorative chrome, not content; the loading state
 * itself is announced via `aria-busy` on the containing feed section.
 */
export function AnnouncementCardSkeleton({ lines = 3, withMedia = false, className }: AnnouncementCardSkeletonProps) {
  const lineCount = Math.min(Math.max(lines, 2), 4);
  const prefersReducedMotion = usePrefersReducedMotion();
  // `motion-reduce:animate-none` is a CSS-level belt-and-suspenders fallback
  // (correct even before React hydrates); the hook additionally drops the
  // class outright so this is exercised in jsdom, where media queries aren't
  // evaluated.
  const bone = cn('bg-surface-subtle motion-reduce:animate-none', !prefersReducedMotion && 'animate-pulse');

  return (
    <div
      data-testid="announcement-card-skeleton"
      aria-hidden="true"
      className={cn('space-y-3 rounded-lg bg-surface-card p-5 shadow-lift', className)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* 40px (h-10 w-10), matching the real Avatar size="sm" — not the
              mock's 32px, per design-lead's audit (### Visual, discrepancy
              #1): a 32px->40px swap on real-card mount would reintroduce the
              exact layout pop this feature exists to eliminate. */}
          <div className={cn(bone, 'h-10 w-10 rounded-full')} />
          <div className="flex flex-col gap-1.5">
            <div className={cn(bone, 'h-3 w-24 rounded-full')} />
            <div className={cn(bone, 'h-2 w-14 rounded-full')} />
          </div>
        </div>
        <div className={cn(bone, 'h-3 w-11 rounded-full')} />
      </div>

      <div className="flex flex-col gap-2 pt-1">
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i} className={cn(bone, 'h-3 rounded-full', LINE_WIDTH_CLASSES[i] ?? 'w-1/2')} />
        ))}
      </div>

      {withMedia && <div data-testid="announcement-card-skeleton-media" className={cn(bone, 'mt-1 h-40 w-full rounded')} />}

      <div className="flex flex-wrap gap-2 pt-1">
        {REACTION_PILL_WIDTH_CLASSES.map((widthClass, i) => (
          <div key={i} className={cn(bone, 'h-7 rounded-full', widthClass)} />
        ))}
      </div>
    </div>
  );
}

/**
 * 2–3 varied `AnnouncementCardSkeleton`s standing in for a page of the feed
 * (one card includes a media block, per acceptance criteria). Shared by
 * `Home.tsx` and `Feed.tsx` so neither hand-rolls its own skeleton markup.
 */
export function AnnouncementFeedSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-4">
      <AnnouncementCardSkeleton lines={3} />
      <AnnouncementCardSkeleton lines={2} withMedia />
      <AnnouncementCardSkeleton lines={2} />
    </div>
  );
}
