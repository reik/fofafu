import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { cn } from '@/utils/cn';
import { addSlot, updateSlot, deleteSlot } from '@/api/playdates';
import { ApiError } from '@/api/client';
import { AddSlotInputSchema } from '@/types/playdates';
import type { AvailabilitySlot, AddSlotInput } from '@/types/playdates';
import { TimePicker } from './TimePicker';
import { isoDate } from './WeekCalendar';

interface SlotFormProps {
  initialDate?: string | undefined;
  existing?: AvailabilitySlot | undefined;
  onSaved: () => void;
  onCancel: () => void;
  onDeleted?: (() => void) | undefined;
}

export function SlotForm({ initialDate, existing, onSaved, onCancel, onDeleted }: SlotFormProps) {
  const [apiError, setApiError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AddSlotInput>({
    resolver: zodResolver(AddSlotInputSchema),
    defaultValues: {
      date: existing?.date ?? initialDate ?? isoDate(new Date()),
      startTime: existing?.startTime ?? '10:00',
      endTime: existing?.endTime ?? '11:00',
      status: existing?.status ?? 'free',
      note: existing?.note ?? '',
    },
  });

  const statusValue = watch('status');

  const onSubmit = async (data: AddSlotInput) => {
    setApiError(null);
    try {
      const payload: AddSlotInput = { ...data, note: data.note?.trim() || undefined };
      if (existing) {
        await updateSlot(existing.id, payload);
      } else {
        await addSlot(payload);
      }
      onSaved();
    } catch (err) {
      setApiError(err instanceof ApiError ? err.message : 'Failed to save slot');
    }
  };

  const handleDelete = async () => {
    if (!existing) return;
    setDeleting(true);
    setApiError(null);
    try {
      await deleteSlot(existing.id);
      onDeleted?.();
    } catch (err) {
      setApiError(err instanceof ApiError ? err.message : 'Failed to delete slot');
      setDeleting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div>
        <label htmlFor="slot-date" className="block text-[0.85rem] font-semibold mb-1 text-ink-lead">
          Date
        </label>
        <input
          id="slot-date"
          type="date"
          {...register('date')}
          className="w-full px-3 py-2 rounded border border-[#EDE3D4] text-[0.92rem] text-ink-lead outline-none focus:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary bg-surface-card"
        />
        {errors.date && (
          <p role="alert" className="text-feedback-error text-xs mt-1">{errors.date.message}</p>
        )}
      </div>

      <div className="flex gap-4 flex-wrap">
        <Controller
          control={control}
          name="startTime"
          render={({ field }) => (
            <TimePicker label="Start time" value={field.value} onChange={field.onChange} />
          )}
        />
        <Controller
          control={control}
          name="endTime"
          render={({ field }) => (
            <TimePicker label="End time" value={field.value} onChange={field.onChange} />
          )}
        />
      </div>
      {errors.endTime && (
        <p role="alert" className="text-feedback-error text-xs -mt-2">{errors.endTime.message}</p>
      )}

      <div>
        <label className="block text-[0.85rem] font-semibold mb-1 text-ink-lead">Status</label>
        <div className="flex gap-3">
          {(['free', 'busy'] as const).map((s) => (
            <label
              key={s}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2 rounded border cursor-pointer text-[0.88rem] font-semibold transition-colors',
                statusValue === s
                  ? s === 'free'
                    ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                    : 'border-[#C8B99A] bg-[#E4D9C8] text-ink-muted'
                  : 'border-[#EDE3D4] text-ink-muted',
              )}
            >
              <input
                type="radio"
                value={s}
                {...register('status')}
                className="sr-only"
              />
              {s === 'free' ? 'Free' : 'Busy'}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="slot-note" className="block text-[0.85rem] font-semibold mb-1 text-ink-lead">
          Note <span className="text-ink-muted font-normal">(optional)</span>
        </label>
        <input
          id="slot-note"
          type="text"
          {...register('note')}
          placeholder="e.g. Park visit, indoor only…"
          className="w-full px-3 py-2 rounded border border-[#EDE3D4] text-[0.92rem] text-ink-lead outline-none focus:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary bg-surface-card"
        />
      </div>

      {apiError && (
        <p role="alert" className="text-feedback-error text-sm">{apiError}</p>
      )}

      <div className="flex gap-2 justify-between">
        {existing && (
          <button
            type="button"
            disabled={deleting}
            onClick={handleDelete}
            className="rounded-full border border-feedback-error px-4 py-2 text-sm font-semibold text-feedback-error hover:bg-feedback-error/10 transition-colors disabled:opacity-60"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        )}
        <div className="flex gap-2 ml-auto">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-[#EDE3D4] px-4 py-2 text-sm font-semibold text-ink-muted hover:bg-surface-warm transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-full bg-brand-primary-pressed px-4 py-2 text-sm font-semibold text-white shadow-lift hover:bg-brand-primary-pressed transition-colors disabled:opacity-60"
          >
            {isSubmitting ? 'Saving…' : existing ? 'Save' : 'Add Slot'}
          </button>
        </div>
      </div>
    </form>
  );
}
