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
      {/* Post-audit fix (a11y-auditor Blocking #1, WCAG 1.4.3): text-brand-primary
          failed 4.5:1 on this strip's surface.warm background (~3.56:1);
          ink.lead passes (14.6:1+) and needs no new token. Underline still
          carries the "this is a link" cue independent of color. */}
      <button
        type="button"
        onClick={onUndo}
        disabled={undoing}
        className="font-semibold text-ink-lead underline-offset-4 hover:underline disabled:opacity-60"
      >
        {undoing ? 'Undoing…' : 'Undo'}
      </button>
    </p>
  );
}
