import type { MessageDTO } from '@/api/messages';
import { cn } from '@/utils/cn';
import { formatAuthor } from '@/utils/formatAuthor';
import { formatTimestamp } from '@/utils/formatTimestamp';
import { ModerationMenu } from '@/features/moderation/components/ModerationMenu';

interface MessageBubbleProps {
  message: MessageDTO;
  /** Spoken before a received message. Falls back to the message's own sender name. */
  senderName?: string;
  /**
   * Show the time under the text. A conversation that groups messages under
   * its own time dividers passes false; the time then stays for screen
   * readers only.
   */
  showTime?: boolean;
}

export function MessageBubble({ message, senderName, showTime = true }: MessageBubbleProps) {
  const sender = message.mine ? 'You' : (senderName ?? formatAuthor(message.fromName));

  return (
    <div className={cn('group flex items-start gap-1', message.mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-lg px-4 py-3 text-sm shadow-lift',
          message.mine ? 'bg-brand-primary-pressed text-white' : 'bg-surface-card text-ink-lead',
        )}
      >
        <p className="whitespace-pre-line">
          {/* The side and colour show who wrote it; this says it in words. */}
          <span className="sr-only">{sender}: </span>
          <span>{message.content}</span>
        </p>
        <time
          dateTime={message.createdAt}
          className={cn(
            showTime ? 'mt-1 block font-mono text-[10px] tracking-wide' : 'sr-only',
            message.mine ? 'text-white' : 'text-ink-muted',
          )}
        >
          {formatTimestamp(message.createdAt)}
        </time>
      </div>
      {/* MessageBubble has no other action row today, so this is the first
          affordance on it, not a reuse of an existing one — ### Visual §1.1.
          Hover/focus-revealed (opacity only, never display:none) so a long
          thread doesn't show a kebab on every bubble at rest, while staying
          keyboard-reachable per the a11y-auditor handoff note. Report only —
          Block isn't specced for DMs, so `onBlocked` is intentionally unused. */}
      {!message.mine && (
        <div className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <ModerationMenu
            targetType="message"
            targetId={message.id}
            authorId={message.from}
            authorName={message.fromName}
          />
        </div>
      )}
    </div>
  );
}
