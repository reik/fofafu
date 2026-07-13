import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { sendMessage, messageKeys } from '@/api/messages';
import { EdgeApiError } from '@/api/edgeClient';
import { SendIcon } from '@/components/icons';

const Schema = z.object({
  content: z.string().min(1, 'Type a message.').max(4000),
});
type Values = z.infer<typeof Schema>;

interface Props {
  to: string;
}

export function MessageComposer({ to }: Props) {
  const qc = useQueryClient();
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
      reset({ content: '' });
    },
    onError: (err) => {
      setServerError(err instanceof EdgeApiError ? err.message : 'Could not send.');
    },
  });

  return (
    <form
      onSubmit={handleSubmit((data) => { setServerError(null); mutation.mutate(data); })}
      className="space-y-2"
      noValidate
    >
      <label htmlFor="message-content" className="sr-only">Message</label>
      <textarea
        id="message-content"
        {...register('content')}
        placeholder="Write a message…"
        rows={2}
        className="w-full rounded bg-surface-card px-3 py-2 outline-none border border-ink-muted/20 focus:border-brand-primary"
      />
      {errors.content && <p className="text-feedback-error text-xs">{errors.content.message}</p>}
      {serverError && <p role="alert" className="text-feedback-error text-xs">{serverError}</p>}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting || mutation.isPending}
          className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary-pressed px-4 py-1.5 text-sm font-semibold text-white shadow-lift disabled:opacity-60"
        >
          <SendIcon className="h-4 w-4" />
          {isSubmitting || mutation.isPending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </form>
  );
}
