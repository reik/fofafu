import type { MessageDTO } from '@/api/messages';
import { cn } from '@/utils/cn';
import { formatTimestamp } from '@/utils/formatTimestamp';
import { ModerationMenu } from '@/features/moderation/components/ModerationMenu';

interface Props {
  message: MessageDTO;
}

export function MessageBubble({ message }: Props) {
  return (
    <div className={cn('group flex items-start gap-1', message.mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-lg px-3 py-2 shadow-lift',
          message.mine ? 'bg-brand-primary/10 text-ink-lead' : 'bg-surface-card',
        )}
      >
        <p className="whitespace-pre-line text-sm">{message.content}</p>
        <time className="mt-1 block text-[10px] font-mono tracking-wide text-ink-muted">
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
