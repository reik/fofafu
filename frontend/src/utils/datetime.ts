/**
 * Lightweight date/time helpers for the playdates calendar views.
 *
 * Deliberately dependency-free (no date-fns) — per engineering standards,
 * "no new dependency without justification," and these formatting needs are
 * small enough to cover with native `Date`.
 */

/** Return the Monday of the week containing `d` (local time). */
export function weekMonday(d: Date): Date {
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const dow = day.getDay(); // 0 = Sunday
  const diff = dow === 0 ? -6 : 1 - dow;
  day.setDate(day.getDate() + diff);
  return day;
}

/** Format a Date as a `YYYY-MM-DD` local-date string. */
export function isoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Convert an `HH:MM` string to minutes since midnight. */
export function toMinutes(t: string): number {
  const parts = t.split(':').map(Number);
  return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
}

/** Format an `HH:MM` (24h) string as a friendly `7am` / `7:30pm` label. */
export function formatTime(t: string): string {
  const parts = t.split(':').map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const ampm = h < 12 ? 'am' : 'pm';
  const display = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${display}${ampm}` : `${display}:${String(m).padStart(2, '0')}${ampm}`;
}

/** Format an hour (0-23) as a friendly `7am` / `8pm` label. */
export function formatHour(h: number): string {
  const ampm = h < 12 ? 'am' : 'pm';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}${ampm}`;
}

/** Format a `YYYY-MM-DD` date string as `EEE, MMM d` (e.g. "Mon, Jun 15"). */
export function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Format a `YYYY-MM-DD` date string as `EEEE, MMMM d, yyyy` (e.g. "Monday, June 15, 2026"). */
export function formatLongDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

/** Format a month label, e.g. "June 2026". */
export function formatMonthLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** Format a week range label, e.g. "Jun 15 – Jun 21, 2026". */
export function formatWeekRangeLabel(weekStart: Date): string {
  const start = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const end = new Date(weekStart.getTime() + 6 * 86400000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${start} – ${end}`;
}

const RELATIVE_UNITS: Array<{ unit: Intl.RelativeTimeFormatUnit; seconds: number }> = [
  { unit: 'year', seconds: 31536000 },
  { unit: 'month', seconds: 2592000 },
  { unit: 'week', seconds: 604800 },
  { unit: 'day', seconds: 86400 },
  { unit: 'hour', seconds: 3600 },
  { unit: 'minute', seconds: 60 },
];

const relativeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** Format an ISO timestamp as a relative time, e.g. "3 hours ago" / "in 2 days". */
export function formatRelativeTime(isoTimestamp: string, now: Date = new Date()): string {
  const then = new Date(isoTimestamp).getTime();
  const diffSeconds = Math.round((then - now.getTime()) / 1000);
  const abs = Math.abs(diffSeconds);

  if (abs < 60) return diffSeconds <= 0 ? 'just now' : relativeFormatter.format(diffSeconds, 'second');

  for (const { unit, seconds } of RELATIVE_UNITS) {
    if (abs >= seconds || unit === 'minute') {
      const value = Math.round(diffSeconds / seconds);
      return relativeFormatter.format(value, unit);
    }
  }
  return 'just now';
}
