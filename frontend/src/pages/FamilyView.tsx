import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { getFamily, getMyFamily, familyKeys } from '@/api/family';
import { getAvailability, getRequests, createRequest, playdateKeys } from '@/api/playdates';
import { ApiError } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import { Layout } from '@/components/Layout';
import { FamilyHeader } from '@/features/family/components/FamilyHeader';
import { FamilyRecentPosts } from '@/features/family/components/FamilyRecentPosts';
import { WeekCalendar, weekMonday, isoDate } from '@/features/playdates/components';
import type { AvailabilitySlot } from '@/types/playdates';

const RequestMessageSchema = z.object({
  message: z.string().optional(),
});
type RequestMessageInput = z.infer<typeof RequestMessageSchema>;

// -- RequestPlaydateModal --------------------------------------------------

interface RequestPlaydateModalProps {
  slot: AvailabilitySlot;
  familyName: string;
  isMatch: boolean;
  hasPendingRequest: boolean;
  onClose: () => void;
}

function RequestPlaydateModal({
  slot,
  familyName,
  isMatch,
  hasPendingRequest,
  onClose,
}: RequestPlaydateModalProps) {
  const [apiError, setApiError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const firstName = familyName.split(' ')[0];

  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<RequestMessageInput>({
    resolver: zodResolver(RequestMessageSchema),
    defaultValues: { message: '' },
  });

  const onSubmit = async (data: RequestMessageInput) => {
    setApiError(null);
    try {
      await createRequest(slot.id, data.message?.trim() || undefined);
      setSent(true);
    } catch (err) {
      setApiError(err instanceof ApiError ? err.message : 'Failed to send request');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Request a Playdate"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-ink-lead/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-md rounded-lg bg-surface-card shadow-lift p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-ink-lead">Request a Playdate</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-ink-muted hover:text-ink-lead">
            &#x2715;
          </button>
        </div>

        {sent ? (
          <div className="text-center py-4">
            <p className="font-semibold text-feedback-success">Request sent!</p>
            <p className="text-ink-muted text-sm mt-1">
              {firstName} will see your request and can accept or decline.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 rounded-full bg-brand-primary px-5 py-2 text-sm font-semibold text-white shadow-lift"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            {/* SlotSummaryBlock -- color.surface.warm bg */}
            <div className="rounded bg-surface-warm px-4 py-3 text-[0.9rem]">
              <div className="font-bold text-ink-lead">{familyName}&apos;s free slot</div>
              <div className="text-ink-muted mt-1">
                {format(new Date(slot.date), 'EEEE, MMMM d, yyyy')}
              </div>
              <div className="text-ink-muted">
                {slot.startTime} &ndash; {slot.endTime}
              </div>
              {slot.note && (
                <div className="mt-1 italic text-ink-muted text-[0.85rem]">&ldquo;{slot.note}&rdquo;</div>
              )}
            </div>

            {/* MatchBanner -- color.slot.match derived from brand.warm (#F0B24F) */}
            {isMatch && (
              <div className="flex items-center gap-2 rounded bg-[#F0B24F]/20 border border-[#F0B24F] px-4 py-2 text-[0.85rem] text-ink-lead">
                <span className="text-base">&#9733;</span>
                <span>
                  <strong>Matching availability</strong> &mdash; this time range overlaps with your free schedule.
                </span>
              </div>
            )}

            <div>
              <label
                htmlFor="playdate-request-message"
                className="block text-[0.85rem] font-semibold mb-1 text-ink-lead"
              >
                Message <span className="text-ink-muted font-normal">(optional)</span>
              </label>
              <textarea
                id="playdate-request-message"
                {...register('message')}
                placeholder={`Say something to ${firstName}...`}
                rows={3}
                className="w-full px-3 py-2 rounded border border-[#EDE3D4] text-[0.92rem] text-ink-lead resize-none outline-none focus:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary bg-surface-card"
              />
            </div>

            {apiError && <p role="alert" className="text-feedback-error text-sm">{apiError}</p>}

            {hasPendingRequest && (
              <p className="text-ink-muted text-sm bg-surface-warm rounded px-3 py-2 border border-[#EDE3D4]">
                You already have a pending request for this slot.
              </p>
            )}

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-[#EDE3D4] px-4 py-2 text-sm font-semibold text-ink-muted hover:bg-surface-warm transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || hasPendingRequest}
                title={hasPendingRequest ? 'You already have a pending request for this slot' : undefined}
                className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white shadow-lift hover:bg-brand-primary/90 transition-colors disabled:opacity-60"
              >
                {isSubmitting ? 'Sending...' : 'Send Request'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// -- FamilyAvailability section -------------------------------------------

interface FamilyAvailabilityProps {
  familyId: string;
  familyName: string;
}

function FamilyAvailability({ familyId, familyName }: FamilyAvailabilityProps) {
  const me = useAuthStore((s) => s.user);
  const [weekStart, setWeekStart] = useState(() => weekMonday(new Date()));
  const [requestSlot, setRequestSlot] = useState<AvailabilitySlot | null>(null);

  const { data: myFamily } = useQuery({
    queryKey: familyKeys.me,
    queryFn: getMyFamily,
    enabled: !!me,
  });

  const { data: slots = [], isLoading: slotsLoading } = useQuery({
    queryKey: playdateKeys.availability(familyId),
    queryFn: () => getAvailability(familyId),
  });

  const { data: mySlots = [] } = useQuery({
    queryKey: playdateKeys.availability(myFamily?.id ?? ''),
    queryFn: () => getAvailability(myFamily!.id),
    enabled: !!myFamily?.id,
  });

  const { data: myRequests = [] } = useQuery({
    queryKey: playdateKeys.requests(),
    queryFn: getRequests,
    enabled: !!myFamily?.id,
  });

  // Slots where both families are free at the same time
  const matchingSlotIds = new Set<string>(
    slots
      .filter((s) => s.status === 'free')
      .filter((s) =>
        mySlots.some(
          (mine) =>
            mine.status === 'free' &&
            mine.date === s.date &&
            mine.startTime < s.endTime &&
            mine.endTime > s.startTime,
        ),
      )
      .map((s) => s.id),
  );

  const weekLabel = `${format(weekStart, 'MMM d')} - ${format(
    new Date(weekStart.getTime() + 6 * 86400000),
    'MMM d, yyyy',
  )}`;

  const firstName = familyName.split(' ')[0];

  return (
    /* Same shell as FamilyHeader bio block: rounded-lg bg-surface-card p-5 shadow-lift */
    <div className="rounded-lg bg-surface-card p-5 shadow-lift mt-6">
      <h2 className="font-semibold text-[1.1rem] text-ink-lead mb-1">
        {familyName}&apos;s availability
      </h2>
      <p className="text-ink-muted text-[0.82rem] mb-3">Click a free slot to request a playdate</p>

      {/* Week nav */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button
          type="button"
          onClick={() => {
            const d = new Date(weekStart);
            d.setDate(d.getDate() - 7);
            setWeekStart(d);
          }}
          className="px-3 py-1 rounded border border-[#EDE3D4] text-[0.82rem] font-semibold text-ink-muted hover:border-brand-primary hover:text-brand-primary transition-colors bg-transparent cursor-pointer"
        >
          &larr; Prev
        </button>
        <span className="flex-1 text-center text-[0.88rem] font-semibold text-ink-lead">{weekLabel}</span>
        <button
          type="button"
          onClick={() => setWeekStart(weekMonday(new Date()))}
          className="px-3 py-1 rounded border border-[#EDE3D4] text-[0.82rem] font-semibold text-ink-muted hover:border-brand-primary hover:text-brand-primary transition-colors bg-transparent cursor-pointer"
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => {
            const d = new Date(weekStart);
            d.setDate(d.getDate() + 7);
            setWeekStart(d);
          }}
          className="px-3 py-1 rounded border border-[#EDE3D4] text-[0.82rem] font-semibold text-ink-muted hover:border-brand-primary hover:text-brand-primary transition-colors bg-transparent cursor-pointer"
        >
          Next &rarr;
        </button>
      </div>

      {slotsLoading ? (
        <div className="flex justify-center py-10">
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-brand-primary/20 border-t-brand-primary" />
        </div>
      ) : slots.length === 0 && isoDate(weekStart) > isoDate(new Date()) ? (
        <div className="text-center py-10 text-ink-muted text-[0.88rem]">
          {firstName} hasn&apos;t set any availability yet.
        </div>
      ) : (
        <>
          {/* Legend */}
          <div className="flex gap-4 text-[0.76rem] mb-2 flex-wrap text-ink-muted">
            {/* color.slot.free = brand.primary */}
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-brand-primary inline-block" /> Free
            </span>
            {/* color.slot.match = #F0B24F (brand.warm) */}
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-[#F0B24F] inline-block" /> &#9733; Matches your availability
            </span>
            <span>Click a slot to request</span>
          </div>
          <WeekCalendar
            weekStart={weekStart}
            slots={slots}
            mode="view"
            matchingSlotIds={matchingSlotIds}
            onSlotClick={(slot) => {
              if (slot.status === 'free') setRequestSlot(slot);
            }}
          />
        </>
      )}

      {requestSlot && (
        <RequestPlaydateModal
          slot={requestSlot}
          familyName={familyName}
          isMatch={matchingSlotIds.has(requestSlot.id)}
          hasPendingRequest={myRequests.some(
            (r) =>
              r.slotId === requestSlot.id &&
              r.requesterFamilyId === myFamily?.id &&
              r.status === 'pending',
          )}
          onClose={() => setRequestSlot(null)}
        />
      )}
    </div>
  );
}

// -- Page ------------------------------------------------------------------

export default function FamilyViewPage() {
  const { id } = useParams<{ id: string }>();

  const { data, isPending, isError, error } = useQuery({
    queryKey: familyKeys.byId(id ?? ''),
    queryFn: () => getFamily(id!),
    enabled: !!id,
  });

  if (!id) {
    return (
      <Layout>
        <h1 className="text-3xl font-semibold tracking-tight">Missing family</h1>
      </Layout>
    );
  }

  if (isPending) return <Layout><p className="text-ink-muted">Loading...</p></Layout>;

  if (isError) {
    return (
      <Layout>
        <h1 className="text-3xl font-semibold tracking-tight">We couldn&apos;t find that family</h1>
        <p className="mt-2 text-sm text-ink-muted">{error instanceof Error ? error.message : 'Try the link again.'}</p>
        <p className="mt-6 text-sm">
          <Link to="/" className="text-brand-primary underline-offset-4 hover:underline">Back home</Link>
        </p>
      </Layout>
    );
  }

  return (
    <Layout>
      <FamilyHeader family={data} />
      {!data.isOwner && (
        <div className="mt-6">
          <Link
            to={`/messages/${data.ownerId}`}
            className="inline-block rounded-full bg-brand-primary px-5 py-2.5 font-semibold text-white shadow-lift"
          >
            Message this family
          </Link>
        </div>
      )}
      <FamilyRecentPosts familyId={data.id} />
      {/* FamilyAvailability: shown only when !isOwner, per acceptance criteria */}
      {!data.isOwner && (
        <FamilyAvailability familyId={data.id} familyName={data.name} />
      )}
      <p className="mt-8 text-sm">
        <Link to="/" className="text-brand-primary underline-offset-4 hover:underline">Back home</Link>
      </p>
    </Layout>
  );
}
