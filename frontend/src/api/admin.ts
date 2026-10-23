import { z } from 'zod';
import { edgeRequest } from './edgeClient';

const FN = 'admin';

export const AdminUserDTO = z.object({
  id: z.string(),
  familyId: z.string(),
  name: z.string(),
  bio: z.string(),
  kidCount: z.number().nullable(),
  avatarUrl: z.string().nullable(),
  createdAt: z.string(),
  email: z.string().nullable(),
  banned: z.boolean(),
});
export type AdminUserDTO = z.infer<typeof AdminUserDTO>;

export const AdminUserDetailDTO = AdminUserDTO.extend({ updatedAt: z.string() });
export type AdminUserDetailDTO = z.infer<typeof AdminUserDetailDTO>;

export const AdminAnnouncementDTO = z.object({
  id: z.string(),
  user_id: z.string(),
  content: z.string(),
  media_url: z.string().nullable(),
  media_type: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type AdminAnnouncementDTO = z.infer<typeof AdminAnnouncementDTO>;

export const AdminCommentDTO = z.object({
  id: z.string(),
  announcement_id: z.string(),
  user_id: z.string(),
  content: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type AdminCommentDTO = z.infer<typeof AdminCommentDTO>;

export const AdminReactionDTO = z.object({
  id: z.string(),
  announcement_id: z.string(),
  user_id: z.string(),
  type: z.string(),
  created_at: z.string(),
});
export type AdminReactionDTO = z.infer<typeof AdminReactionDTO>;

export const AdminMessageDTO = z.object({
  id: z.string(),
  sender_id: z.string(),
  receiver_id: z.string(),
  content: z.string(),
  read: z.boolean(),
  created_at: z.string(),
});
export type AdminMessageDTO = z.infer<typeof AdminMessageDTO>;

export type ContentTable = 'announcements' | 'comments' | 'reactions';

const CONTENT_SCHEMA = {
  announcements: AdminAnnouncementDTO,
  comments: AdminCommentDTO,
  reactions: AdminReactionDTO,
} as const;

export async function listUsers(): Promise<AdminUserDTO[]> {
  const data = await edgeRequest<unknown>(FN, '/users');
  return z.array(AdminUserDTO).parse(data);
}

export async function getUser(id: string): Promise<AdminUserDetailDTO> {
  const data = await edgeRequest<unknown>(FN, `/users/${id}`);
  return AdminUserDetailDTO.parse(data);
}

export interface UpdateUserInput {
  name?: string;
  bio?: string;
  kidCount?: number | null;
  avatarUrl?: string | null;
  email?: string;
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<AdminUserDetailDTO> {
  const data = await edgeRequest<unknown>(FN, `/users/${id}`, { method: 'PATCH', body: input });
  return AdminUserDetailDTO.parse(data);
}

export async function setUserBan(id: string, input: { hours?: number; unban?: boolean }): Promise<{ id: string; banned: boolean }> {
  return edgeRequest<{ id: string; banned: boolean }>(FN, `/users/${id}/ban`, { method: 'POST', body: input });
}

export async function forcePasswordReset(id: string): Promise<{ id: string; sent: boolean }> {
  return edgeRequest<{ id: string; sent: boolean }>(FN, `/users/${id}/reset-password`, { method: 'POST' });
}

export async function listContent<T extends ContentTable>(
  table: T,
): Promise<Array<z.infer<(typeof CONTENT_SCHEMA)[T]>>> {
  const data = await edgeRequest<unknown>(FN, `/content/${table}`);
  return z.array(CONTENT_SCHEMA[table]).parse(data) as Array<z.infer<(typeof CONTENT_SCHEMA)[T]>>;
}

export async function updateContent(
  table: 'announcements' | 'comments',
  id: string,
  content: string,
): Promise<AdminAnnouncementDTO | AdminCommentDTO> {
  const data = await edgeRequest<unknown>(FN, `/content/${table}/${id}`, { method: 'PATCH', body: { content } });
  return CONTENT_SCHEMA[table].parse(data);
}

export async function deleteContent(table: ContentTable, id: string): Promise<{ deleted: true }> {
  return edgeRequest<{ deleted: true }>(FN, `/content/${table}/${id}`, { method: 'DELETE' });
}

export async function getConversation(userIdA: string, userIdB: string): Promise<AdminMessageDTO[]> {
  const data = await edgeRequest<unknown>(FN, `/messages/${userIdA}/${userIdB}`);
  return z.array(AdminMessageDTO).parse(data);
}

export async function updateMessage(id: string, content: string): Promise<AdminMessageDTO> {
  const data = await edgeRequest<unknown>(FN, `/messages/${id}`, { method: 'PATCH', body: { content } });
  return AdminMessageDTO.parse(data);
}

export async function deleteMessage(id: string): Promise<{ deleted: true }> {
  return edgeRequest<{ deleted: true }>(FN, `/messages/${id}`, { method: 'DELETE' });
}

export const adminKeys = {
  users: ['admin', 'users'] as const,
  user: (id: string) => ['admin', 'users', id] as const,
  content: (table: ContentTable) => ['admin', 'content', table] as const,
  conversation: (userIdA: string, userIdB: string) =>
    ['admin', 'messages', [userIdA, userIdB].sort().join(':')] as const,
};
