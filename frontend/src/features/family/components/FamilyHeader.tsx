import type { FamilyDTO } from '@/api/family';

interface Props {
  family: FamilyDTO;
  onEdit?: (() => void) | undefined;
}

export function FamilyHeader({ family, onEdit }: Props) {
  return (
    <header className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {family.isOwner ? 'Your family page' : `The ${family.name} family`}
          </h1>
          {family.isOwner && (
            <p className="text-ink-muted mt-1 text-sm">{family.name}</p>
          )}
        </div>
        {onEdit && family.isOwner && (
          <button
            type="button"
            onClick={onEdit}
            className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white shadow-lift"
          >
            Edit page
          </button>
        )}
      </div>

      <div className="rounded-lg bg-surface-card p-5 shadow-lift">
        {family.bio
          ? <p className="whitespace-pre-line text-ink-lead">{family.bio}</p>
          : <p className="text-ink-muted italic">Tell us about your family — what brought you to fostering?</p>}
      </div>

      {family.isOwner && family.kidCount !== null && (
        <span
          aria-label={`${family.kidCount} children in placement`}
          className="inline-flex items-center gap-2 rounded-full bg-surface-card px-3 py-1 text-sm shadow-lift"
        >
          <span className="font-mono text-xs uppercase tracking-wide text-ink-muted">kids in placement</span>
          <span className="font-semibold">{family.kidCount}</span>
        </span>
      )}
    </header>
  );
}
