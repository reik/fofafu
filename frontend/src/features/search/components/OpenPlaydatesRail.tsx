import { Link } from 'react-router-dom';
import { cn } from '@/utils/cn';
import { formatShortDate, formatTime } from '@/utils/datetime';
import { familyInitial, type DirectoryRail, type RailEntry } from '../hooks/useFamilyDirectory';
import { PlaydateBadge } from './PlaydateBadge';

const BONE = 'bg-surface-subtle animate-pulse motion-reduce:animate-none';
const SKELETON_ROWS = [0, 1, 2];

/** "Wednesday, October 7" from the date half of a floating local start. */
function formatSpokenDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function OpenPlaydateRowSkeleton() {
  return (
    <div className="flex items-start gap-2">
      <div className={cn(BONE, 'h-8 w-8 shrink-0 rounded-full')} />
      <div className="min-w-0 flex-1 space-y-2">
        <div className={cn(BONE, 'h-3 w-3/4 rounded-sm')} />
        <div className={cn(BONE, 'h-3 w-1/2 rounded-sm')} />
        <div className={cn(BONE, 'h-4 w-16 rounded-full')} />
      </div>
    </div>
  );
}

interface OpenPlaydateRowProps {
  entry: RailEntry;
}

/**
 * The slot start is a floating local time: its date and clock halves are
 * shown as the host entered them, never shifted to the viewer's time zone.
 */
function OpenPlaydateRow({ entry: { family, slot } }: OpenPlaydateRowProps) {
  const [date = '', clock = ''] = slot.start.split('T');
  const time = formatTime(clock);

  return (
    <li className="flex items-start gap-2">
      {family.avatarUrl ? (
        <img src={family.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-warm text-sm font-bold text-ink-lead"
        >
          {familyInitial(family.name) || '?'}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{family.name}</span>
        <time dateTime={slot.start} className="block text-xs text-ink-muted">
          {formatShortDate(date)} · {time}
        </time>
        <span className="mt-1 block">
          <PlaydateBadge
            to={`/family/${family.id}?requestSlot=${encodeURIComponent(slot.id)}`}
            label="Request"
            accessibleLabel={`Request a playdate with ${family.name} on ${formatSpokenDate(date)} at ${time}`}
          />
        </span>
      </span>
    </li>
  );
}

interface OpenPlaydatesRailProps {
  rail: DirectoryRail;
  /** Set on the heading so the surrounding landmark can be labelled by it. */
  headingId: string;
}

/** Heading and footer link show in every state; only the rows between them change. */
export function OpenPlaydatesRail({ rail, headingId }: OpenPlaydatesRailProps) {
  const loading = rail.status === 'loading';

  return (
    <section className="rounded-lg bg-surface-card p-4 shadow-lift">
      <h2 id={headingId} className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-muted">
        Open for playdates this week
      </h2>
      {loading && <p className="sr-only">Loading open playdates…</p>}
      <div aria-busy={loading}>
        {loading && (
          <div aria-hidden="true" className="space-y-3">
            {SKELETON_ROWS.map((row) => (
              <OpenPlaydateRowSkeleton key={row} />
            ))}
          </div>
        )}
        {rail.status === 'error' && <p className="text-sm text-feedback-error">We couldn't load open playdates.</p>}
        {rail.status === 'ready' && rail.entries.length === 0 && (
          <p className="text-sm italic text-ink-muted">No free slots in the next 7 days.</p>
        )}
        {rail.entries.length > 0 && (
          <ul role="list" className="space-y-3">
            {rail.entries.map((entry) => (
              <OpenPlaydateRow key={entry.family.id} entry={entry} />
            ))}
          </ul>
        )}
      </div>
      <Link
        to="/playdates"
        className="mt-3 block min-h-6 rounded-sm text-sm font-semibold text-ink-lead underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand-primary"
      >
        Your playdates →
      </Link>
    </section>
  );
}
