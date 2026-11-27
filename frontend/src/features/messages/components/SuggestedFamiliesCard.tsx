import { useId } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { communityKeys, getSuggestedFamilies, toLocalNow, type SuggestedFamilyDTO } from '@/api/community';
import { Avatar } from '@/components/Avatar';
import { formatTime } from '@/utils/datetime';

const MAX_ROWS = 3;
const DAY_MS = 86_400_000;

interface ReasonLine {
  text: string;
  /** A fuller wording for screen readers; the short `text` is then hidden from them. */
  spoken?: string;
}

/**
 * "Open Sat 10am" for a slot under a week away, "Open Dec 12, 10am" after
 * that (a bare weekday would name the wrong week). The start is floating
 * local time: its date and clock halves are shown as entered.
 */
function openSlotLine(start: string | null, now: Date): ReasonLine | null {
  if (!start || start < toLocalNow(now)) return null;
  const [date = '', clock = ''] = start.split('T');
  const day = new Date(`${date}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysAway = Math.round((day.getTime() - today.getTime()) / DAY_MS);
  const time = formatTime(clock);
  const when = daysAway < 7
    ? day.toLocaleDateString('en-US', { weekday: 'short' })
    : `${day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })},`;
  const spokenDate = day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  return { text: `Open ${when} ${time}`, spoken: `Open for a playdate ${spokenDate} at ${time}` };
}

/** The one line under a suggestion saying why it's there (### Microcopy, reason-line table). */
function reasonLine(family: SuggestedFamilyDTO, now: Date): ReasonLine | null {
  switch (family.reason) {
    case 'same_city': {
      const place = family.city ?? family.state;
      return place ? { text: `Also in ${place}` } : null;
    }
    case 'same_state':
      return family.state ? { text: `Also in ${family.state}` } : null;
    case 'open_slot':
      return openSlotLine(family.nextFreeSlotStart, now);
    case 'recent':
      return { text: 'Recently updated their page' };
    default:
      return null;
  }
}

/**
 * "Families to say hi to". Renders only once the request has succeeded with
 * at least one family: nothing at all while loading, on error, or when no
 * family qualifies (user-approved rule, 2026-11-27).
 */
export function SuggestedFamiliesCard() {
  const headingId = useId();
  const { data } = useQuery({
    queryKey: communityKeys.suggested,
    queryFn: () => getSuggestedFamilies(toLocalNow(new Date())),
  });

  if (!data || data.length === 0) return null;
  const now = new Date();

  return (
    <aside aria-labelledby={headingId} className="rounded-lg bg-surface-card p-4 shadow-lift">
      <h2 id={headingId} className="text-xs font-bold uppercase tracking-wide text-ink-muted">
        Families to say hi to
      </h2>
      <ul role="list" className="mt-3 space-y-2">
        {data.slice(0, MAX_ROWS).map((family) => {
          const reason = reasonLine(family, now);
          return (
            // Message sits under the text, so the name and reason get the
            // whole column instead of sharing it with the action.
            <li key={family.id} className="flex items-start gap-3">
              <Avatar avatarUrl={family.avatarUrl} name={family.name} className="h-8 w-8 text-sm" />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 break-words text-sm font-semibold leading-snug text-ink-lead">{family.name}</p>
                {reason && (
                  <p className="break-words text-xs text-ink-muted">
                    <span aria-hidden={reason.spoken ? true : undefined}>{reason.text}</span>
                    {reason.spoken && <span className="sr-only">{reason.spoken}</span>}
                  </p>
                )}
                <Link
                  to={`/messages/${family.ownerId}`}
                  aria-label={`Message ${family.name}`}
                  className="-ml-2 inline-flex min-h-11 items-center rounded-full px-2 text-sm font-semibold text-brand-primary-pressed underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand-primary"
                >
                  Message
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
