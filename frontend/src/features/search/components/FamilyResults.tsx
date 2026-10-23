import { useRef } from 'react';
import { cn } from '@/utils/cn';
import type { DirectoryResults } from '../hooks/useFamilyDirectory';
import { FamilyResultCard } from './FamilyResultCard';

const BONE = 'bg-surface-subtle animate-pulse motion-reduce:animate-none';
const COUNT_LINE = 'font-mono text-xs uppercase tracking-wide text-ink-muted';
const EMPTY_LINE = 'text-sm italic text-ink-muted';
const SKELETON_CARDS = [0, 1, 2, 3];

function FamilyCardSkeleton() {
  return (
    <div aria-hidden="true" className="rounded-lg bg-surface-card p-4 shadow-lift">
      <div className="flex items-start gap-3">
        <div className={cn(BONE, 'h-10 w-10 shrink-0 rounded-full')} />
        <div className="min-w-0 flex-1 space-y-2">
          <div className={cn(BONE, 'h-4 w-1/2 rounded-sm')} />
          <div className={cn(BONE, 'h-3 w-1/4 rounded-sm')} />
          <div className={cn(BONE, 'h-3 w-full rounded-sm')} />
          <div className={cn(BONE, 'h-3 w-2/3 rounded-sm')} />
        </div>
      </div>
    </div>
  );
}

interface ResultsErrorProps {
  message: string;
  onRetry: () => void;
}

function ResultsError({ message, onRetry }: ResultsErrorProps) {
  return (
    <>
      <p role="alert" className="text-sm text-feedback-error">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="-ml-3 mt-2 rounded-full px-3 py-1 text-sm font-semibold text-ink-lead outline-none hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-brand-primary"
      >
        Try again
      </button>
    </>
  );
}

interface FamilyResultsProps {
  results: DirectoryResults;
}

/**
 * The count line and the list under it. The count line's `<p>` and the
 * status element inside it stay mounted in every state, so a settled list is
 * announced without focus moving; only Retry moves focus, onto this block,
 * because the button it was on goes away.
 */
export function FamilyResults({ results }: FamilyResultsProps) {
  const blockRef = useRef<HTMLDivElement>(null);
  const { status, entries } = results;
  const loading = status === 'loading';
  const retry = () => {
    blockRef.current?.focus();
    results.retry();
  };

  return (
    <>
      <h2 className="sr-only">Families</h2>
      <div ref={blockRef} tabIndex={-1} className="mt-6 focus:outline-none md:mt-8">
        <p className={status === 'ready' && entries.length === 0 ? EMPTY_LINE : COUNT_LINE}>
          <span role="status" className={cn(loading && 'sr-only')}>
            {results.statusText}
            {results.statusSuffix && <span className="sr-only">{results.statusSuffix}</span>}
          </span>
          {loading && <span aria-hidden="true" className={cn(BONE, 'block h-4 w-1/2 rounded-sm')} />}
          {results.sortNote}
        </p>
        {results.emptyHint && <p className={cn(EMPTY_LINE, 'mt-1')}>{results.emptyHint}</p>}
        {status === 'error' && <ResultsError message={results.errorText} onRetry={retry} />}
        <div aria-busy={loading} className="mt-3 space-y-3">
          {loading && SKELETON_CARDS.map((card) => <FamilyCardSkeleton key={card} />)}
          {entries.length > 0 && (
            <ul role="list" className="space-y-3">
              {entries.map((entry) => (
                <li key={entry.family.id}>
                  <FamilyResultCard entry={entry} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
