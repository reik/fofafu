import { useEffect, useRef } from 'react';
import { ShieldIcon } from '@/components/icons';
import { cn } from '@/utils/cn';

/**
 * PLACEHOLDER COPY — ux-writer had not landed a string table for
 * [[features/content-moderation-gate]] when this was written. Centralized
 * here (mirroring reply-coach's `coach.suggest.preface` naming convention)
 * so the real strings can drop in with a one-line diff. Do not let this
 * drift once the real table lands — swap verbatim, don't paraphrase.
 *
 * Deliberately generic and non-punitive per the acceptance criteria, and
 * deliberately does NOT name a violation category to the author (mirrors
 * reply-coach's voice rule: "category metadata is for backend/analytics
 * only, never surfaced in a user-facing string").
 */
export const MODERATION_BLOCK_COPY = {
  heading: "Let's revise this before posting",
  body: "This doesn't look like it fits our community guidelines yet. Take another look and try again — nothing here has been posted or shared with anyone.",
} as const;

interface ModerationBlockNoticeProps {
  /** Id the parent form wires to the textarea's `aria-describedby`. */
  id: string;
  className?: string;
}

/**
 * The publish-time gate's blocking message. Renders only when a submission
 * is flagged — there is no dismissible/"post anyway" affordance, matching
 * the feature's "firm gate, not a suggestion" framing (contrast with the
 * dismissible [[features/reply-coach]] CoachChip, which this deliberately
 * does not reuse or modify).
 *
 * Accessibility (per a11y-auditor's ask): `role="alert"` gives an implicit
 * assertive live region so screen readers announce the block immediately —
 * a deliberate escalation over reply-coach's `aria-live="polite"` chip,
 * since this is a hard stop, not an advisory nudge. Focus also moves here
 * on mount so keyboard/screen-reader users get the same "something changed"
 * signal sighted users get for free from the visual change.
 */
export function ModerationBlockNotice({ id, className }: ModerationBlockNoticeProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div
      ref={ref}
      id={id}
      role="alert"
      tabIndex={-1}
      className={cn(
        'flex gap-2 rounded-lg border border-feedback-warning bg-surface-card p-3 shadow-lift outline-none focus-visible:ring-2 focus-visible:ring-brand-primary',
        className,
      )}
    >
      <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0 text-feedback-warning" />
      <div className="text-sm">
        <p className="font-semibold text-ink-lead">{MODERATION_BLOCK_COPY.heading}</p>
        <p className="mt-0.5 text-ink-muted">{MODERATION_BLOCK_COPY.body}</p>
      </div>
    </div>
  );
}
