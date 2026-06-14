import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { createAnnouncement, feedKeys, type CreateAnnouncementInput } from '@/api/announcements';
import { ApiError } from '@/api/client';
import { SendIcon } from '@/components/icons';
import type { UploadResult } from '@/api/uploads';
import { ImagePicker } from './ImagePicker';

const ComposeSchema = z.object({
  content: z.string().min(1, 'Add a few words before posting.').max(4000),
});
type ComposeValues = z.infer<typeof ComposeSchema>;

export function AnnouncementComposer() {
  const qc = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [attached, setAttached] = useState<UploadResult | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm<ComposeValues>({
    resolver: zodResolver(ComposeSchema),
    defaultValues: { content: '' },
  });

  const mutation = useMutation({
    mutationFn: (input: CreateAnnouncementInput) => createAnnouncement(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: feedKeys.page });
      reset({ content: '' });
      setAttached(null);
    },
    onError: (err) => {
      setServerError(err instanceof ApiError ? err.message : 'Could not post.');
    },
  });

  return (
    <form
      onSubmit={handleSubmit((data) => {
        setServerError(null);
        const payload: CreateAnnouncementInput = { content: data.content };
        if (attached) {
          payload.mediaUrl = attached.url;
          payload.mediaType = attached.mediaType;
        }
        mutation.mutate(payload);
      })}
      className="rounded-lg bg-surface-card p-4 shadow-lift"
      noValidate
    >
      <label htmlFor="compose-content" className="sr-only">What's going on?</label>
      <textarea
        id="compose-content"
        {...register('content')}
        placeholder="What's going on at home?"
        rows={3}
        className="w-full resize-none bg-transparent text-ink-lead outline-none placeholder:italic placeholder:text-ink-muted"
      />
      {errors.content && <p className="text-feedback-error text-xs">{errors.content.message}</p>}
      {serverError && <p role="alert" className="text-feedback-error text-xs">{serverError}</p>}
      <div className="mt-3 flex items-center justify-between gap-3">
        <ImagePicker attached={attached} onAttached={setAttached} />
        <button
          type="submit"
          disabled={isSubmitting || mutation.isPending}
          className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white shadow-lift disabled:opacity-60"
        >
          <SendIcon className="h-4 w-4" />
          {isSubmitting || mutation.isPending ? 'Posting…' : 'Post'}
        </button>
      </div>
    </form>
  );
}
