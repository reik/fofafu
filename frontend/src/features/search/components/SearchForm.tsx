import { useId } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { SearchIcon } from '@/components/icons';
import { QUERY_LENGTH } from '../hooks/useFamilyDirectory';

// An empty box is not an error: it returns to the browse list.
const Schema = z.object({
  q: z
    .string()
    .trim()
    .max(QUERY_LENGTH.max)
    .refine((value) => value === '' || value.length >= QUERY_LENGTH.min, 'At least 2 characters.'),
});
type Values = z.infer<typeof Schema>;

interface SearchFormProps {
  /** The submitted query ('' while browsing). The box follows it, so Back and reload restore what was searched. */
  query: string;
  onSubmit: (query: string) => void;
}

const FORM_CLASS = 'mt-6 flex flex-wrap items-center gap-2';
const INPUT_CLASS =
  'min-w-0 grow basis-40 rounded-full border border-ink-muted/70 bg-surface-card px-4 py-2 outline-none placeholder:text-ink-muted focus:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary';
const SUBMIT_CLASS =
  'inline-flex items-center gap-1.5 rounded-full bg-brand-primary-pressed px-5 py-2 text-sm font-semibold text-white shadow-lift outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-warm';

export function SearchForm({ query, onSubmit }: SearchFormProps) {
  const inputId = useId();
  const errorId = useId();
  const { register, handleSubmit, formState } = useForm<Values>({ resolver: zodResolver(Schema), values: { q: query } });
  const error = formState.errors.q;

  return (
    <>
      <form onSubmit={handleSubmit((data) => onSubmit(data.q))} className={FORM_CLASS} role="search" noValidate>
        <label htmlFor={inputId} className="sr-only">Search</label>
        <input
          id={inputId}
          {...register('q')}
          placeholder="Name, city, anything…"
          maxLength={QUERY_LENGTH.max}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={INPUT_CLASS}
        />
        <button type="submit" className={SUBMIT_CLASS}>
          <SearchIcon className="h-4 w-4" />
          Search
        </button>
      </form>
      {error && (
        <p id={errorId} role="alert" className="mt-2 text-xs text-feedback-error">
          {error.message}
        </p>
      )}
    </>
  );
}
