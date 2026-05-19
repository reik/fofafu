import { z } from 'zod';

export const SearchFamiliesQuery = z.object({
  q: z.string().trim().min(2, 'Search needs at least 2 characters.').max(100),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});
export type SearchFamiliesQuery = z.infer<typeof SearchFamiliesQuery>;
