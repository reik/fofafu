import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnblockFamilyMutation } from '../hooks/useBlock';

export interface BlockedContentPlaceholderProps {
  /** Canonical families.id — the value ModerationMenu captured from the
   * block mutation's response, NOT the content DTO's raw authorId. */
  familyId: string;
  familyName: string;
}

/**
 * Replaces an announcement/comment row in place once its author has just
 * been blocked from that row's own ModerationMenu — "the source row itself
 * becomes the confirmation," per
 * fofafu_vault/features/moderation-report-block.md ### Visual §1.3. Once
 * this view is left and refetched, blocked-family server-side filtering
 * removes the row entirely; this placeholder only bridges the *current*
 * view's optimistic update in the meantime.
 *
 * Post-audit fix (a11y-auditor Blocking #2): the row-level ModerationMenu's
 * Block menuitem unmounts the instant it's clicked, and once the mutation
 * resolves the entire row (AnnouncementCard/CommentList/AnnouncementDetail)
 * is replaced by this component — there is no DOM node left from before the
 * block to hand focus back to. This placeholder is therefore the first
 * sensible landing spot: its container is a programmatic focus target
 * (`tabIndex={-1}` + `.focus()` on mount), the same convention this
 * codebase already uses for post-transition focus in Layout.tsx's
 * `<main id="main" tabIndex={-1}>` / useFocusMainOnRouteChange. Keeps a
 * keyboard user's tab position inside the row instead of dropping to
 * document.body.
 */
export function BlockedContentPlaceholder({ familyId, familyName }: BlockedContentPlaceholderProps) {
  const unblock = useUnblockFamilyMutation();
  const [undone, setUndone] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const handleUndo = () => {
    unblock.mutate(familyId, { onSuccess: () => setUndone(true) });
  };

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      role="status"
      className="rounded bg-surface-subtle p-3 text-sm text-ink-muted focus:outline-none"
    >
      {undone ? (
        <span>Unblocked — the {familyName} family can see your posts and message you again.</span>
      ) : (
        <span>
          You&apos;ve blocked the {familyName} family — their posts are now hidden.{' '}
          {/* Post-audit fix (a11y-auditor Blocking #1, WCAG 1.4.3): both links
              were text-brand-primary, failing 4.5:1 on this surface.subtle
              background (~3.13:1). ink.lead passes (14.6:1+), no new token. */}
          <button
            type="button"
            onClick={handleUndo}
            disabled={unblock.isPending}
            className="font-semibold text-ink-lead underline-offset-4 hover:underline disabled:opacity-60"
          >
            {unblock.isPending ? 'Undoing…' : 'Undo'}
          </button>
          {' · '}
          <Link to={`/family/${familyId}`} className="font-semibold text-ink-lead underline-offset-4 hover:underline">
            View their profile
          </Link>
        </span>
      )}
    </div>
  );
}
