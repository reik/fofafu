import { cn } from '@/utils/cn';
import { Skeleton } from '@/components/Skeleton';

export interface CommunityRowSkeletonProps {
  nameWidthClassName?: string;
  locationWidthClassName?: string;
  className?: string;
}

/**
 * Loading placeholder for a single Community-rail row on `pages/Home.tsx`
 * (avatar circle + name line + city/state line), matching the real row's
 * layout in `HomePage`'s community `<ul>`.
 */
export function CommunityRowSkeleton({
  nameWidthClassName = 'w-2/3',
  locationWidthClassName = 'w-1/3',
  className,
}: CommunityRowSkeletonProps) {
  return (
    <div
      aria-hidden="true"
      data-testid="community-row-skeleton"
      className={cn('flex items-center gap-2 rounded-md px-2 py-1.5', className)}
    >
      <Skeleton shape="circle" className="h-8 w-8 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Skeleton className={cn('h-2.5', nameWidthClassName)} />
        <Skeleton className={cn('h-2', locationWidthClassName)} />
      </div>
    </div>
  );
}
