import { useId, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import type { UseQueryResult } from '@tanstack/react-query';
import type { MessageDTO, ThreadDTO } from '@/api/messages';
import { Avatar } from '@/components/Avatar';
import { MessageIcon } from '@/components/icons';
import { BlockedThreadBanner } from '@/features/moderation/components/BlockedThreadBanner';
import { ThreadHeaderBlockedTag } from '@/features/moderation/components/ThreadHeaderBlockedTag';
import { cn } from '@/utils/cn';
import { formatTimestamp } from '@/utils/formatTimestamp';
import { useConversationPane } from '../hooks/useConversationPane';
import { MessageBubble } from './MessageBubble';
import { MessageComposer } from './MessageComposer';

const BONE = 'bg-surface-subtle animate-pulse motion-reduce:animate-none';
const BUBBLE_BONES = ['w-2/3 self-start', 'w-1/2 self-end', 'w-3/5 self-start', 'w-2/5 self-end'];
const HOUR_MS = 3_600_000;
const FOCUS_RING = 'outline-none focus-visible:ring-2 focus-visible:ring-brand-primary';

/** A time divider goes before the first message and after a new day or an hour's gap. */
function startsGroup(previous: MessageDTO | undefined, message: MessageDTO): boolean {
  if (!previous) return true;
  const before = new Date(previous.createdAt);
  const at = new Date(message.createdAt);
  return before.toDateString() !== at.toDateString() || at.getTime() - before.getTime() >= HOUR_MS;
}

function EmptyCenter({ noThreads, frameClass, centerRef }: {
  noThreads: boolean;
  frameClass: string;
  centerRef: RefObject<HTMLElement>;
}) {
  const headingId = useId();
  return (
    <section ref={centerRef} tabIndex={-1} aria-labelledby={headingId} className={cn(frameClass, 'items-center justify-center p-6 text-center')}>
      <MessageIcon className="h-8 w-8 text-ink-muted" />
      <h2 id={headingId} className="mt-3 text-base font-semibold">
        {noThreads ? 'Start your first conversation' : 'Pick a conversation'}
      </h2>
      <p className="mt-1 max-w-[32ch] text-sm text-ink-muted">
        {noThreads
          ? 'Say hello to a family nearby, or find one by name or city.'
          : 'Choose a family on the left to read and reply here.'}
      </p>
      {noThreads && (
        <Link
          to="/search"
          className="mt-4 inline-flex min-h-11 items-center rounded-full bg-brand-primary-pressed px-4 py-2 text-sm font-semibold text-white shadow-lift outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
        >
          Find a family
        </Link>
      )}
    </section>
  );
}

function History({ messages, partnerName }: { messages: MessageDTO[]; partnerName: string }) {
  return (
    <ol className="flex flex-col gap-3">
      {messages.map((m, i) => (
        <li key={m.id} className="flex flex-col gap-3">
          {startsGroup(messages[i - 1], m) && (
            <p aria-hidden="true" className="text-center font-mono text-xs text-ink-muted">{formatTimestamp(m.createdAt)}</p>
          )}
          <MessageBubble message={m} senderName={partnerName} showTime={false} />
        </li>
      ))}
    </ol>
  );
}

function HistorySkeleton() {
  return (
    <>
      <p className="sr-only">Loading conversation…</p>
      <div aria-hidden="true" className="flex flex-col gap-3">
        {BUBBLE_BONES.map((width) => <div key={width} className={cn(BONE, 'h-10 rounded-lg', width)} />)}
      </div>
    </>
  );
}

/** Who the conversation is with; bones until a name is known. */
function PaneHeader({ partnerId, pane }: { partnerId: string; pane: ReturnType<typeof useConversationPane> }) {
  if (!pane.partnerKnown) {
    return (
      <header aria-hidden="true" className="flex items-center gap-3 border-b border-ink-muted/20 px-4 py-3">
        <div className={cn(BONE, 'h-10 w-10 shrink-0 rounded-full')} />
        <div className="flex-1 space-y-2">
          <div className={cn(BONE, 'h-3 w-1/3 rounded-sm')} />
          <div className={cn(BONE, 'h-2.5 w-1/4 rounded-sm')} />
        </div>
      </header>
    );
  }

  return (
    <header className="flex items-center gap-3 border-b border-ink-muted/20 px-4 py-3">
      <Avatar avatarUrl={pane.avatarUrl} name={pane.partnerName} />
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-lg font-semibold">
          {pane.partnerLinked ? (
            <Link to={`/family/${partnerId}`} className={cn('rounded-sm text-ink-lead underline-offset-4 hover:underline', FOCUS_RING)}>
              {pane.partnerName}
            </Link>
          ) : (
            <span className="italic">{pane.partnerName}</span>
          )}
          <ThreadHeaderBlockedTag blocked={pane.isBlocked} />
        </h2>
        {pane.location && <p className="text-sm text-ink-muted">{pane.location}</p>}
      </div>
    </header>
  );
}

interface ConversationPaneProps {
  /** The selected conversation's partner (user id); none selected shows an empty state. */
  partnerId?: string | undefined;
  threads: UseQueryResult<ThreadDTO[]>;
  /** md and wider: fill the column's height, scroll inside, and take focus on a switch. */
  isDesktop: boolean;
}

/** The centre column: the open conversation, or what to do when none is open. */
export function ConversationPane({ partnerId, threads, isDesktop }: ConversationPaneProps) {
  const pane = useConversationPane({ partnerId, threads: threads.data, focusOnChange: isDesktop });
  const frame = cn(
    'flex flex-col overflow-hidden rounded-lg bg-surface-card shadow-lift focus:outline-none',
    isDesktop && 'h-[calc(100dvh-8rem)] min-h-[32rem]',
  );

  if (!partnerId) {
    return <EmptyCenter noThreads={threads.data?.length === 0} frameClass={frame} centerRef={pane.centerRef} />;
  }

  const { thread, partnerName } = pane;
  return (
    <>
      {!isDesktop && (
        <Link to="/messages" className="mb-4 inline-block text-sm text-brand-primary-pressed underline-offset-4 hover:underline">
          ← All messages
        </Link>
      )}
      <section ref={pane.centerRef} tabIndex={-1} aria-label={`Conversation with ${partnerName}`} className={frame}>
        <PaneHeader partnerId={partnerId} pane={pane} />
        <div
          ref={pane.scrollRef}
          role="region"
          aria-label="Messages"
          aria-busy={thread.isPending}
          tabIndex={isDesktop ? 0 : undefined}
          className={cn('bg-surface-warm px-4 py-4', FOCUS_RING, 'focus-visible:ring-inset', isDesktop && 'min-h-0 flex-1 overflow-y-auto')}
        >
          {thread.isPending && <HistorySkeleton />}
          {thread.isError && <p className="text-sm text-feedback-error">We couldn't load this conversation.</p>}
          {thread.data?.length === 0 && (
            <p className="text-center text-sm italic text-ink-muted">No messages yet — say hi.</p>
          )}
          {thread.data && thread.data.length > 0 && <History messages={thread.data} partnerName={partnerName} />}
        </div>
        {pane.isBlocked && (
          <div className="bg-surface-warm px-4 pb-3">
            <BlockedThreadBanner blocked familyName={partnerName} />
          </div>
        )}
        <div className="border-t border-ink-muted/20 bg-surface-card px-4 py-3">
          <MessageComposer key={partnerId} to={partnerId} recipientName={partnerName} onSent={pane.announceSent} />
        </div>
        <p role="status" className="sr-only">{pane.status}</p>
      </section>
    </>
  );
}
