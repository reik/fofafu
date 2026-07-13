import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { createComment, feedKeys } from '@/api/announcements';
import { EdgeApiError } from '@/api/edgeClient';
import { MessageIcon } from '@/components/icons';

const Schema = z.object({
  content: z.string().min(1, 'Type a comment.').max(2000),
});
type Values = z.infer<typeof Schema>;

interface Props {
  announcementId: string;
}

export function CommentForm({ announcementId }: Props) {
  const qc = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm<Values>({
    resolver: zodResolver(Schema),
    defaultValues: { content: '' },
  });

  const mutation = useMutation({
    mutationFn: (input: { content: string }) => createComment(announcementId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: feedKeys.comments(announcementId) });
      reset({ content: '' });
    },
    onError: (err) => {
      setServerError(err instanceof EdgeApiError ? err.message : 'Could not post.');
    },
  });

  return (
    <form
      onSubmit={handleSubmit((data) => { setServerError(null); mutation.mutate(data); })}
      className="space-y-2"
      noValidate
    >
      <label htmlFor="comment-content" className="sr-only">Add a comment</label>
      <textarea
        id="comment-content"
        {...register('content')}
        placeholder="Say something kind…"
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
          <MessageIcon className="h-4 w-4" />
          {isSubmitting || mutation.isPending ? 'Posting…' : 'Comment'}
        </button>
      </div>
    </form>
  );
}
