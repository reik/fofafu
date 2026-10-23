import { cn } from '@/utils/cn';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

export interface CommunityRowSkeletonProps {
  nameWidthClass?: string;
  locationWidthClass?: string;
}

/**
 * Placeholder for a single Community-rail row (avatar circle + name line +
 * city/state line) while `community.isPending` on the home page. Matches the
 * human-approved mock at docs/screenshots/feed-skeleton-proposal/mock.html.
 */
export function CommunityRowSkeleton({ nameWidthClass = 'w-3/4', locationWidthClass = 'w-1/2' }: CommunityRowSkeletonProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const bone = cn('bg-surface-subtle motion-reduce:animate-none', !prefersReducedMotion && 'animate-pulse');

  return (
    <div data-testid="community-skeleton-row" aria-hidden="true" className="flex items-center gap-2 rounded-md px-2 py-1.5">
      <div className={cn(bone, 'h-8 w-8 shrink-0 rounded-full')} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className={cn(bone, 'h-2.5 rounded-full', nameWidthClass)} />
        <div className={cn(bone, 'h-2 rounded-full', locationWidthClass)} />
      </div>
    </div>
  );
}

const ROW_WIDTHS: Array<Pick<CommunityRowSkeletonProps, 'nameWidthClass' | 'locationWidthClass'>> = [
  { nameWidthClass: 'w-3/4', locationWidthClass: 'w-1/2' },
  { nameWidthClass: 'w-1/2', locationWidthClass: 'w-2/5' },
  { nameWidthClass: 'w-4/5', locationWidthClass: 'w-1/2' },
  { nameWidthClass: 'w-3/5', locationWidthClass: 'w-2/5' },
];

/** 4 varied `CommunityRowSkeleton` rows standing in for the whole rail while it loads. */
export function CommunityRailSkeleton() {
  return (
    <ul aria-hidden="true" className="space-y-2">
      {ROW_WIDTHS.map((row, i) => (
        <li key={i}>
          <CommunityRowSkeleton {...row} />
        </li>
      ))}
    </ul>
  );
}
