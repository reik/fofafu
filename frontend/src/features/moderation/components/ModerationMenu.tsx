import { useEffect, useRef, useState } from 'react';
import { MoreIcon } from '@/components/icons';
import { cn } from '@/utils/cn';
import { formatAuthor } from '@/utils/formatAuthor';
import type { ReportTargetType } from '@/api/moderation';
import { useBlockFamilyMutation } from '../hooks/useBlock';
import { contentTypeLabel } from '../contentType';
import { ReportModal } from './ReportModal';

export interface ModerationMenuProps {
  targetType: ReportTargetType;
  targetId: string;
  /** authorId/authorName come straight off the content DTO — authorId is a
   * user id, not a family id (see useBlockFamilyMutation's doc comment). */
  authorId: string | null;
  authorName: string | null;
  /** Fired with the *canonical* families.id once a block succeeds, so the
   * caller can swap the row for BlockedContentPlaceholder and later Undo it. */
  onBlocked?: (resolvedFamilyId: string) => void;
}

/**
 * Combines ui-designer's `ModerationMenuTrigger` + `ModerationMenu` anatomy
 * (fofafu_vault/features/moderation-report-block.md ### Visual §1.1) into a
 * single disclosure component — same "one file, trigger + panel" shape as
 * this codebase's other lightweight disclosure, Navbar's account chip menu.
 * Block is never offered on a DM message (§1.1: "Block isn't specced for
 * DMs") — reachable instead via the sender's family profile page.
 */
export function ModerationMenu({ targetType, targetId, authorId, authorName, onBlocked }: ModerationMenuProps) {
  const [open, setOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const blockMutation = useBlockFamilyMutation();

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const contentType = contentTypeLabel(targetType);
  const canBlock = targetType !== 'message' && !!authorId && !!authorName;

  return (
    <div ref={menuRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={`moderation-menu-${targetId}`}
        aria-label="More actions"
        className={cn(
          'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted outline-none transition-colors',
          'hover:bg-surface-subtle hover:text-ink-lead focus-visible:ring-2 focus-visible:ring-brand-primary',
          open && 'bg-surface-subtle text-ink-lead',
        )}
      >
        <MoreIcon className="h-5 w-5" />
      </button>

      {open && (
        <div
          id={`moderation-menu-${targetId}`}
          role="menu"
          className="absolute right-0 top-full z-10 mt-1 min-w-[12rem] rounded bg-surface-card p-1 shadow-lift"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setReportOpen(true);
            }}
            className="block w-full rounded px-3 py-2 text-left text-sm font-medium text-ink-lead hover:bg-surface-subtle"
          >
            Report this {contentType}
          </button>
          {canBlock && (
            <button
              type="button"
              role="menuitem"
              disabled={blockMutation.isPending}
              onClick={() => {
                setOpen(false);
                blockMutation.mutate(authorId as string, {
                  onSuccess: (dto) => onBlocked?.(dto.blockedFamilyId),
                });
              }}
              className="block w-full rounded px-3 py-2 text-left text-sm font-medium text-ink-lead hover:bg-surface-subtle disabled:opacity-60"
            >
              {blockMutation.isPending ? 'Blocking…' : `Block ${formatAuthor(authorName)}`}
            </button>
          )}
        </div>
      )}

      {reportOpen && (
        <ReportModal
          targetType={targetType}
          targetId={targetId}
          onClose={() => {
            setReportOpen(false);
            triggerRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}
