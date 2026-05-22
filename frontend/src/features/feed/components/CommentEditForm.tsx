import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { patchComment, feedKeys, type CommentDTO } from '@/api/announcements';
import { ApiError } from '@/api/client';

const Schema = z.object({
  content: z.string().min(1, 'Cannot be empty.').max(2000),
});
type Values = z.infer<typeof Schema>;

interface Props {
  comment: CommentDTO;
  onDone: (updated?: CommentDTO) => void;
}

export function CommentEditForm({ comment, onDone }: Props) {
  const qc = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(Schema),
    defaultValues: { content: comment.content },
  });

  const mutation = useMutation({
    mutationFn: (input: { content: string }) => patchComment(comment.id, input),
    onSuccess: (next) => {
      qc.invalidateQueries({ queryKey: feedKeys.comments(comment.announcementId) });
      onDone(next);
    },
    onError: (err) => {
      setServerError(err instanceof ApiError ? err.message : 'Could not save.');
    },
  });

  return (
    <form
      onSubmit={handleSubmit((data) => { setServerError(null); mutation.mutate(data); })}
      className="space-y-2"
      noValidate
    >
      <label htmlFor={`comment-edit-${comment.id}`} className="sr-only">Edit comment</label>
      <textarea
        id={`comment-edit-${comment.id}`}
        {...register('content')}
        rows={3}
        className="w-full rounded bg-surface-card px-3 py-2 outline-none border border-ink-muted/20 focus:border-brand-primary"
      />
      {errors.content && <p className="text-feedback-error text-xs">{errors.content.message}</p>}
      {serverError && <p role="alert" className="text-feedback-error text-xs">{serverError}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isSubmitting || mutation.isPending}
          className="rounded-full bg-brand-primary px-4 py-1.5 text-sm font-semibold text-white shadow-lift disabled:opacity-60"
        >
          {isSubmitting || mutation.isPending ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => onDone()}
          className="rounded-full border border-ink-muted/30 px-3 py-1 text-xs font-medium"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
