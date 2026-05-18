import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { patchAnnouncement, feedKeys, type AnnouncementDTO, type PatchAnnouncementInput } from '@/api/announcements';
import { ApiError } from '@/api/client';
import type { UploadResult } from '@/api/uploads';
import { ImagePicker } from './ImagePicker';

const Schema = z.object({
  content: z.string().min(1, 'Cannot be empty.').max(4000),
});
type Values = z.infer<typeof Schema>;

interface Props {
  announcement: AnnouncementDTO;
  onDone: () => void;
}

export function AnnouncementEditForm({ announcement, onDone }: Props) {
  const qc = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [attached, setAttached] = useState<UploadResult | null>(
    announcement.mediaUrl && announcement.mediaType === 'image'
      ? { url: announcement.mediaUrl, mediaType: 'image' }
      : null,
  );
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(Schema),
    defaultValues: { content: announcement.content },
  });

  const mutation = useMutation({
    mutationFn: (input: PatchAnnouncementInput) => patchAnnouncement(announcement.id, input),
    onSuccess: (next) => {
      qc.setQueryData<AnnouncementDTO>(feedKeys.byId(announcement.id), next);
      qc.invalidateQueries({ queryKey: feedKeys.page });
      onDone();
    },
    onError: (err) => {
      setServerError(err instanceof ApiError ? err.message : 'Could not save.');
    },
  });

  return (
    <form
      onSubmit={handleSubmit((data) => {
        setServerError(null);
        const patch: PatchAnnouncementInput = { content: data.content };
        // Detect media changes.
        if (attached) {
          if (attached.url !== announcement.mediaUrl) {
            patch.mediaUrl = attached.url;
            patch.mediaType = attached.mediaType;
          }
        } else if (announcement.mediaUrl) {
          patch.mediaUrl = null;
          patch.mediaType = null;
        }
        mutation.mutate(patch);
      })}
      className="space-y-3"
      noValidate
    >
      <textarea
        {...register('content')}
        rows={3}
        className="w-full rounded bg-surface-card px-3 py-2 outline-none border border-ink-muted/20 focus:border-brand-primary"
      />
      {errors.content && <p className="text-feedback-error text-xs">{errors.content.message}</p>}
      {serverError && <p role="alert" className="text-feedback-error text-xs">{serverError}</p>}
      <ImagePicker attached={attached} onAttached={setAttached} />
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
          onClick={onDone}
          className="rounded-full border border-ink-muted/30 px-3 py-1 text-xs font-medium"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
