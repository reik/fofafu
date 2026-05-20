import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth';
import { Layout } from '@/components/Layout';
import { AnnouncementComposer } from '@/features/feed/components/AnnouncementComposer';
import { AnnouncementCard } from '@/features/feed/components/AnnouncementCard';
import { listAnnouncements, feedKeys, type FeedPage as FeedPageDTO } from '@/api/announcements';
import { getRecentCommunity, communityKeys } from '@/api/community';

const COMMUNITY_LIMIT = 12;

function initialBadge(name: string) {
  return name.trim().charAt(0).toUpperCase() || '?';
}

export default function HomePage() {
  const user = useAuthStore((s) => s.user);

  const feed = useQuery<FeedPageDTO>({
    queryKey: [...feedKeys.page, null],
    queryFn: () => listAnnouncements({ limit: 20 }),
  });

  const community = useQuery({
    queryKey: communityKeys.recent(COMMUNITY_LIMIT),
    queryFn: () => getRecentCommunity(COMMUNITY_LIMIT),
  });

  return (
    <Layout wide>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[240px_minmax(0,1fr)_240px]">
        <aside aria-label="Your family" className="hidden md:block">
          <section className="overflow-hidden rounded-lg bg-surface-card shadow-lift">
            <div className="h-14 bg-brand-primary/15" />
            <div className="-mt-7 flex flex-col items-center px-4 pb-5 text-center">
              <div
                aria-hidden="true"
                className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-surface-card bg-surface-warm text-2xl font-bold text-brand-primary"
              >
                {user ? initialBadge(user.name) : '?'}
              </div>
              <div className="mt-2 font-semibold leading-tight">{user?.name ?? 'You'}</div>
              {user && (
                <div className="mt-0.5 text-xs text-ink-muted">
                  {user.city}, {user.state}
                </div>
              )}
              <Link
                to="/family/me"
                className="mt-3 w-full rounded-full border border-ink-muted/30 px-3 py-1.5 text-center text-sm font-medium hover:bg-surface-warm"
              >
                Edit family page
              </Link>
            </div>
          </section>
        </aside>

        <section aria-label="Announcements" className="min-w-0 space-y-4">
          <AnnouncementComposer />

          {feed.isPending && <p className="text-ink-muted">Loading…</p>}
          {feed.isError && (
            <p className="text-sm text-feedback-error">
              {feed.error instanceof Error ? feed.error.message : 'Could not load the feed.'}
            </p>
          )}
          {feed.data?.items.length === 0 && (
            <p className="italic text-ink-muted">No posts yet. Be the first.</p>
          )}
          {feed.data?.items.map((a) => <AnnouncementCard key={a.id} announcement={a} />)}
          {feed.data?.nextCursor && (
            <Link
              to="/feed"
              className="inline-block rounded-full border border-ink-muted/30 px-4 py-2 text-sm font-medium hover:bg-surface-card"
            >
              See older posts →
            </Link>
          )}
        </section>

        <aside aria-label="Community" className="hidden md:block">
          <section className="rounded-lg bg-surface-card p-4 shadow-lift">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-muted">
              Community
            </h2>
            {community.isPending && <p className="text-sm text-ink-muted">Loading…</p>}
            {community.isError && (
              <p className="text-sm text-feedback-error">Could not load community.</p>
            )}
            <ul className="space-y-2">
              {community.data?.map((fam) => (
                <li key={fam.id}>
                  <Link
                    to={`/family/${fam.id}`}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-warm"
                  >
                    {fam.avatarUrl ? (
                      <img
                        src={fam.avatarUrl}
                        alt=""
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-warm text-sm font-bold text-brand-primary"
                      >
                        {initialBadge(fam.name)}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {fam.name}
                    </span>
                  </Link>
                </li>
              ))}
              {community.data?.length === 0 && (
                <li className="text-sm italic text-ink-muted">No other families yet.</li>
              )}
            </ul>
            <Link
              to="/search"
              className="mt-3 block text-sm font-semibold text-brand-primary hover:underline"
            >
              View all →
            </Link>
          </section>
        </aside>
      </div>
    </Layout>
  );
}
