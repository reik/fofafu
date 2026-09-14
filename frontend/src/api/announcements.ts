import { z } from 'zod';
import { edgeRequest, EdgeApiError } from './edgeClient';

// Backed by supabase/functions/announcement/index.ts. Route prefix is
// singular ("/announcement", not "/announcements") and the reaction endpoint
// is POST /announcement/:id/react (drift from the old Express
// POST /announcements/:id/reactions — adapted here to match the deployed
// function).
const FN = 'announcement';

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
  authorName: z.string().nullable(),
  authorAvatarUrl: z.string().nullable(),
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
  authorName: z.string().nullable(),
  content: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  isAuthor: z.boolean(),
});
export type CommentDTO = z.infer<typeof CommentDTO>;

export const ReactionResponse = z.object({
  toggled: z.enum(['added', 'removed', 'switched']),
  reactions: ReactionCounts,
  myReaction: ReactionType.nullable(),
});
export type ReactionResponse = z.infer<typeof ReactionResponse>;

export async function listAnnouncements(
  opts: { cursor?: string; limit?: number; familyId?: string } = {},
): Promise<FeedPage> {
  const params = new URLSearchParams();
  if (opts.cursor) params.set('cursor', opts.cursor);
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  if (opts.familyId) params.set('familyId', opts.familyId);
  const qs = params.toString();
  const data = await edgeRequest<unknown>(FN, qs ? `?${qs}` : '');
  return FeedPage.parse(data);
}

export async function getAnnouncement(id: string): Promise<AnnouncementDTO> {
  const data = await edgeRequest<unknown>(FN, `/${id}`);
  return AnnouncementDTO.parse(data);
}

/**
 * [[features/content-moderation-gate]] — publish-time gate contract.
 *
 * ASSUMPTION, flagged for reconciliation with backend-dev (not landed yet
 * when this was written): the classifier runs inside the existing
 * POST /announcement and POST /announcement/:id/comments handlers, in the
 * same request/response cycle that would otherwise persist the row — no
 * separate pre-flight "classify" call, so there's no window where flagged
 * content could transiently exist. On a flagged submission, the handler
 * skips the insert and responds with this shape instead:
 *
 *   { error: string, code: 'content_flagged', categories: string[] }
 *
 * `code` (not the HTTP status) is the discriminator below, so this degrades
 * gracefully to the generic error path regardless of whether backend-dev
 * ultimately ships 400 or 422 for the status. `categories` is accepted but
 * deliberately unused in the UI — see ModerationBlockNotice, which mirrors
 * reply-coach's "category metadata is for backend/analytics only, never
 * shown to the author" rule.
 */
export const ModerationBlockedPayload = z.object({
  code: z.literal('content_flagged'),
  categories: z.array(z.string()).default([]),
});
export type ModerationBlockedPayload = z.infer<typeof ModerationBlockedPayload>;

export function getModerationBlock(err: unknown): ModerationBlockedPayload | null {
  if (!(err instanceof EdgeApiError)) return null;
  const parsed = ModerationBlockedPayload.safeParse(err.payload);
  return parsed.success ? parsed.data : null;
}

export interface CreateAnnouncementInput {
  content: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
}

export async function createAnnouncement(input: CreateAnnouncementInput): Promise<AnnouncementDTO> {
  const data = await edgeRequest<unknown>(FN, '', { method: 'POST', body: input });
  return AnnouncementDTO.parse(data);
}

export async function listComments(announcementId: string): Promise<CommentDTO[]> {
  const data = await edgeRequest<unknown>(FN, `/${announcementId}/comments`);
  return z.array(CommentDTO).parse(data);
}

export async function createComment(announcementId: string, input: { content: string }): Promise<CommentDTO> {
  const data = await edgeRequest<unknown>(FN, `/${announcementId}/comments`, { method: 'POST', body: input });
  return CommentDTO.parse(data);
}

export async function toggleReaction(announcementId: string, type: ReactionType): Promise<ReactionResponse> {
  const data = await edgeRequest<unknown>(FN, `/${announcementId}/react`, { method: 'POST', body: { type } });
  return ReactionResponse.parse(data);
}

export const feedKeys = {
  all: ['feed'] as const,
  page: ['feed', 'page'] as const,
  byId: (id: string) => ['feed', 'byId', id] as const,
  comments: (id: string) => ['feed', 'comments', id] as const,
  byFamily: (familyId: string) => ['feed', 'byFamily', familyId] as const,
};

export interface PatchAnnouncementInput {
  content?: string;
  mediaUrl?: string | null;
  mediaType?: 'image' | 'video' | null;
}

export async function patchAnnouncement(id: string, input: PatchAnnouncementInput): Promise<AnnouncementDTO> {
  const data = await edgeRequest<unknown>(FN, `/${id}`, { method: 'PATCH', body: input });
  return AnnouncementDTO.parse(data);
}

export async function deleteAnnouncement(id: string): Promise<void> {
  await edgeRequest<unknown>(FN, `/${id}`, { method: 'DELETE' });
}

export async function patchComment(id: string, input: { content: string }): Promise<CommentDTO> {
  const data = await edgeRequest<unknown>(FN, `/comments/${id}`, { method: 'PATCH', body: input });
  return CommentDTO.parse(data);
}

export async function deleteComment(id: string): Promise<void> {
  await edgeRequest<unknown>(FN, `/comments/${id}`, { method: 'DELETE' });
}
