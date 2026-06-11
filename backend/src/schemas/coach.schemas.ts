import { z } from 'zod';

export const CoachThreadContext = z.object({
  postTitle: z.string().max(500),
  recentComments: z.array(
    z.object({
      author: z.string().max(200),
      body: z.string().max(4000),
    }),
  ).max(10),
});
export type CoachThreadContext = z.infer<typeof CoachThreadContext>;

export const CoachInput = z.object({
  draft: z.string().min(1).max(4000),
  threadContext: CoachThreadContext.optional(),
});
export type CoachInput = z.infer<typeof CoachInput>;

export const CoachVerdict = z.enum(['ok', 'suggest']);
export type CoachVerdict = z.infer<typeof CoachVerdict>;

export const CoachResponse = z.object({
  verdict: CoachVerdict,
  categories: z.array(z.string()),
  reasoning: z.string(),
  rewrite: z.string().nullable(),
});
export type CoachResponse = z.infer<typeof CoachResponse>;
