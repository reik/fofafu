import { Link } from 'react-router-dom';
import { cn } from '@/utils/cn';

// The classes Home's Community rail badge ships (Home.tsx), except the text size:
// the same 10px written in rem, so it follows the font size the reader has set.
const BADGE =
  'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-brand-warm/50 bg-brand-warm/20 px-2 py-0.5 text-[0.625rem] font-bold text-[#8a5a12]';

// The `after:` box grows the pill's hit area to about 45px tall without changing how it looks.
const BADGE_LINK =
  "relative outline-none after:absolute after:-inset-x-2 after:-inset-y-3 after:content-[''] hover:bg-brand-warm/30 focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2";

interface PlaydateBadgeProps {
  /** Visible text after the calendar glyph. */
  label: string;
  /** What assistive tech reads instead of the glyph and label. */
  accessibleLabel: string;
  /** With `to` the badge is a link; without it, a static indicator. */
  to?: string;
  /** Static badge only: id of the element holding `accessibleLabel`, for `aria-describedby`. */
  accessibleId?: string;
}

export function PlaydateBadge({ label, accessibleLabel, to, accessibleId }: PlaydateBadgeProps) {
  const visible = <span aria-hidden="true">🗓 {label}</span>;

  if (to !== undefined) {
    return (
      <Link to={to} aria-label={accessibleLabel} className={cn(BADGE, BADGE_LINK)}>
        {visible}
      </Link>
    );
  }

  return (
    <span className={BADGE}>
      {visible}
      <span id={accessibleId} className="sr-only">
        {accessibleLabel}
      </span>
    </span>
  );
}
