import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getThread, markThreadRead, messageKeys, type MessageDTO, type ThreadDTO } from '@/api/messages';
import { familyKeys, familyLocation, getFamily } from '@/api/family';
import { useIsFamilyBlocked } from '@/features/moderation/hooks/useBlock';
import { formatAuthor } from '@/utils/formatAuthor';

interface Seen {
  partnerId: string | undefined;
  messages: MessageDTO[] | undefined;
}

function arrivalLine(count: number, name: string): string {
  return count === 1 ? `New message from ${name}` : `${count} new messages from ${name}`;
}

/**
 * The one polite status line for the open conversation (Accessibility reqs
 * 23–24): inbound messages that arrive after it has loaded, and "Message
 * sent". Silent on first load and on a switch to another conversation; never
 * reads a message body. Derived while rendering by comparing against the
 * last message list seen for this partner.
 */
function useConversationStatus(partnerId: string | undefined, messages: MessageDTO[] | undefined, name: string) {
  const [status, setStatus] = useState('');
  const [seen, setSeen] = useState<Seen>({ partnerId, messages });

  if (seen.partnerId !== partnerId) {
    setSeen({ partnerId, messages });
    setStatus('');
  } else if (seen.messages !== messages) {
    const before = new Set(seen.messages?.map((m) => m.id));
    const arrived = seen.messages && messages ? messages.filter((m) => !m.mine && !before.has(m.id)).length : 0;
    setSeen({ partnerId, messages });
    if (arrived > 0) setStatus(arrivalLine(arrived, name));
  }

  return { status, announceSent: () => setStatus('Message sent') };
}

/**
 * Moves focus to the centre column when the selected conversation changes,
 * never on first mount (a deep link or page load keeps the browser default).
 * Layout's route-focus hook stands aside for these switches at md and wider.
 */
function useFocusOnSelectionChange(partnerId: string | undefined, enabled: boolean) {
  const centerRef = useRef<HTMLElement>(null);
  const previous = useRef(partnerId);

  useEffect(() => {
    if (previous.current === partnerId) return;
    previous.current = partnerId;
    if (enabled) centerRef.current?.focus();
  }, [partnerId, enabled]);

  return centerRef;
}

/**
 * Keeps the history scrolled to the newest message: on open and whenever the
 * count changes. Done by scrolling, not `flex-col-reverse`, so reading and
 * Tab order stay oldest-first (Accessibility req 9). Instant, never smooth.
 */
function usePinnedToNewest(partnerId: string | undefined, count: number) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [partnerId, count]);
  return scrollRef;
}

interface UseConversationPaneArgs {
  partnerId: string | undefined;
  threads: ThreadDTO[] | undefined;
  focusOnChange: boolean;
}

/** Marks the open conversation read whenever it holds unread inbound messages. */
function useMarkReadOnOpen(partnerId: string | undefined, messages: MessageDTO[] | undefined) {
  const qc = useQueryClient();
  const { mutate: markRead } = useMutation({
    mutationFn: (id: string) => markThreadRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: messageKeys.threads });
      qc.invalidateQueries({ queryKey: messageKeys.unread });
    },
  });
  const hasUnread = !!messages?.some((m) => !m.mine && !m.read);
  useEffect(() => {
    if (partnerId && hasUnread) markRead(partnerId);
  }, [partnerId, hasUnread, markRead]);
}

export function useConversationPane({ partnerId, threads, focusOnChange }: UseConversationPaneArgs) {
  const thread = useQuery({
    queryKey: messageKeys.thread(partnerId ?? ''),
    queryFn: () => getThread(partnerId ?? ''),
    enabled: !!partnerId,
  });
  // `family/:id` resolves an owner's user id as well as a families.id. Its
  // canonical id is what block rows are keyed on.
  const family = useQuery({
    queryKey: familyKeys.byId(partnerId ?? ''),
    queryFn: () => getFamily(partnerId ?? ''),
    enabled: !!partnerId,
  });
  const isBlocked = useIsFamilyBlocked(family.data?.id);
  useMarkReadOnOpen(partnerId, thread.data);

  // Name order: the thread list, then the family page, then the messages.
  const threadEntry = threads?.find((t) => t.partnerId === partnerId);
  const nameFromMessages = thread.data?.find((m) => !m.mine)?.fromName;
  const partnerName = formatAuthor(threadEntry?.partnerName ?? family.data?.name ?? nameFromMessages);

  const { status, announceSent } = useConversationStatus(partnerId, thread.data, partnerName);
  const centerRef = useFocusOnSelectionChange(partnerId, focusOnChange);
  const scrollRef = usePinnedToNewest(partnerId, thread.data?.length ?? 0);

  return {
    centerRef,
    scrollRef,
    thread,
    partnerName,
    /** Whether a name is known yet: the header shows bones until it is. */
    partnerKnown: !!threadEntry || family.isSuccess || family.isError,
    partnerLinked: !!(threadEntry?.partnerName ?? family.data),
    location: family.data ? familyLocation(family.data) : null,
    avatarUrl: family.data?.avatarUrl ?? null,
    isBlocked,
    status,
    announceSent,
  };
}
