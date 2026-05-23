import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listAnnouncements, feedKeys, type FeedPage as FeedPageDTO } from '@/api/announcements';
import { AnnouncementCard } from '@/features/feed/components/AnnouncementCard';

interface Props {
  familyId: string;
}

export function FamilyRecentPosts({ familyId }: Props) {
  const [cursor, setCursor] = useState<string | null>(null);

  const { data, isPending, isError, error } = useQuery<FeedPageDTO>({
    queryKey: [...feedKeys.byFamily(familyId), cursor],
    queryFn: () =>
      listAnnouncements(cursor ? { familyId, cursor, limit: 20 } : { familyId, limit: 20 }),
  });

  return (
    <section aria-labelledby="family-recent-posts-heading" className="mt-8 space-y-4">
      <h2 id="family-recent-posts-heading" className="text-xl font-semibold tracking-tight">
        Recent posts
      </h2>

      {isPending && <p className="text-ink-muted">Loading…</p>}

      {isError && (
        <p className="text-feedback-error text-sm">
          {error instanceof Error ? error.message : 'Could not load recent posts.'}
        </p>
      )}

      {data && data.items.length === 0 && (
        <p className="text-ink-muted italic">No posts from this family yet.</p>
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
  );
}
