import { z } from 'zod';
import { edgeRequest } from './edgeClient';
import { ListedFamilyDTO } from './community';

// Backed by supabase/functions/search/index.ts.
const FN = 'search';

export async function searchFamilies(q: string, limit?: number, now?: string): Promise<ListedFamilyDTO[]> {
  const params = new URLSearchParams();
  params.set('q', q);
  if (limit !== undefined) params.set('limit', String(limit));
  if (now !== undefined) params.set('now', now);
  const data = await edgeRequest<unknown>(FN, `/families?${params.toString()}`);
  return z.array(ListedFamilyDTO).parse(data);
}

export const searchKeys = {
  families: (q: string, limit: number | undefined) => ['search', 'families', q, limit ?? 'default'] as const,
};
