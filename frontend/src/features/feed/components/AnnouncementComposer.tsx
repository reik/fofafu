import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { createAnnouncement, feedKeys } from '@/api/announcements';
import { ApiError } from '@/api/client';

const ComposeSchema = z.object({
  content: z.string().min(1, 'Add a few words before posting.').max(4000),
});
type ComposeValues = z.infer<typeof ComposeSchema>;

export function AnnouncementComposer() {
  const qc = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm<ComposeValues>({
    resolver: zodResolver(ComposeSchema),
    defaultValues: { content: '' },
  });

  const mutation = useMutation({
    mutationFn: createAnnouncement,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: feedKeys.page });
      reset({ content: '' });
    },
    onError: (err) => {
      setServerError(err instanceof ApiError ? err.message : 'Could not post.');
    },
  });

  return (
    <form
      onSubmit={handleSubmit((data) => { setServerError(null); mutation.mutate(data); })}
      className="rounded-lg bg-surface-card p-4 shadow-lift"
      noValidate
    >
      <label htmlFor="compose-content" className="sr-only">What's going on?</label>
      <textarea
        id="compose-content"
        {...register('content')}
        placeholder="What's going on at home?"
        rows={3}
        className="w-full resize-none bg-transparent text-ink-lead outline-none placeholder:text-ink-muted"
      />
      {errors.content && <p className="text-feedback-error text-xs">{errors.content.message}</p>}
      {serverError && <p role="alert" className="text-feedback-error text-xs">{serverError}</p>}
      <div className="mt-3 flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting || mutation.isPending}
          className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white shadow-lift disabled:opacity-60"
        >
          {isSubmitting || mutation.isPending ? 'Posting…' : 'Post'}
        </button>
      </div>
    </form>
  );
}
