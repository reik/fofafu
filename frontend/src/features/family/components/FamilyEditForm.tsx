import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { patchFamily, familyKeys, type FamilyDTO, type FamilyPatchInput } from '@/api/family';
import { EdgeApiError } from '@/api/edgeClient';
import { CheckIcon, XIcon } from '@/components/icons';
import type { UploadResult } from '@/api/uploads';
import { ImagePicker } from '@/features/feed/components/ImagePicker';

const FormSchema = z.object({
  name: z.string().min(1, 'Tell us a name.').max(80),
  bio: z.string().max(2000, 'Keep it under 2000 characters.'),
  kidCount: z.string().refine(
    (v) => v === '' || (/^\d+$/.test(v) && Number(v) >= 0 && Number(v) <= 20),
    { message: 'A whole number 0–20, or leave blank.' },
  ),
});
type FormValues = z.infer<typeof FormSchema>;

interface Props {
  family: FamilyDTO;
  onCancel: () => void;
  onSaved: () => void;
}

export function FamilyEditForm({ family, onCancel, onSaved }: Props) {
  const qc = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<UploadResult | null>(
    family.avatarUrl ? { url: family.avatarUrl, mediaType: 'image' } : null,
  );
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: family.name,
      bio: family.bio,
      kidCount: family.kidCount === null ? '' : String(family.kidCount),
    },
  });

  const mutation = useMutation({
    mutationFn: patchFamily,
    onSuccess: (next) => {
      qc.setQueryData(familyKeys.me, next);
      qc.invalidateQueries({ queryKey: familyKeys.byId(next.id) });
      onSaved();
    },
    onError: (err) => {
      setServerError(err instanceof EdgeApiError ? err.message : 'Something went wrong.');
    },
  });

  return (
    <form
      onSubmit={handleSubmit((data) => {
        setServerError(null);
        const patch: FamilyPatchInput = {
          name: data.name,
          bio: data.bio,
          kidCount: data.kidCount === '' ? null : Number(data.kidCount),
        };
        // Send avatarUrl only when it changed (set / replaced / removed).
        const currentUrl = family.avatarUrl ?? null;
        const nextUrl = avatar?.url ?? null;
        if (nextUrl !== currentUrl) patch.avatarUrl = nextUrl;
        mutation.mutate(patch);
      })}
      className="space-y-4"
      noValidate
    >
      <div className="space-y-1">
        <span className="block text-sm font-medium">Family avatar (optional)</span>
        <ImagePicker attached={avatar} onAttached={setAvatar} />
      </div>

      <div className="space-y-1">
        <label htmlFor="family-name" className="block text-sm font-medium">Family name</label>
        <input id="family-name" {...register('name')} className={inputCls} />
        {errors.name && <p className="text-feedback-error text-xs">{errors.name.message}</p>}
      </div>
      <div className="space-y-1">
        <label htmlFor="family-bio" className="block text-sm font-medium">Bio</label>
        <textarea id="family-bio" rows={5} {...register('bio')} className={inputCls} />
        {errors.bio && <p className="text-feedback-error text-xs">{errors.bio.message}</p>}
      </div>
      <div className="space-y-1">
        <label htmlFor="family-kidcount" className="block text-sm font-medium">Kids in placement (optional)</label>
        <input id="family-kidcount" inputMode="numeric" {...register('kidCount')} className={inputCls} />
        {errors.kidCount && <p className="text-feedback-error text-xs">{errors.kidCount.message}</p>}
      </div>

      {serverError && <p role="alert" className="text-feedback-error text-sm">{serverError}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isSubmitting || mutation.isPending}
          className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary-pressed px-5 py-2.5 font-semibold text-white shadow-lift disabled:opacity-60"
        >
          <CheckIcon className="h-4 w-4" />
          {isSubmitting || mutation.isPending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} className="inline-flex items-center gap-1.5 rounded-full border border-ink-muted/30 px-4 py-2 text-sm font-medium">
          <XIcon className="h-4 w-4" />
          Cancel
        </button>
      </div>
    </form>
  );
}

const inputCls = 'w-full rounded bg-surface-card px-3 py-2 outline-none border border-ink-muted/20 focus:border-brand-primary';
