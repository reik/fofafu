import { cn } from '@/utils/cn';

export interface AnnouncementCardSkeletonProps {
  hasMedia?: boolean;
  /** @deprecated Use {@link hasMedia}. Kept for parallel prototyping compatibility. */
  withMedia?: boolean;
  nameWidthClassName?: string;
  lineWidthClassNames?: string[];
  className?: string;
}

function Bone({ className, 'data-testid': dataTestId }: { className?: string; 'data-testid'?: string }) {
  return (
    <div
      aria-hidden="true"
      data-testid={dataTestId}
      className={cn('rounded bg-surface-subtle motion-safe:animate-pulse', className)}
    />
  );
}

export function AnnouncementCardSkeleton({
  hasMedia,
  withMedia,
  nameWidthClassName = 'w-24',
  lineWidthClassNames = ['w-full', 'w-[92%]', 'w-[64%]'],
  className,
}: AnnouncementCardSkeletonProps) {
  const showMedia = hasMedia ?? withMedia ?? false;

  return (
    <article
      aria-hidden="true"
      data-testid="announcement-card-skeleton"
      className={cn('space-y-3 rounded-lg bg-surface-card p-5 shadow-lift', className)}
    >
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bone className="h-8 w-8 rounded-full" />
          <div className="flex flex-col gap-1.5">
            <Bone className={cn('h-3 rounded-full', nameWidthClassName)} />
            <Bone className="h-2 w-14 rounded-full" />
          </div>
        </div>
        <Bone className="h-3 w-11 rounded-full" />
      </header>

      <div className="flex flex-col gap-2 pt-1">
        {lineWidthClassNames.map((widthClass, index) => (
          <Bone key={index} className={cn('h-3 rounded-full', widthClass)} />
        ))}
      </div>

      {showMedia && (
        <Bone className="h-40 w-full rounded-lg" data-testid="skeleton-media" />
      )}

      <div className="flex gap-2 pt-1">
        <Bone className="h-7 w-13 rounded-full" />
        <Bone className="h-7 w-13 rounded-full" />
        <Bone className="h-7 w-13 rounded-full" />
      </div>
    </article>
  );
}
