import { z } from 'zod';
import { apiRequest } from './client';

export const REACTION_TYPES = ['like', 'love', 'hug', 'celebrate', 'support'] as const;
export const ReactionType = z.enum(REACTION_TYPES);
export type ReactionType = z.infer<typeof ReactionType>;

const ReactionCounts = z.object({
  like: z.number(),
  love: z.number(),
  hug: z.number(),
  celebrate: z.number(),
  support: z.number(),
});

export const AnnouncementDTO = z.object({
  id: z.string(),
  authorId: z.string(),
  content: z.string(),
  mediaUrl: z.string().nullable(),
  mediaType: z.enum(['image', 'video']).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  reactions: ReactionCounts,
  myReaction: ReactionType.nullable(),
  isAuthor: z.boolean(),
});
export type AnnouncementDTO = z.infer<typeof AnnouncementDTO>;

export const FeedPage = z.object({
  items: z.array(AnnouncementDTO),
  nextCursor: z.string().nullable(),
});
export type FeedPage = z.infer<typeof FeedPage>;

export const CommentDTO = z.object({
  id: z.string(),
  announcementId: z.string(),
  authorId: z.string(),
  content: z.string(),
  createdAt: z.string(),
  isAuthor: z.boolean(),
});
export type CommentDTO = z.infer<typeof CommentDTO>;

export const ReactionResponse = z.object({
  toggled: z.enum(['added', 'removed', 'switched']),
  reactions: ReactionCounts,
  myReaction: ReactionType.nullable(),
});
export type ReactionResponse = z.infer<typeof ReactionResponse>;

export async function listAnnouncements(opts: { cursor?: string; limit?: number } = {}): Promise<FeedPage> {
  const params = new URLSearchParams();
  if (opts.cursor) params.set('cursor', opts.cursor);
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  const qs = params.toString();
  const data = await apiRequest<unknown>(`/announcements${qs ? `?${qs}` : ''}`);
  return FeedPage.parse(data);
}

export async function getAnnouncement(id: string): Promise<AnnouncementDTO> {
  const data = await apiRequest<unknown>(`/announcements/${id}`);
  return AnnouncementDTO.parse(data);
}

export interface CreateAnnouncementInput {
  content: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
}

export async function createAnnouncement(input: CreateAnnouncementInput): Promise<AnnouncementDTO> {
  const data = await apiRequest<unknown>('/announcements', { method: 'POST', body: input });
  return AnnouncementDTO.parse(data);
}

export async function listComments(announcementId: string): Promise<CommentDTO[]> {
  const data = await apiRequest<unknown>(`/announcements/${announcementId}/comments`);
  return z.array(CommentDTO).parse(data);
}

export async function createComment(announcementId: string, input: { content: string }): Promise<CommentDTO> {
  const data = await apiRequest<unknown>(`/announcements/${announcementId}/comments`, { method: 'POST', body: input });
  return CommentDTO.parse(data);
}

export async function toggleReaction(announcementId: string, type: ReactionType): Promise<ReactionResponse> {
  const data = await apiRequest<unknown>(`/announcements/${announcementId}/reactions`, { method: 'POST', body: { type } });
  return ReactionResponse.parse(data);
}

export const feedKeys = {
  all: ['feed'] as const,
  page: ['feed', 'page'] as const,
  byId: (id: string) => ['feed', 'byId', id] as const,
  comments: (id: string) => ['feed', 'comments', id] as const,
};

export interface PatchAnnouncementInput {
  content?: string;
  mediaUrl?: string | null;
  mediaType?: 'image' | 'video' | null;
}

export async function patchAnnouncement(id: string, input: PatchAnnouncementInput): Promise<AnnouncementDTO> {
  const data = await apiRequest<unknown>(`/announcements/${id}`, { method: 'PATCH', body: input });
  return AnnouncementDTO.parse(data);
}

export async function deleteAnnouncement(id: string): Promise<void> {
  await apiRequest<unknown>(`/announcements/${id}`, { method: 'DELETE' });
}

export async function deleteComment(id: string): Promise<void> {
  await apiRequest<unknown>(`/comments/${id}`, { method: 'DELETE' });
}
