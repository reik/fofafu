import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getMyFamily, familyKeys } from '@/api/family';
import { Layout } from '@/components/Layout';
import { FamilyHeader } from '@/features/family/components/FamilyHeader';
import { FamilyEditForm } from '@/features/family/components/FamilyEditForm';

export default function FamilyMePage() {
  const [editing, setEditing] = useState(false);
  const { data, isPending, isError, error } = useQuery({
    queryKey: familyKeys.me,
    queryFn: getMyFamily,
  });

  if (isPending) {
    return (
      <Layout>
        <p className="text-ink-muted">Loading your family page…</p>
      </Layout>
    );
  }

  if (isError) {
    return (
      <Layout>
        <h1 className="text-3xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="text-ink-muted mt-2 text-sm">{error instanceof Error ? error.message : 'Try again later.'}</p>
      </Layout>
    );
  }

  return (
    <Layout>
      {editing
        ? <>
            <h1 className="text-3xl font-semibold tracking-tight">Edit your family page</h1>
            <div className="mt-6">
              <FamilyEditForm family={data} onCancel={() => setEditing(false)} onSaved={() => setEditing(false)} />
            </div>
          </>
        : <FamilyHeader family={data} onEdit={() => setEditing(true)} />}

      <p className="mt-8 text-sm">
        <Link to="/" className="text-brand-primary underline-offset-4 hover:underline">Back home</Link>
      </p>
    </Layout>
  );
}
