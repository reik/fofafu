import { useEffect } from 'react';

const AUTO_DISMISS_MS = 7000;

export interface BlockUndoStripProps {
  familyName: string;
  onUndo: () => void;
  onDismiss: () => void;
  undoing?: boolean;
}

/**
 * Transient strip shown on the family profile page right after a fresh
 * block — auto-dismisses after ~6-8s or on navigation (this component
 * unmounting handles the "or navigation" half for free).
 * fofafu_vault/features/moderation-report-block.md ### Visual §1.3/§3.
 */
export function BlockUndoStrip({ familyName, onUndo, onDismiss, undoing }: BlockUndoStripProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
    // Only ever armed once per mount — a fresh block always remounts this
    // component (see FamilyProfileBlockControl's `ack` state).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <p role="status" className="mt-3 text-sm text-ink-muted">
      Blocked — you won&apos;t see the {familyName} family anymore.{' '}
      <button
        type="button"
        onClick={onUndo}
        disabled={undoing}
        className="font-semibold text-brand-primary underline-offset-4 hover:underline disabled:opacity-60"
      >
        {undoing ? 'Undoing…' : 'Undo'}
      </button>
    </p>
  );
}
