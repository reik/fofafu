import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listAnnouncements, feedKeys, type FeedPage as FeedPageDTO } from '@/api/announcements';
import { Layout } from '@/components/Layout';
import { AnnouncementComposer } from '@/features/feed/components/AnnouncementComposer';
import { AnnouncementCard } from '@/features/feed/components/AnnouncementCard';

export default function FeedPage() {
  const [cursor, setCursor] = useState<string | null>(null);

  const { data, isPending, isError, error } = useQuery<FeedPageDTO>({
    queryKey: [...feedKeys.page, cursor],
    queryFn: () => listAnnouncements(cursor ? { cursor, limit: 20 } : { limit: 20 }),
  });

  return (
    <Layout>
      <h1 className="text-3xl font-semibold tracking-tight">Announcements</h1>
      <p className="mt-2 text-ink-muted text-sm">Share what's going on at home.</p>

      <section className="mt-6">
        <AnnouncementComposer />
      </section>

      <section className="mt-6 space-y-4">
        {isPending && <p className="text-ink-muted">Loading…</p>}
        {isError && (
          <p className="text-feedback-error text-sm">
            {error instanceof Error ? error.message : 'Could not load the feed.'}
          </p>
        )}
        {data?.items.length === 0 && (
          <p className="text-ink-muted italic">No posts yet. Be the first.</p>
        )}
        {data?.items.map((a) => <AnnouncementCard key={a.id} announcement={a} />)}
        {data?.nextCursor && (
          <button
            type="button"
            onClick={() => setCursor(data.nextCursor)}
            className="rounded-full border border-ink-muted/30 px-4 py-2 text-sm font-medium hover:bg-surface-card"
          >
            Load older posts
          </button>
        )}
      </section>

      <p className="mt-8 text-sm">
        <Link to="/" className="text-brand-primary underline-offset-4 hover:underline">Back home</Link>
      </p>
    </Layout>
  );
}
