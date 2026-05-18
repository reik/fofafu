import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getThread, markThreadRead, messageKeys } from '@/api/messages';
import { Layout } from '@/components/Layout';
import { MessageBubble } from '@/features/messages/components/MessageBubble';
import { MessageComposer } from '@/features/messages/components/MessageComposer';

export default function MessageThreadPage() {
  const { userId } = useParams<{ userId: string }>();
  const qc = useQueryClient();

  const { data, isPending, isError, error } = useQuery({
    queryKey: messageKeys.thread(userId ?? ''),
    queryFn: () => getThread(userId!),
    enabled: !!userId,
  });

  const markRead = useMutation({
    mutationFn: () => markThreadRead(userId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: messageKeys.threads });
      qc.invalidateQueries({ queryKey: messageKeys.unread });
    },
  });

  useEffect(() => {
    if (!userId || !data) return;
    const hasUnread = data.some((m) => !m.mine && !m.read);
    if (hasUnread) markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, data?.length]);

  if (!userId) return <Layout><h1 className="text-3xl font-semibold">Missing conversation</h1></Layout>;

  return (
    <Layout>
      <header className="mb-4">
        <Link to="/messages" className="text-sm text-brand-primary underline-offset-4 hover:underline">← All messages</Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Conversation</h1>
        <p className="text-sm text-ink-muted">With {userId.slice(0, 8)}…</p>
      </header>

      <section className="space-y-2">
        {isPending && <p className="text-ink-muted">Loading…</p>}
        {isError && <p className="text-feedback-error text-sm">{error instanceof Error ? error.message : 'Could not load thread.'}</p>}
        {data?.length === 0 && <p className="text-ink-muted italic text-sm">No messages yet — say hi.</p>}
        {data?.map((m) => <MessageBubble key={m.id} message={m} />)}
      </section>

      <section className="mt-6">
        <MessageComposer to={userId} />
      </section>
    </Layout>
  );
}
