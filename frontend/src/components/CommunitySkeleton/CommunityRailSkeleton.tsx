import { CommunityRowSkeleton } from './CommunityRowSkeleton';

export interface CommunityRailSkeletonProps {
  className?: string;
}

const ROWS: Array<{ nameWidthClassName: string; locationWidthClassName: string }> = [
  { nameWidthClassName: 'w-[70%]', locationWidthClassName: 'w-[45%]' },
  { nameWidthClassName: 'w-[55%]', locationWidthClassName: 'w-[38%]' },
  { nameWidthClassName: 'w-[80%]', locationWidthClassName: 'w-[50%]' },
  { nameWidthClassName: 'w-[62%]', locationWidthClassName: 'w-[42%]' },
  { nameWidthClassName: 'w-[74%]', locationWidthClassName: 'w-[40%]' },
];

/**
 * The stack of `CommunityRowSkeleton` rows shown on `pages/Home.tsx` while
 * `community.isPending`, matching the approved mock's 5-row rail
 * (`docs/screenshots/feed-skeleton-proposal/mock.html`).
 */
export function CommunityRailSkeleton({ className }: CommunityRailSkeletonProps) {
  return (
    <ul className={className ?? 'space-y-2'}>
      {ROWS.map((row, index) => (
        <li key={index}>
          <CommunityRowSkeleton
            nameWidthClassName={row.nameWidthClassName}
            locationWidthClassName={row.locationWidthClassName}
          />
        </li>
      ))}
    </ul>
  );
}
