import type { MessageDTO } from '@/api/messages';
import { cn } from '@/utils/cn';
import { formatTimestamp } from '@/utils/formatTimestamp';

interface Props {
  message: MessageDTO;
}

export function MessageBubble({ message }: Props) {
  return (
    <div className={cn('flex', message.mine ? 'justify-end' : 'justify-start')}>
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
    </div>
  );
}
