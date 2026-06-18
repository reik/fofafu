/**
 * Renders an ISO timestamp as "6/14/2026 8:36pm" — numeric date, no seconds,
 * lowercase am/pm with no separating space — for use in `<time>` elements
 * across the feed, comments, and messages.
 */
export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const datePart = date.toLocaleDateString('en-US');
  const timePart = date
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toLowerCase()
    .replace(' ', '');
  return `${datePart} ${timePart}`;
}
