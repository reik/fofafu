import { useId } from 'react';
import { cn } from '@/utils/cn';
import type { DirectoryFilters, FilterOption } from '../hooks/useFamilyDirectory';

/**
 * Shared with FilterBar. An unavailable filter is `aria-disabled`, not
 * `disabled`, so it stays in the tab order and its reason gets read; the box
 * is dimmed at rest and restored on keyboard focus so the ring keeps its
 * contrast.
 */
export const FILTER_CHECKBOX_CLASS =
  'h-4 w-4 cursor-pointer accent-brand-primary-pressed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:focus-visible:opacity-100';

interface FilterCardOptionProps {
  option: FilterOption;
}

/** The whole row is the click target; the label names the checkbox and the hint describes it. */
function FilterCardOption({ option }: FilterCardOptionProps) {
  const labelId = useId();
  const hintId = useId();

  return (
    <label
      className={cn(
        '-mx-2 flex items-start gap-2 rounded px-2 py-2 text-sm',
        option.unavailable ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-surface-warm',
      )}
    >
      <span className="flex h-5 items-center">
        <input
          type="checkbox"
          checked={option.checked}
          onChange={option.toggle}
          aria-disabled={option.unavailable ? true : undefined}
          aria-labelledby={labelId}
          aria-describedby={hintId}
          className={FILTER_CHECKBOX_CLASS}
        />
      </span>
      <span className="min-w-0">
        <span id={labelId} className={cn('block font-medium', option.unavailable && 'text-ink-muted')}>
          {option.label}
        </span>
        <span id={hintId} className="block text-xs text-ink-muted">
          {option.hint}
        </span>
      </span>
    </label>
  );
}

interface FilterCardProps {
  filters: DirectoryFilters;
}

/** The filters at `md` and up. FilterBar is the same state below `md`. */
export function FilterCard({ filters }: FilterCardProps) {
  return (
    <section className="rounded-lg bg-surface-card p-4 shadow-lift">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-muted">Filter</h2>
      {filters.options.map((option) => (
        <FilterCardOption key={option.key} option={option} />
      ))}
      <div className="mt-3 border-t border-ink-muted/10 pt-3">
        <button
          type="button"
          onClick={filters.clear}
          aria-disabled={filters.anyActive ? undefined : true}
          className={cn(
            '-ml-2 rounded-full px-2 py-1 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-brand-primary',
            filters.anyActive ? 'text-ink-muted hover:bg-surface-subtle hover:text-ink-lead' : 'cursor-not-allowed text-ink-muted/50',
          )}
        >
          Clear filters
        </button>
      </div>
    </section>
  );
}
