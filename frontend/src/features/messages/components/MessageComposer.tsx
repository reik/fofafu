import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { sendMessage, messageKeys } from '@/api/messages';
import { communityKeys } from '@/api/community';
import { EdgeApiError } from '@/api/edgeClient';
import { SendIcon } from '@/components/icons';
import { cn } from '@/utils/cn';

const Schema = z.object({
  content: z.string().min(1, 'Type a message.').max(4000),
});
type Values = z.infer<typeof Schema>;

interface MessageComposerProps {
  to: string;
  /** Names the field "Message to {recipientName}" so it's clear who a reply goes to. */
  recipientName?: string;
  /** Called after the server accepts the message. */
  onSent?: () => void;
}

export function MessageComposer({ to, recipientName, onSent }: MessageComposerProps) {
  const qc = useQueryClient();
  const fieldId = useId();
  const errorId = useId();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm<Values>({
    resolver: zodResolver(Schema),
    defaultValues: { content: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: Values) => sendMessage({ to, content: values.content }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: messageKeys.thread(to) });
      qc.invalidateQueries({ queryKey: messageKeys.threads });
      // The first message makes this family a thread partner, which
      // community/suggested excludes.
      qc.invalidateQueries({ queryKey: communityKeys.suggested });
      reset({ content: '' });
      onSent?.();
    },
    onError: (err) => {
      setServerError(err instanceof EdgeApiError ? err.message : 'Could not send.');
    },
  });

  const sending = isSubmitting || mutation.isPending;
  const fieldError = errors.content?.message;

  return (
    <form
      onSubmit={handleSubmit((data) => { setServerError(null); mutation.mutate(data); })}
      className="space-y-1"
      noValidate
    >
      <label htmlFor={fieldId} className="sr-only">
        {recipientName ? `Message to ${recipientName}` : 'Message'}
      </label>
      <div className="flex items-end gap-2">
        <textarea
          id={fieldId}
          {...register('content')}
          placeholder="Write a message…"
          rows={1}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? errorId : undefined}
          className={cn(
            'min-h-11 max-h-40 flex-1 resize-none rounded-lg border border-ink-muted/70 bg-surface-card px-4 py-2.5 text-sm',
            'outline-none [field-sizing:content] placeholder:text-ink-muted',
            'focus-visible:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary',
          )}
        />
        <button
          type="submit"
          disabled={sending}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-brand-primary-pressed px-4 py-1.5 text-sm font-semibold text-white shadow-lift outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 disabled:opacity-60"
        >
          <SendIcon className="h-4 w-4" />
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
      {fieldError && <p id={errorId} className="text-feedback-error text-xs">{fieldError}</p>}
      {serverError && <p role="alert" className="text-feedback-error text-xs">{serverError}</p>}
    </form>
  );
}
