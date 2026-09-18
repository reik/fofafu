import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { listAnnouncements, feedKeys, type AnnouncementDTO, type FeedPage as FeedPageDTO } from '@/api/announcements';
import { Layout } from '@/components/Layout';
import { AnnouncementComposer } from '@/features/feed/components/AnnouncementComposer';
import { AnnouncementCard } from '@/features/feed/components/AnnouncementCard';

export default function FeedPage() {
  const [cursor, setCursor] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const { data, isPending, isError, error } = useQuery<FeedPageDTO>({
    queryKey: [...feedKeys.page, cursor],
    queryFn: () => listAnnouncements(cursor ? { cursor, limit: 20 } : { limit: 20 }),
  });

  // Re-render whenever any feedKeys.page query's cache entry changes (initial
  // load, "Load older posts" fetches, or a background refetch triggered by
  // AnnouncementComposer's invalidateQueries) so the useMemo below picks up
  // updates to pages other than the currently-active one.
  const [pageCacheVersion, setPageCacheVersion] = useState(0);
  useEffect(() => {
    const unsubscribe = qc.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated') return;
      if (event.action.type !== 'success' && event.action.type !== 'error') return;
      const key = event.query.queryKey;
      if (key[0] === feedKeys.page[0] && key[1] === feedKeys.page[1]) {
        setPageCacheVersion((v) => v + 1);
      }
    });
    return unsubscribe;
  }, [qc]);

  // The virtualized list's dataset is derived from every cached feedKeys.page
  // query (initial page + each "Load older posts" page fetched so far),
  // merged, de-duplicated by id, and sorted newest-first. Deriving rather than
  // accumulating via useEffect/useState keeps `items` in sync when
  // AnnouncementComposer's invalidateQueries({ queryKey: feedKeys.page })
  // refetches page 1 in the background while the user is paginated past it —
  // both the new post (added to page 1) and previously-loaded older pages
  // remain represented.
  const items = useMemo(() => {
    const pages = qc.getQueriesData<FeedPageDTO>({ queryKey: feedKeys.page });
    const byId = new Map<string, AnnouncementDTO>();
    for (const [, page] of pages) {
      if (!page) continue;
      for (const announcement of page.items) {
        byId.set(announcement.id, announcement);
      }
    }
    return [...byId.values()].sort((a, b) => {
      if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
      return a.id < b.id ? 1 : -1;
    });
  }, [qc, data, cursor, pageCacheVersion]);

  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => 220,
    overscan: 5,
    scrollMargin: listRef.current?.offsetTop ?? 0,
    getItemKey: (index) => items[index]?.id ?? index,
  });

  return (
    <Layout>
      <h1 className="text-3xl font-semibold tracking-tight">Announcements</h1>
      <p className="mt-2 text-ink-muted text-sm">Share what's going on at home.</p>

      <section className="mt-6">
        <AnnouncementComposer />
      </section>

      <section className="mt-6">
        {isPending && cursor === null && <p className="text-ink-muted">Loading…</p>}
        {isError && (
          <p className="text-feedback-error text-sm">
            {error instanceof Error ? error.message : 'Could not load the feed.'}
          </p>
        )}
        {!isPending && !isError && items.length === 0 && (
          <p className="text-ink-muted italic">No posts yet. Be the first.</p>
        )}

        {items.length > 0 && (
          <div
            ref={listRef}
            data-testid="feed-virtual-list"
            role="feed"
            aria-busy={isPending}
            style={{ position: 'relative', width: '100%', height: virtualizer.getTotalSize() }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const announcement = items[virtualRow.index];
              if (!announcement) return null;
              return (
                <div
                  key={virtualRow.key}
                  data-testid="feed-virtual-item"
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
                    paddingBottom: '1rem',
                  }}
                >
                  <AnnouncementCard announcement={announcement} />
                </div>
              );
            })}
          </div>
        )}

        {data?.nextCursor && (
          <button
            type="button"
            onClick={() => setCursor(data.nextCursor)}
            className="mt-4 rounded-full border border-ink-muted/30 px-4 py-2 text-sm font-medium hover:bg-surface-card"
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
