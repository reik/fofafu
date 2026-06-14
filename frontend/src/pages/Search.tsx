import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { searchFamilies, searchKeys } from '@/api/search';
import { Layout } from '@/components/Layout';
import { SearchIcon } from '@/components/icons';

const Schema = z.object({
  q: z.string().trim().min(2, 'At least 2 characters.').max(100),
});
type Values = z.infer<typeof Schema>;

export default function SearchPage() {
  const [submitted, setSubmitted] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(Schema),
    defaultValues: { q: '' },
  });

  const query = useQuery({
    queryKey: searchKeys.families(submitted ?? '', undefined),
    queryFn: () => searchFamilies(submitted!),
    enabled: !!submitted,
  });

  return (
    <Layout>
      <h1 className="text-3xl font-semibold tracking-tight">Find a family</h1>
      <p className="mt-2 text-ink-muted text-sm">
        Search by name, what they wrote about their family, or where they are.
      </p>

      <form
        onSubmit={handleSubmit((data) => setSubmitted(data.q.trim()))}
        className="mt-6 flex items-center gap-2"
        role="search"
        noValidate
      >
        <label htmlFor="search-q" className="sr-only">Search</label>
        <input
          id="search-q"
          {...register('q')}
          placeholder="Name, city, anything…"
          className="flex-1 rounded-full bg-surface-card px-4 py-2 outline-none border border-ink-muted/20 focus:border-brand-primary"
        />
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary px-5 py-2 text-sm font-semibold text-white shadow-lift"
        >
          <SearchIcon className="h-4 w-4" />
          Search
        </button>
      </form>
      {errors.q && <p className="mt-2 text-feedback-error text-xs">{errors.q.message}</p>}

      <section className="mt-8 space-y-3">
        {!submitted && (
          <p className="text-ink-muted italic text-sm">
            Try a name, a city, or a few words from their bio.
          </p>
        )}
        {submitted && query.isPending && <p className="text-ink-muted">Searching…</p>}
        {submitted && query.isError && (
          <p className="text-feedback-error text-sm">
            {query.error instanceof Error ? query.error.message : 'Could not search.'}
          </p>
        )}
        {submitted && query.data && query.data.length === 0 && (
          <p className="text-ink-muted italic">No families matched “{submitted}”.</p>
        )}
        {submitted && query.data && query.data.length > 0 && (
          <>
            <p className="font-mono text-xs uppercase tracking-wide text-ink-muted">
              {query.data.length} result{query.data.length === 1 ? '' : 's'}
            </p>
            <ul className="space-y-3">
              {query.data.map((f) => (
                <li key={f.id}>
                  <Link
                    to={`/family/${f.id}`}
                    className="block rounded-lg bg-surface-card p-4 shadow-lift hover:bg-surface-warm"
                  >
                    <div className="flex items-center gap-3">
                      {f.avatarUrl ? (
                        <img src={f.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                      ) : (
                        <div aria-hidden="true" className="h-10 w-10 rounded-full bg-brand-primary/15 text-brand-primary flex items-center justify-center font-semibold">
                          {f.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold">The {f.name} family</p>
                        {f.bio && <p className="text-sm text-ink-muted line-clamp-2">{f.bio}</p>}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <p className="mt-8 text-sm">
        <Link to="/" className="text-brand-primary underline-offset-4 hover:underline">Back home</Link>
      </p>
    </Layout>
  );
}
