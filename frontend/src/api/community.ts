import { z } from 'zod';
import { edgeRequest } from './edgeClient';
import { FamilyDTO } from './family';

// Backed by supabase/functions/community/index.ts.
const FN = 'community';

// `nextFreeSlotStart` and the `now` query param share one format: a floating
// local date-time, `YYYY-MM-DDTHH:MM:SS`, with no `Z` and no offset (see
// supabase/functions/_shared/familyListing.ts). Two values in this format
// compare correctly as plain strings.
const FLOATING_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

// The backend stores "no location" as an empty string, and a backend that
// predates this shape leaves the key out. Both read as null.
const optionalText = z
  .string()
  .nullish()
  .transform((value) => (value && value.trim() !== '' ? value : null));

const floatingLocalTime = z
  .string()
  .nullish()
  .transform((value) => (value && FLOATING_LOCAL.test(value) ? value : null));

/** The family row `community/recent` and `search/families` both return. */
export const ListedFamilyDTO = FamilyDTO.extend({
  city: optionalText,
  state: optionalText,
  nextFreeSlotId: optionalText,
  nextFreeSlotStart: floatingLocalTime,
});
export type ListedFamilyDTO = z.infer<typeof ListedFamilyDTO>;

export const CommunityFamilyDTO = ListedFamilyDTO;
export type CommunityFamilyDTO = ListedFamilyDTO;

/**
 * The local wall-clock time in the floating format above. Not
 * `toISOString()`: that is UTC with a `Z`, which the backend discards.
 */
export function toLocalNow(date: Date): string {
  const pad = (part: number) => String(part).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export async function getRecentCommunity(limit?: number, now?: string): Promise<ListedFamilyDTO[]> {
  const params = new URLSearchParams();
  if (limit !== undefined) params.set('limit', String(limit));
  if (now !== undefined) params.set('now', now);
  const qs = params.toString();
  const data = await edgeRequest<unknown>(FN, `/recent${qs ? `?${qs}` : ''}`);
  return z.array(ListedFamilyDTO).parse(data);
}

export const communityKeys = {
  recent: (limit: number | undefined) => ['community', 'recent', limit ?? 'default'] as const,
};
