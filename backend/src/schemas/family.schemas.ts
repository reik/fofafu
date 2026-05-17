import { z } from 'zod';

export const FamilyPatch = z.object({
  name: z.string().min(1).max(80).optional(),
  bio: z.string().max(2000).optional(),
  kidCount: z.number().int().min(0).max(20).nullable().optional(),
});
export type FamilyPatch = z.infer<typeof FamilyPatch>;

export const FamilyIdParams = z.object({
  id: z.string().uuid(),
});
export type FamilyIdParams = z.infer<typeof FamilyIdParams>;
