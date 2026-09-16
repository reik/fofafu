import { AnnouncementCardSkeleton } from './AnnouncementCardSkeleton';

export interface AnnouncementFeedSkeletonProps {
  className?: string;
}

/**
 * The stack of skeleton `AnnouncementCard`s shown while the feed's first page
 * is loading, shared by `pages/Home.tsx` and `pages/Feed.tsx` (initial load
 * only) so the arrangement lives in exactly one place. Matches the approved
 * mock (`docs/screenshots/feed-skeleton-proposal/mock.html`): 3 cards of
 * varying length, one of which carries a media placeholder (posts may carry
 * images).
 *
 * Callers are responsible for `aria-busy` on the ancestor feed
 * section/container — this component only renders the (already
 * `aria-hidden`) bones.
 */
export function AnnouncementFeedSkeleton({ className }: AnnouncementFeedSkeletonProps) {
  return (
    <div className={className ?? 'space-y-4'}>
      <AnnouncementCardSkeleton
        nameWidthClassName="w-24"
        lineWidthClassNames={['w-full', 'w-[92%]', 'w-[64%]']}
      />
      <AnnouncementCardSkeleton
        nameWidthClassName="w-28"
        lineWidthClassNames={['w-[92%]', 'w-[78%]']}
        withMedia
      />
      <AnnouncementCardSkeleton
        nameWidthClassName="w-20"
        lineWidthClassNames={['w-full', 'w-[48%]']}
      />
    </div>
  );
}
