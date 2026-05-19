import { z } from 'zod';
import { apiRequest } from './client';

export const FamilyDTO = z.object({
  id: z.string(),
  ownerId: z.string(),
  name: z.string(),
  bio: z.string(),
  kidCount: z.number().nullable(),
  avatarUrl: z.string().nullable(),
  isOwner: z.boolean(),
  updatedAt: z.string(),
});
export type FamilyDTO = z.infer<typeof FamilyDTO>;

export const FamilyPatchInput = z.object({
  name: z.string().min(1, 'Tell us a name.').max(80).optional(),
  bio: z.string().max(2000, 'Keep it under 2000 characters.').optional(),
  kidCount: z.number().int().min(0).max(20, 'Up to 20.').nullable().optional(),
  avatarUrl: z.string().max(2048).nullable().optional(),
});
export type FamilyPatchInput = z.infer<typeof FamilyPatchInput>;

export async function getMyFamily(): Promise<FamilyDTO> {
  const data = await apiRequest<unknown>('/family/me');
  return FamilyDTO.parse(data);
}

export async function getFamily(id: string): Promise<FamilyDTO> {
  const data = await apiRequest<unknown>(`/family/${id}`);
  return FamilyDTO.parse(data);
}

export async function patchFamily(patch: FamilyPatchInput): Promise<FamilyDTO> {
  const data = await apiRequest<unknown>('/family/me', { method: 'PATCH', body: patch });
  return FamilyDTO.parse(data);
}

export const familyKeys = {
  me: ['family', 'me'] as const,
  byId: (id: string) => ['family', 'byId', id] as const,
};
