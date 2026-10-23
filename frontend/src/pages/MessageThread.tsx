import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getThread, listThreads, markThreadRead, messageKeys } from '@/api/messages';
import { getFamily, familyKeys } from '@/api/family';
import { Layout } from '@/components/Layout';
import { MessageBubble } from '@/features/messages/components/MessageBubble';
import { MessageComposer } from '@/features/messages/components/MessageComposer';
import { BlockedThreadBanner } from '@/features/moderation/components/BlockedThreadBanner';
import { ThreadHeaderBlockedTag } from '@/features/moderation/components/ThreadHeaderBlockedTag';
import { useIsFamilyBlocked } from '@/features/moderation/hooks/useBlock';
import { formatAuthor } from '@/utils/formatAuthor';

export default function MessageThreadPage() {
  const { userId } = useParams<{ userId: string }>();
  const qc = useQueryClient();

  const { data, isPending, isError, error } = useQuery({
    queryKey: messageKeys.thread(userId ?? ''),
    queryFn: () => getThread(userId!),
    enabled: !!userId,
  });

  const threadsQuery = useQuery({
    queryKey: messageKeys.threads,
    queryFn: listThreads,
  });

  const partnerFromThreads = threadsQuery.data?.find((t) => t.partnerId === userId)?.partnerName ?? undefined;
  const partnerFromMessage = data?.find((m) => !m.mine)?.fromName ?? undefined;
  const partnerName = partnerFromThreads ?? partnerFromMessage ?? null;

  // `/family/:id` dual-resolves either a families.id or an owner's user id
  // (supabase/functions/family/index.ts), so this also works when userId
  // doesn't have a family yet. Needed to know the partner's *canonical*
  // family id — the only thing `blocks` rows are keyed on — since neither
  // MessageDTO nor ThreadDTO carries one.
  const partnerFamilyQuery = useQuery({
    queryKey: familyKeys.byId(userId ?? ''),
    queryFn: () => getFamily(userId!),
    enabled: !!userId,
  });
  const isPartnerBlocked = useIsFamilyBlocked(partnerFamilyQuery.data?.id);
  const partnerFamilyName = partnerFamilyQuery.data?.name ?? formatAuthor(partnerName);

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
        <p className="text-sm text-ink-muted">
          With{' '}
          {partnerName
            ? (
              <Link
                to={`/family/${userId}`}
                className="font-semibold text-ink-lead underline-offset-4 hover:underline"
              >
                {formatAuthor(partnerName)}
              </Link>
            )
            : (
              <span className="font-semibold italic">{formatAuthor(partnerName)}</span>
            )}
          <ThreadHeaderBlockedTag blocked={isPartnerBlocked} />
        </p>
      </header>

      <section className="space-y-2">
        {isPending && <p className="text-ink-muted">Loading…</p>}
        {isError && <p className="text-feedback-error text-sm">{error instanceof Error ? error.message : 'Could not load thread.'}</p>}
        {data?.length === 0 && <p className="text-ink-muted italic text-sm">No messages yet — say hi.</p>}
        {/* Message history renders exactly as today regardless of block
            state, per the resolved Open Question — only new inbound
            messages from a blocked family stop arriving, enforced server
            side; nothing here needs to change. */}
        {data?.map((m) => <MessageBubble key={m.id} message={m} />)}
      </section>

      {/* Variant B (composer stays enabled, inbound-only restriction) — see
          BlockedThreadBanner's own doc comment. The composer below is
          intentionally unmodified: "Message this family" stays usable after
          a block, matching the backend's confirmed DM direction. */}
      <section className="mt-4">
        <BlockedThreadBanner blocked={isPartnerBlocked} familyName={partnerFamilyName} />
      </section>

      <section className="mt-2">
        <MessageComposer to={userId} />
      </section>
    </Layout>
  );
}
