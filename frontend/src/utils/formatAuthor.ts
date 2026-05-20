/**
 * Single source of truth for rendering an author's display name.
 *
 * Backends return `authorName: string | null` (or `partnerName`, `fromName`).
 * `null` means the family record has been removed (deleted user), and we
 * render a neutral, non-linkable fallback so the UI never leaks UUIDs or
 * crashes.
 */
export const AUTHOR_FALLBACK = 'A former member';

export function formatAuthor(name: string | null | undefined): string {
  if (name && name.trim().length > 0) return name;
  return AUTHOR_FALLBACK;
}
