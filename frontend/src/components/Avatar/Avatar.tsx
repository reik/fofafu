import { cn } from '@/utils/cn';

export type AvatarSize = 'sm' | 'lg';

const SIZE_CLASSES: Record<AvatarSize, string> = {
  sm: 'h-10 w-10 text-base',
  lg: 'h-16 w-16 text-2xl',
};

export interface AvatarProps {
  avatarUrl?: string | null | undefined;
  name?: string | null | undefined;
  size?: AvatarSize;
  className?: string;
}

export function Avatar({ avatarUrl, name, size = 'sm', className }: AvatarProps) {
  const sizeClasses = SIZE_CLASSES[size];

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className={cn(sizeClasses, 'rounded-full object-cover shadow-lift shrink-0', className)}
      />
    );
  }

  if (name) {
    return (
      <div
        aria-hidden="true"
        className={cn(
          sizeClasses,
          'rounded-full bg-brand-primary/15 text-brand-primary shadow-lift shrink-0 flex items-center justify-center font-semibold',
          className,
        )}
      >
        {name.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className={cn(
        sizeClasses,
        'rounded-full bg-surface-card text-ink-muted shadow-lift shrink-0 flex items-center justify-center',
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-1/2 w-1/2"
      >
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 19c0-3.3 3.1-6 7-6s7 2.7 7 6" />
      </svg>
    </div>
  );
}
