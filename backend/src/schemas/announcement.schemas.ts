import { z } from 'zod';

export const ReactionType = z.enum(['like', 'love', 'hug', 'celebrate', 'support']);
export type ReactionType = z.infer<typeof ReactionType>;

export const CreateAnnouncementInput = z.object({
  content: z.string().min(1).max(4000),
  mediaUrl: z.string().url().max(2048).optional(),
  mediaType: z.enum(['image', 'video']).optional(),
});
export type CreateAnnouncementInput = z.infer<typeof CreateAnnouncementInput>;

export const PatchAnnouncementInput = z.object({
  content: z.string().min(1).max(4000).optional(),
  mediaUrl: z.string().url().max(2048).nullable().optional(),
  mediaType: z.enum(['image', 'video']).nullable().optional(),
});
export type PatchAnnouncementInput = z.infer<typeof PatchAnnouncementInput>;

export const ListAnnouncementsQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type ListAnnouncementsQuery = z.infer<typeof ListAnnouncementsQuery>;

export const CreateCommentInput = z.object({
  content: z.string().min(1).max(2000),
});
export type CreateCommentInput = z.infer<typeof CreateCommentInput>;

export const ReactInput = z.object({
  type: ReactionType,
});
export type ReactInput = z.infer<typeof ReactInput>;

export const AnnouncementIdParams = z.object({
  id: z.string().uuid(),
});
export type AnnouncementIdParams = z.infer<typeof AnnouncementIdParams>;
