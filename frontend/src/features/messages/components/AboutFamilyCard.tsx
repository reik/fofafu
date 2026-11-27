import { useId } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { EdgeApiError } from '@/api/edgeClient';
import { familyKeys, familyLocation, getFamily, type FamilyDTO } from '@/api/family';
import { toLocalNow } from '@/api/community';
import { getAvailability, playdateKeys } from '@/api/playdates';
import { Avatar } from '@/components/Avatar';
import { PlaydateBadge } from '@/features/search/components/PlaydateBadge';
import { useBlockedFamilies } from '@/features/moderation/hooks/useBlock';
import type { AvailabilitySlot } from '@/types/playdates';
import { cn } from '@/utils/cn';
import { formatShortDate, formatTime } from '@/utils/datetime';
import { formatAuthor } from '@/utils/formatAuthor';

const EYEBROW = 'text-xs font-bold uppercase tracking-wide text-ink-muted';
const BONE = 'bg-surface-subtle animate-pulse motion-reduce:animate-none';
const MAX_SLOTS = 3;
const TEXT_LINK =
  'block min-h-6 rounded-sm text-sm font-semibold text-brand-primary-pressed underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand-primary';

/** Free slots that haven't started yet, soonest first. Start times are floating local. */
function upcomingFreeSlots(slots: AvailabilitySlot[], now: Date): AvailabilitySlot[] {
  const nowMinute = toLocalNow(now).slice(0, 16);
  return slots
    .filter((slot) => slot.status === 'free' && `${slot.date}T${slot.startTime}` >= nowMinute)
    .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`))
    .slice(0, MAX_SLOTS);
}

function spokenDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function Identity({ name, avatarUrl, location }: { name: string; avatarUrl?: string | null; location?: string | null }) {
  return (
    <div className="mt-3 flex items-center gap-3">
      <Avatar avatarUrl={avatarUrl} name={name} className="h-12 w-12 text-xl" />
      <div className="min-w-0">
        <p className="truncate text-base font-semibold">{name}</p>
        {location && <p className="text-xs text-ink-muted">{location}</p>}
      </div>
    </div>
  );
}

function FamilySkeleton() {
  return (
    <>
      <p className="sr-only">Loading family details…</p>
      <div aria-hidden="true">
        <div className="mt-3 flex items-center gap-3">
          <div className={cn(BONE, 'h-12 w-12 shrink-0 rounded-full')} />
          <div className="flex-1 space-y-2">
            <div className={cn(BONE, 'h-3 w-3/4 rounded-sm')} />
            <div className={cn(BONE, 'h-2.5 w-1/2 rounded-sm')} />
          </div>
        </div>
        <div className="mt-3 space-y-2">
          {['w-full', 'w-[92%]', 'w-[64%]'].map((width) => (
            <div key={width} className={cn(BONE, 'h-3 rounded-sm', width)} />
          ))}
        </div>
      </div>
    </>
  );
}

function SlotSkeleton() {
  return (
    <>
      <p className="sr-only">Loading open playdates…</p>
      <div aria-hidden="true" className="mt-2 space-y-3">
        {[0, 1].map((row) => (
          <div key={row} className="flex items-center justify-between gap-2">
            <div className={cn(BONE, 'h-3 w-1/2 rounded-sm')} />
            <div className={cn(BONE, 'h-5 w-16 rounded-full')} />
          </div>
        ))}
      </div>
    </>
  );
}

function OpenSlots({ family }: { family: FamilyDTO }) {
  const { data, isPending, isError } = useQuery({
    queryKey: playdateKeys.availability(family.ownerId),
    queryFn: () => getAvailability(family.ownerId),
  });
  const slots = data ? upcomingFreeSlots(data, new Date()) : [];

  return (
    <div className="mt-4" aria-busy={isPending}>
      <h3 className={EYEBROW}>Open playdates</h3>
      {isPending && <SlotSkeleton />}
      {isError && <p className="mt-2 text-sm text-ink-muted">We couldn't load open playdates.</p>}
      {data && slots.length === 0 && <p className="mt-2 text-sm italic text-ink-muted">No open playdates coming up.</p>}
      {slots.length > 0 && (
        <ul role="list" className="mt-2 divide-y divide-ink-muted/20 border-t border-ink-muted/20">
          {slots.map((slot) => {
            const time = formatTime(slot.startTime);
            return (
              <li key={slot.id} className="flex items-center justify-between gap-2 py-2">
                <time dateTime={`${slot.date}T${slot.startTime}`} className="text-sm text-ink-lead">
                  {formatShortDate(slot.date)} · {time}
                </time>
                <PlaydateBadge
                  to={`/family/${family.id}?requestSlot=${encodeURIComponent(slot.id)}`}
                  label="Request"
                  accessibleLabel={`Request a playdate with ${family.name} on ${spokenDate(slot.date)} at ${time}`}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FamilyDetails({ family }: { family: FamilyDTO }) {
  // Request actions aren't offered to a family the viewer has blocked, so
  // the slots wait until the block list has settled.
  const blocks = useBlockedFamilies();
  const showSlots = !blocks.isPending && !blocks.data?.some((b) => b.blockedFamilyId === family.id);

  return (
    <>
      <Identity name={family.name} avatarUrl={family.avatarUrl} location={familyLocation(family)} />
      {family.bio.trim() ? (
        <p className="mt-3 line-clamp-4 whitespace-pre-line text-sm text-ink-lead">{family.bio}</p>
      ) : (
        <p className="mt-3 text-sm italic text-ink-muted">This family hasn't added a bio yet.</p>
      )}
      {showSlots && <OpenSlots family={family} />}
      <Link to={`/family/${family.id}`} aria-label={`View family page for ${family.name}`} className={cn(TEXT_LINK, 'mt-4')}>
        View family page <span aria-hidden="true">→</span>
      </Link>
    </>
  );
}

interface AboutFamilyCardProps {
  /** The conversation partner's user id; `family/:id` resolves an owner id too. */
  partnerId: string;
  /** From the thread list: null for a former member, undefined when there's no thread yet. */
  partnerName?: string | null | undefined;
}

/** "About this family": the selected conversation partner's page, in brief. */
export function AboutFamilyCard({ partnerId, partnerName }: AboutFamilyCardProps) {
  const headingId = useId();
  const { data: family, isPending, error } = useQuery({
    queryKey: familyKeys.byId(partnerId),
    queryFn: () => getFamily(partnerId),
  });
  const notFound = error instanceof EdgeApiError && error.status === 404;

  return (
    <aside aria-labelledby={headingId} className="rounded-lg bg-surface-card p-4 shadow-lift">
      <h2 id={headingId} className={EYEBROW}>About this family</h2>
      <div aria-busy={isPending}>
        {isPending && <FamilySkeleton />}
        {family && <FamilyDetails family={family} />}
        {notFound && (
          <>
            <Identity name={formatAuthor(partnerName)} />
            <p className="mt-3 text-sm italic text-ink-muted">
              {partnerName === null
                ? "This family's page is no longer available."
                : "This family hasn't set up their page yet."}
            </p>
          </>
        )}
        {error && !notFound && <p className="mt-3 text-sm text-feedback-error">We couldn't load this family's details.</p>}
      </div>
    </aside>
  );
}
