import { z } from 'zod';
import { edgeRequest } from './edgeClient';

const FN = 'coach';

const CoachResponseSchema = z.object({
  verdict: z.enum(['ok', 'suggest']),
  categories: z.array(z.string()),
  reasoning: z.string(),
  rewrite: z.string().nullable(),
});
export type CoachResponse = z.infer<typeof CoachResponseSchema>;

export interface CoachThreadContext {
  postTitle: string;
  recentComments: { author: string; body: string }[];
}

export interface CoachRequest {
  draft: string;
  threadContext?: CoachThreadContext;
}

export async function coachComment(
  input: CoachRequest,
  opts: { signal?: AbortSignal } = {},
): Promise<CoachResponse> {
  const data = await edgeRequest<unknown>(FN, '', {
    method: 'POST',
    body: input,
    ...(opts.signal ? { signal: opts.signal } : {}),
  });
  return CoachResponseSchema.parse(data);
}
