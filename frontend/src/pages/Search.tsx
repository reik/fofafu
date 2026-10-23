import { useId } from 'react';
import { Layout } from '@/components/Layout';
import { useFamilyDirectory } from '@/features/search/hooks/useFamilyDirectory';
import { FamilyResults } from '@/features/search/components/FamilyResults';
import { FilterBar } from '@/features/search/components/FilterBar';
import { FilterCard } from '@/features/search/components/FilterCard';
import { OpenPlaydatesRail } from '@/features/search/components/OpenPlaydatesRail';
import { SearchForm } from '@/features/search/components/SearchForm';

// Home's three-column grid. The arbitrary variant gives every focusable
// element on the page a scroll margin, so keyboard focus never lands under
// the sticky navbar or the fixed mobile tab bar.
const GRID =
  'grid grid-cols-1 gap-6 md:grid-cols-[240px_minmax(0,1fr)_240px] [&_:is(a,button,input)]:scroll-my-20';

export default function SearchPage() {
  const railHeadingId = useId();
  const { query, submitQuery, filters, results, rail } = useFamilyDirectory();

  return (
    <Layout wide>
      <div className={GRID}>
        <aside aria-label="Filters" className="hidden md:block">
          <FilterCard filters={filters} />
        </aside>

        <section aria-label="Families" className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight">Find a family</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Search by name, what they wrote about their family, or where they are.
          </p>
          <SearchForm query={query} onSubmit={submitQuery} />
          <FilterBar filters={filters} />
          <FamilyResults results={results} />
        </section>

        <aside aria-labelledby={railHeadingId} className="hidden md:block">
          <OpenPlaydatesRail rail={rail} headingId={railHeadingId} />
        </aside>
      </div>
    </Layout>
  );
}
