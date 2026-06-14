import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { uploadImage, type UploadResult } from '@/api/uploads';
import { ImagePlusIcon, XIcon } from '@/components/icons';

interface Props {
  attached: UploadResult | null;
  onAttached: (result: UploadResult | null) => void;
}

export function ImagePicker({ attached, onAttached }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: uploadImage,
    onSuccess: (result) => {
      setError(null);
      onAttached(result);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Could not upload.');
    },
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (file) mutation.mutate(file);
    // Reset so picking the same file twice still fires onChange.
    e.target.value = '';
  }

  if (attached) {
    return (
      <div className="flex items-center gap-3">
        <img
          src={attached.url}
          alt=""
          className="h-16 w-16 rounded object-cover shadow-lift"
        />
        <button
          type="button"
          onClick={() => onAttached(null)}
          className="inline-flex items-center gap-1.5 rounded-full border border-feedback-error/30 px-3 py-1.5 text-xs font-medium text-feedback-error hover:bg-feedback-error/10"
        >
          <XIcon className="h-3.5 w-3.5" />
          Remove image
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleChange}
        className="hidden"
        aria-label="Upload image"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={mutation.isPending}
        className="inline-flex items-center gap-1.5 rounded-full border border-ink-muted/30 px-3 py-1.5 text-xs font-medium text-ink-lead hover:bg-surface-warm disabled:opacity-60"
      >
        <ImagePlusIcon className="h-4 w-4 text-brand-primary" />
        {mutation.isPending ? 'Uploading…' : 'Add image'}
      </button>
      {error && <span role="alert" className="text-xs text-feedback-error">{error}</span>}
    </div>
  );
}
