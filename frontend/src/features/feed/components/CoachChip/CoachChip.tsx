import { useEffect, useRef, useState } from 'react';
import { cn } from '@/utils/cn';

export interface CoachChipProps {
  suggestion: { rewrite: string; reasoning: string };
  onAccept: () => void;
  onEdit: () => void;
  onDismiss: () => void;
}

const CONTROL_BASE = 'inline-flex h-10 items-center justify-center rounded-full text-sm font-semibold';

export function CoachChip({ suggestion, onAccept, onEdit, onDismiss }: CoachChipProps) {
  const [reasoningExpanded, setReasoningExpanded] = useState(false);
  const liveRegionRef = useRef<HTMLDivElement>(null);

  // The reasoning disclosure is local component state, but this same
  // CoachChip instance can persist across an in-place suggestion swap (a new
  // debounced response replacing the visible rewrite without unmounting) —
  // plain useState wouldn't reset on its own, so it's keyed here.
  useEffect(() => {
    setReasoningExpanded(false);
  }, [suggestion.rewrite]);

  // Mount-only: announces once per absent->present transition. A later
  // in-place suggestion swap on the same mount re-renders the visible text
  // silently, per the accessibility audit ("never assertive; one-shot").
  useEffect(() => {
    if (liveRegionRef.current) {
      liveRegionRef.current.textContent = `One way to say it: ${suggestion.rewrite}`;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <aside role="region" aria-label="Suggested rewrite" className="rounded-lg bg-surface-card p-4 shadow-lift">
      <div aria-live="polite" className="sr-only" ref={liveRegionRef} />
      <p className="font-mono text-xs text-ink-muted">One way to say it:</p>
      <p className="mt-2 font-medium text-ink-lead">{suggestion.rewrite}</p>
      <div role="group" className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onAccept}
          className={cn(CONTROL_BASE, 'bg-brand-primary-pressed px-4 text-white')}
        >
          Use this
        </button>
        <button
          type="button"
          onClick={onEdit}
          className={cn(CONTROL_BASE, 'px-3 text-ink-lead hover:bg-surface-subtle')}
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className={cn(CONTROL_BASE, 'px-3 text-ink-muted hover:bg-surface-subtle')}
        >
          Keep mine
        </button>
        <button
          type="button"
          onClick={() => setReasoningExpanded((expanded) => !expanded)}
          aria-expanded={reasoningExpanded}
          className={cn(CONTROL_BASE, 'ml-auto px-3 text-ink-muted hover:bg-surface-subtle')}
        >
          {reasoningExpanded ? 'Hide' : 'Why this?'}
        </button>
      </div>
      {reasoningExpanded && (
        <>
          <div className="mt-4 border-t border-ink-muted/[0.12]" />
          <p className="mt-3 text-sm text-ink-muted">{suggestion.reasoning}</p>
        </>
      )}
    </aside>
  );
}
