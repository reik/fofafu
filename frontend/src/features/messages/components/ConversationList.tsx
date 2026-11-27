import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ThreadDTO } from '@/api/messages';
import { Avatar } from '@/components/Avatar';
import { cn } from '@/utils/cn';
import { formatAuthor } from '@/utils/formatAuthor';

const BONE = 'bg-surface-subtle animate-pulse motion-reduce:animate-none';
const SKELETON_ROWS = [0, 1, 2, 3, 4];
const ANNOUNCE_DELAY_MS = 500;
const TEXT_LINK =
  'inline-block min-h-6 rounded-sm text-sm font-semibold text-brand-primary-pressed underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand-primary';

/** `value`, once it has stopped changing for `ms`. */
function useSettledValue<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/**
 * A row's last-active label, short enough to leave the name room in a 240px
 * column (as in the mock): "10:53am" today, "Mon" this week, "Oct 2" this
 * year, "Oct 2, 2025" before that.
 */
function rowTime(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  if (at.toDateString() === now.toDateString()) {
    return at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(' ', '');
  }
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (startOfToday - at.getTime() < 6 * 86_400_000) return at.toLocaleDateString('en-US', { weekday: 'short' });
  const monthDay = at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return at.getFullYear() === now.getFullYear() ? monthDay : `${monthDay}, ${at.getFullYear()}`;
}

function noMatchLine(query: string): string {
  return `No conversations match “${query}”.`;
}

/** What the status says after filtering: nothing while the box is empty. */
function filterResultLine(query: string, count: number): string {
  if (query === '') return '';
  if (count === 0) return noMatchLine(query);
  return count === 1 ? '1 conversation' : `${count} conversations`;
}

function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <div className={cn(BONE, 'h-10 w-10 shrink-0 rounded-full')} />
      <div className="flex-1 space-y-2">
        <div className={cn(BONE, 'h-3 w-3/4 rounded-sm')} />
        <div className={cn(BONE, 'h-2.5 w-1/2 rounded-sm')} />
      </div>
    </div>
  );
}

function ConversationRow({ thread, selected }: { thread: ThreadDTO; selected: boolean }) {
  const unread = thread.unreadCount > 0;
  return (
    <li>
      <Link
        to={`/messages/${thread.partnerId}`}
        aria-current={selected ? 'page' : undefined}
        className={cn(
          'flex items-center gap-3 rounded border-l-4 border-transparent px-3 py-2 outline-none hover:bg-surface-warm',
          'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-primary',
          selected && 'border-brand-primary-pressed bg-surface-subtle hover:bg-surface-subtle',
        )}
      >
        <Avatar name={thread.partnerName} />
        <span className="min-w-0 flex-1">
          {/* The name gets the full width and up to two lines; the time or
              badge sits beside the one-line preview instead of squeezing it. */}
          <span
            className={cn(
              'line-clamp-2 break-words text-base font-semibold leading-snug',
              !thread.partnerName && 'italic text-ink-muted',
            )}
          >
            {formatAuthor(thread.partnerName)}
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className={cn('min-w-0 flex-1 truncate text-sm', unread ? 'text-ink-lead' : 'text-ink-muted')}>
              {thread.lastMessage}
            </span>
            {unread ? (
              <span aria-hidden="true" className="shrink-0 rounded-full bg-brand-primary-pressed px-2 py-0.5 text-xs font-semibold text-white">
                {thread.unreadCount}
              </span>
            ) : (
              <time dateTime={thread.lastAt} className="shrink-0 text-xs text-ink-muted">{rowTime(thread.lastAt)}</time>
            )}
          </span>
          {unread && <span className="sr-only">{`${thread.unreadCount} unread`}</span>}
        </span>
      </Link>
    </li>
  );
}

interface ConversationListProps {
  threads: UseQueryResult<ThreadDTO[]>;
  /** The open conversation's partner id, if any. */
  selectedId?: string | undefined;
  /** md and wider: fill the column's height and scroll the rows inside it. */
  fillHeight: boolean;
}

/** The left column: every conversation, a name filter, and "+ New message". */
export function ConversationList({ threads, selectedId, fillHeight }: ConversationListProps) {
  const headingId = useId();
  const inputId = useId();
  const [query, setQuery] = useState('');
  const trimmed = query.trim();
  const rows = (threads.data ?? []).filter((t) =>
    formatAuthor(t.partnerName).toLowerCase().includes(trimmed.toLowerCase()),
  );
  const announcement = useSettledValue(threads.data ? filterResultLine(trimmed, rows.length) : '', ANNOUNCE_DELAY_MS);

  return (
    <nav
      aria-labelledby={headingId}
      className={cn('flex flex-col rounded-lg bg-surface-card p-4 shadow-lift', fillHeight && 'h-[calc(100dvh-8rem)] min-h-[32rem]')}
    >
      <h2 id={headingId} className="text-xs font-bold uppercase tracking-wide text-ink-muted">Conversations</h2>
      <label htmlFor={inputId} className="sr-only">Search conversations</label>
      <input
        id={inputId}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search conversations…"
        className="mt-3 w-full rounded-full border border-ink-muted/70 bg-surface-card px-4 py-2 text-sm outline-none placeholder:text-ink-muted focus-visible:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary"
      />
      <p role="status" className="sr-only">{announcement}</p>
      <div aria-busy={threads.isPending} className={cn('mt-3', fillHeight && 'min-h-0 flex-1 overflow-y-auto')}>
        {threads.isPending && (
          <>
            <p className="sr-only">Loading conversations…</p>
            <div aria-hidden="true" className="space-y-1">
              {SKELETON_ROWS.map((row) => <RowSkeleton key={row} />)}
            </div>
          </>
        )}
        {threads.isError && (
          <p className="text-sm text-feedback-error">
            We couldn't load your conversations.{' '}
            <button type="button" onClick={() => threads.refetch()} className={TEXT_LINK}>Try again</button>
          </p>
        )}
        {threads.data?.length === 0 && <p className="text-sm italic text-ink-muted">No conversations yet.</p>}
        {threads.data && threads.data.length > 0 && rows.length === 0 && (
          <p className="text-sm italic text-ink-muted">{noMatchLine(trimmed)}</p>
        )}
        {rows.length > 0 && (
          <ul role="list" className="space-y-1">
            {rows.map((t) => <ConversationRow key={t.partnerId} thread={t} selected={t.partnerId === selectedId} />)}
          </ul>
        )}
      </div>
      <div className="mt-3 border-t border-ink-muted/20 pt-3">
        <Link to="/search" className={TEXT_LINK}>
          <span aria-hidden="true">+ </span>New message
        </Link>
      </div>
    </nav>
  );
}
