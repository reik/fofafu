import { useEffect, useState } from 'react';
import { EdgeApiError } from '@/api/edgeClient';
import { useBlockFamilyMutation, useIsFamilyBlocked, useUnblockFamilyMutation } from '../hooks/useBlock';
import { BlockUndoStrip } from './BlockUndoStrip';

type Ack = 'blocked' | 'unblocked' | null;
const UNBLOCKED_ACK_MS = 4000;

export interface FamilyProfileBlockControlProps {
  familyId: string;
  familyName: string;
}

/**
 * `BlockAction` (profile-page context) + a status read, per
 * fofafu_vault/features/moderation-report-block.md ### Visual §1.4. One tap,
 * no confirmation dialog — ui-designer's deliberate call, flagged for
 * design-lead sign-off but built as specced. The Block→Unblock flip and the
 * undo acknowledgment are driven by local `ack` state rather than waiting on
 * the invalidated blocks-list query to refetch, so they read as instant per
 * ### Visual §6 ("Optimistic UI is load-bearing here, not a nice-to-have").
 */
export function FamilyProfileBlockControl({ familyId, familyName }: FamilyProfileBlockControlProps) {
  const queriedBlocked = useIsFamilyBlocked(familyId);
  const blockMutation = useBlockFamilyMutation();
  const unblockMutation = useUnblockFamilyMutation();
  const [ack, setAck] = useState<Ack>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const blocked = ack === 'blocked' ? true : ack === 'unblocked' ? false : queriedBlocked;

  useEffect(() => {
    if (!ack) return undefined;
    const timer = window.setTimeout(() => setAck(null), ack === 'blocked' ? 7000 : UNBLOCKED_ACK_MS);
    return () => window.clearTimeout(timer);
  }, [ack]);

  const pending = blockMutation.isPending || unblockMutation.isPending;

  const handleBlock = () => {
    setActionError(null);
    blockMutation.mutate(familyId, {
      onSuccess: () => setAck('blocked'),
      onError: (err) => setActionError(err instanceof EdgeApiError ? err.message : "We couldn't block that family. Try again?"),
    });
  };

  const handleUnblock = () => {
    setActionError(null);
    unblockMutation.mutate(familyId, {
      onSuccess: () => setAck('unblocked'),
      onError: (err) => setActionError(err instanceof EdgeApiError ? err.message : "We couldn't unblock that family. Try again?"),
    });
  };

  return (
    <div>
      <button
        type="button"
        onClick={blocked ? handleUnblock : handleBlock}
        disabled={pending}
        className="inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-subtle disabled:opacity-60"
      >
        {pending ? (blocked ? 'Unblocking…' : 'Blocking…') : blocked ? 'Unblock' : 'Block this family'}
      </button>

      {actionError && <p role="alert" className="mt-1 text-sm text-feedback-error">{actionError}</p>}

      {ack === 'blocked' && (
        <BlockUndoStrip
          familyName={familyName}
          undoing={unblockMutation.isPending}
          onUndo={() => unblockMutation.mutate(familyId, { onSuccess: () => setAck('unblocked') })}
          onDismiss={() => setAck(null)}
        />
      )}
      {ack === 'unblocked' && (
        <p role="status" className="mt-3 text-sm text-ink-muted">
          Unblocked — the {familyName} family can see your posts and message you again.
        </p>
      )}

      {blocked && (
        <div className="mt-3 rounded-lg bg-surface-card p-4 shadow-lift">
          <p className="text-ink-lead">You&apos;ve blocked the {familyName} family.</p>
          <p className="mt-1 text-sm text-ink-muted">They can&apos;t see your posts or message you. You won&apos;t see theirs.</p>
        </div>
      )}
    </div>
  );
}
