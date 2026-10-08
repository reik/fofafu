import { useId } from 'react';
import { cn } from '@/utils/cn';
import type { DirectoryFilters, FilterOption } from '../hooks/useFamilyDirectory';
import { FILTER_CHECKBOX_CLASS } from './FilterCard';

const PILL = 'inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm font-medium';
const CLEAR = 'min-h-11 rounded-full px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-brand-primary';

function pillState(option: FilterOption): string {
  if (option.unavailable) return 'cursor-not-allowed border-ink-muted/20 bg-surface-card text-ink-muted';
  if (option.checked) return 'cursor-pointer border-brand-primary bg-brand-primary/15';
  return 'cursor-pointer border-ink-muted/20 bg-surface-card hover:bg-surface-subtle';
}

function clearState(anyActive: boolean): string {
  return anyActive ? 'text-ink-muted hover:bg-surface-subtle hover:text-ink-lead' : 'cursor-not-allowed text-ink-muted/50';
}

interface FilterBarProps {
  filters: DirectoryFilters;
}

/**
 * The filters below `md`, where the filter card is hidden: one pill per
 * filter with its checkbox still visible, so on/off never rests on colour.
 */
export function FilterBar({ filters }: FilterBarProps) {
  const hintId = useId();
  const unavailable = filters.options.find((option) => option.unavailable);

  return (
    <div role="group" aria-label="Filters" className="mt-4 flex flex-wrap items-center gap-2 md:hidden">
      {filters.options.map((option) => (
        <label key={option.key} className={cn(PILL, pillState(option))}>
          <input
            type="checkbox"
            checked={option.checked}
            onChange={option.toggle}
            aria-disabled={option.unavailable ? true : undefined}
            aria-describedby={option.unavailable ? hintId : undefined}
            className={FILTER_CHECKBOX_CLASS}
          />
          {option.label}
        </label>
      ))}
      <button
        type="button"
        onClick={filters.clear}
        aria-disabled={filters.anyActive ? undefined : true}
        className={cn(CLEAR, clearState(filters.anyActive))}
      >
        Clear filters
      </button>
      {unavailable && (
        <p id={hintId} className="basis-full text-xs text-ink-muted">
          {unavailable.hint}
        </p>
      )}
    </div>
  );
}
