import { z } from 'zod';
import { edgeRequest } from './edgeClient';

// Backed by supabase/functions/family/index.ts.
const FN = 'family';

export const FamilyDTO = z.object({
  id: z.string(),
  ownerId: z.string(),
  name: z.string(),
  bio: z.string(),
  kidCount: z.number().nullable(),
  avatarUrl: z.string().nullable(),
  isOwner: z.boolean(),
  updatedAt: z.string(),
  // `/family/:id` and `/family/me` send null for a blank location; older
  // responses leave the keys out.
  city: z.string().nullish(),
  state: z.string().nullish(),
});
export type FamilyDTO = z.infer<typeof FamilyDTO>;

/** "Oakland, CA", "Oakland", "CA", or null: never a lone comma. */
export function familyLocation({ city, state }: Pick<FamilyDTO, 'city' | 'state'>): string | null {
  const parts = [city, state].map((part) => part?.trim() ?? '').filter((part) => part !== '');
  return parts.length > 0 ? parts.join(', ') : null;
}

export const FamilyPatchInput = z.object({
  name: z.string().min(1, 'Tell us a name.').max(80).optional(),
  bio: z.string().max(2000, 'Keep it under 2000 characters.').optional(),
  kidCount: z.number().int().min(0).max(20, 'Up to 20.').nullable().optional(),
  avatarUrl: z.string().max(2048).nullable().optional(),
});
export type FamilyPatchInput = z.infer<typeof FamilyPatchInput>;

export async function getMyFamily(): Promise<FamilyDTO> {
  const data = await edgeRequest<unknown>(FN, '/me');
  return FamilyDTO.parse(data);
}

export async function getFamily(id: string): Promise<FamilyDTO> {
  const data = await edgeRequest<unknown>(FN, `/${id}`);
  return FamilyDTO.parse(data);
}

export async function patchFamily(patch: FamilyPatchInput): Promise<FamilyDTO> {
  const data = await edgeRequest<unknown>(FN, '/me', { method: 'PATCH', body: patch });
  return FamilyDTO.parse(data);
}

export const familyKeys = {
  me: ['family', 'me'] as const,
  byId: (id: string) => ['family', 'byId', id] as const,
};
