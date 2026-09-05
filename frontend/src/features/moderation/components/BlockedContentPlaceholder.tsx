import { useState } from 'react';
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
 */
export function BlockedContentPlaceholder({ familyId, familyName }: BlockedContentPlaceholderProps) {
  const unblock = useUnblockFamilyMutation();
  const [undone, setUndone] = useState(false);

  const handleUndo = () => {
    unblock.mutate(familyId, { onSuccess: () => setUndone(true) });
  };

  return (
    <div role="status" className="rounded bg-surface-subtle p-3 text-sm text-ink-muted">
      {undone ? (
        <span>Unblocked — the {familyName} family can see your posts and message you again.</span>
      ) : (
        <span>
          You&apos;ve blocked the {familyName} family — their posts are now hidden.{' '}
          <button
            type="button"
            onClick={handleUndo}
            disabled={unblock.isPending}
            className="font-semibold text-brand-primary underline-offset-4 hover:underline disabled:opacity-60"
          >
            {unblock.isPending ? 'Undoing…' : 'Undo'}
          </button>
          {' · '}
          <Link to={`/family/${familyId}`} className="font-semibold text-brand-primary underline-offset-4 hover:underline">
            View their profile
          </Link>
        </span>
      )}
    </div>
  );
}
