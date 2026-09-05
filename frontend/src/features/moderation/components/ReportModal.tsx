import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  REPORT_CATEGORIES,
  REPORT_NOTE_MAX_LENGTH,
  createReport,
  type ReportCategory,
  type ReportTargetType,
} from '@/api/moderation';
import { EdgeApiError } from '@/api/edgeClient';
import { ShieldIcon, XIcon } from '@/components/icons';
import { cn } from '@/utils/cn';
import { contentTypeLabel } from '../contentType';

// fofafu_vault/features/moderation-report-block.md ### Microcopy — category
// taxonomy table. Labels are ux-writer's exact strings; stored values are
// backend-dev's REPORT_CATEGORIES (supabase/functions/moderation/index.ts).
const REPORT_CATEGORY_LABELS: Record<ReportCategory, string> = {
  unkind: 'Unkind or judgmental',
  privacy: 'Shares private details',
  unrelated: "Doesn't belong here",
  other: 'Something else',
};

const FormSchema = z.object({
  category: z.enum(REPORT_CATEGORIES, { required_error: 'Choose a category to continue.' }),
  note: z.string().max(REPORT_NOTE_MAX_LENGTH, 'Keep it under 1000 characters.').optional(),
});
type FormValues = z.infer<typeof FormSchema>;

export interface ReportModalProps {
  targetType: ReportTargetType;
  targetId: string;
  onClose: () => void;
}

/**
 * Reuses the dialog shell established by `RequestPlaydateModal`
 * (frontend/src/pages/FamilyView.tsx) — role="dialog"/aria-modal, the same
 * overlay + card treatment, and the same sent-state content swap — per
 * fofafu_vault/features/moderation-report-block.md ### Visual §1.2/decision 3.
 */
export function ReportModal({ targetType, targetId, onClose }: ReportModalProps) {
  const [apiError, setApiError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const contentType = contentTypeLabel(targetType);
  const title = `Report this ${contentType}`;
  const noteFieldId = `report-note-${targetId}`;
  const submitHintId = `report-submit-hint-${targetId}`;

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { note: '' },
  });
  const selectedCategory = watch('category');

  // Focus moves into the dialog on mount; Escape closes and a minimal focus
  // trap keeps Tab cycling inside — flagged as a "from the start" requirement
  // in ### Visual §3 (RequestPlaydateModal, the shell this reuses, doesn't
  // yet implement either).
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const onSubmit = async (values: FormValues) => {
    setApiError(null);
    try {
      const note = values.note?.trim();
      await createReport({ targetType, targetId, category: values.category, note: note || undefined });
      setSent(true);
    } catch (err) {
      setApiError(err instanceof EdgeApiError ? err.message : "We couldn't send that. Try again?");
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-lead/40" onClick={onClose} aria-hidden="true" />
      <div ref={dialogRef} className="relative z-10 w-full max-w-md rounded-lg bg-surface-card shadow-lift p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink-lead">{title}</h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink-muted hover:text-ink-lead"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {sent ? (
          <div className="py-4 text-center">
            <p className="font-semibold text-feedback-success">Report sent — our team will take a look.</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 rounded-full bg-brand-primary-pressed px-5 py-2 text-sm font-semibold text-white shadow-lift"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <fieldset>
              <legend className="mb-2 block text-[0.85rem] font-semibold text-ink-lead">What&apos;s the issue?</legend>
              <div className="flex flex-wrap gap-2">
                {REPORT_CATEGORIES.map((key) => {
                  const inputId = `report-category-${targetId}-${key}`;
                  const active = selectedCategory === key;
                  return (
                    <label
                      key={key}
                      htmlFor={inputId}
                      className={cn(
                        'cursor-pointer rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                        'focus-within:ring-2 focus-within:ring-brand-primary focus-within:ring-offset-1',
                        active
                          ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                          : 'border-ink-muted/20 text-ink-lead hover:bg-surface-warm',
                      )}
                    >
                      <input id={inputId} type="radio" value={key} className="sr-only" {...register('category')} />
                      {REPORT_CATEGORY_LABELS[key]}
                    </label>
                  );
                })}
              </div>
              {errors.category && (
                <p role="alert" className="mt-1 text-xs text-feedback-error">{errors.category.message}</p>
              )}
            </fieldset>

            <div>
              <label htmlFor={noteFieldId} className="mb-1 block text-[0.85rem] font-semibold text-ink-lead">
                Add a note <span className="font-normal text-ink-muted">(optional)</span>
              </label>
              <textarea
                id={noteFieldId}
                {...register('note')}
                placeholder="Anything that would help us understand what happened."
                rows={3}
                maxLength={REPORT_NOTE_MAX_LENGTH}
                className="w-full resize-none rounded border border-[#EDE3D4] bg-surface-card px-3 py-2 text-[0.92rem] text-ink-lead outline-none focus:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary"
              />
              {errors.note && <p role="alert" className="mt-1 text-xs text-feedback-error">{errors.note.message}</p>}
            </div>

            <p className="flex items-start gap-1.5 text-xs text-ink-muted">
              <ShieldIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Reports go to our team, not to the other family — we review every one.
            </p>

            {apiError && <p role="alert" className="text-sm text-feedback-error">{apiError}</p>}
            <span id={submitHintId} className="sr-only">Choose a category above to send your report.</span>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full px-4 py-2 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-subtle"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !selectedCategory}
                aria-describedby={submitHintId}
                className="rounded-full bg-brand-primary-pressed px-4 py-2 text-sm font-semibold text-white shadow-lift transition-colors disabled:opacity-60"
              >
                {isSubmitting ? 'Sending...' : 'Send report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
