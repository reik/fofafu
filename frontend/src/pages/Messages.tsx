import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listThreads, messageKeys } from '@/api/messages';
import { Layout } from '@/components/Layout';
import { cn } from '@/utils/cn';
import { formatAuthor } from '@/utils/formatAuthor';

export default function MessagesPage() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: messageKeys.threads,
    queryFn: listThreads,
  });

  return (
    <Layout>
      <h1 className="text-3xl font-semibold tracking-tight">Messages</h1>
      <p className="mt-2 text-ink-muted text-sm">Your private conversations with other foster families.</p>

      <section className="mt-6 space-y-3">
        {isPending && <p className="text-ink-muted">Loading…</p>}
        {isError && <p className="text-feedback-error text-sm">{error instanceof Error ? error.message : 'Could not load threads.'}</p>}
        {data?.length === 0 && <p className="text-ink-muted italic">No messages yet.</p>}
        {data?.map((t) => (
          <Link
            key={t.partnerId}
            to={`/messages/${t.partnerId}`}
            className="block rounded-lg bg-surface-card px-4 py-3 shadow-lift hover:bg-surface-warm"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className={cn('font-semibold truncate', !t.partnerName && 'italic text-ink-muted')}>
                {formatAuthor(t.partnerName)}
              </span>
              <time className="text-xs font-mono text-ink-muted">
                {new Date(t.lastAt).toLocaleString()}
              </time>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3">
              <span className="text-sm text-ink-muted truncate">{t.lastMessage}</span>
              {t.unreadCount > 0 && (
                <span className="rounded-full bg-brand-primary px-2 py-0.5 text-xs font-semibold text-white">
                  {t.unreadCount}
                </span>
              )}
            </div>
          </Link>
        ))}
      </section>

      <p className="mt-8 text-sm">
        <Link to="/" className="text-brand-primary underline-offset-4 hover:underline">Back home</Link>
      </p>
    </Layout>
  );
}
