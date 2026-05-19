import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getFamily, familyKeys } from '@/api/family';
import { Layout } from '@/components/Layout';
import { FamilyHeader } from '@/features/family/components/FamilyHeader';

export default function FamilyViewPage() {
  const { id } = useParams<{ id: string }>();

  const { data, isPending, isError, error } = useQuery({
    queryKey: familyKeys.byId(id ?? ''),
    queryFn: () => getFamily(id!),
    enabled: !!id,
  });

  if (!id) {
    return (
      <Layout>
        <h1 className="text-3xl font-semibold tracking-tight">Missing family</h1>
      </Layout>
    );
  }

  if (isPending) return <Layout><p className="text-ink-muted">Loading…</p></Layout>;

  if (isError) {
    return (
      <Layout>
        <h1 className="text-3xl font-semibold tracking-tight">We couldn’t find that family</h1>
        <p className="mt-2 text-sm text-ink-muted">{error instanceof Error ? error.message : 'Try the link again.'}</p>
        <p className="mt-6 text-sm">
          <Link to="/" className="text-brand-primary underline-offset-4 hover:underline">Back home</Link>
        </p>
      </Layout>
    );
  }

  return (
    <Layout>
      <FamilyHeader family={data} />
      {!data.isOwner && (
        <div className="mt-6">
          <Link
            to={`/messages/${data.ownerId}`}
            className="inline-block rounded-full bg-brand-primary px-5 py-2.5 font-semibold text-white shadow-lift"
          >
            Message this family
          </Link>
        </div>
      )}
      <p className="mt-8 text-sm">
        <Link to="/" className="text-brand-primary underline-offset-4 hover:underline">Back home</Link>
      </p>
    </Layout>
  );
}
