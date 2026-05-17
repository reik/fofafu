import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import type { AuthRequest } from '../middleware/auth.middleware.js';
import type {
  CreateAnnouncementInput,
  PatchAnnouncementInput,
  ListAnnouncementsQuery,
  CreateCommentInput,
  ReactInput,
  AnnouncementIdParams,
  ReactionType,
} from '../schemas/announcement.schemas.js';

interface AnnouncementRow {
  id: string;
  user_id: string;
  content: string;
  media_url: string | null;
  media_type: 'image' | 'video' | null;
  created_at: string;
  updated_at: string;
}

interface CommentRow {
  id: string;
  announcement_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

const REACTION_TYPES: ReactionType[] = ['like', 'love', 'hug', 'celebrate', 'support'];

function aggregateReactions(announcementId: string, viewerUserId: string | undefined): { reactions: Record<ReactionType, number>; myReaction: ReactionType | null } {
  const rows = db().prepare('SELECT type, user_id FROM reactions WHERE announcement_id = ?').all(announcementId) as { type: ReactionType; user_id: string }[];
  const reactions = Object.fromEntries(REACTION_TYPES.map((t) => [t, 0])) as Record<ReactionType, number>;
  let myReaction: ReactionType | null = null;
  for (const r of rows) {
    reactions[r.type] += 1;
    if (viewerUserId && r.user_id === viewerUserId) myReaction = r.type;
  }
  return { reactions, myReaction };
}

function toAnnouncementDTO(row: AnnouncementRow, viewerUserId: string | undefined): Record<string, unknown> {
  const { reactions, myReaction } = aggregateReactions(row.id, viewerUserId);
  return {
    id: row.id,
    authorId: row.user_id,
    content: row.content,
    mediaUrl: row.media_url,
    mediaType: row.media_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reactions,
    myReaction,
    isAuthor: viewerUserId === row.user_id,
  };
}

export function createAnnouncement(req: AuthRequest, res: Response): void {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }
  const { content, mediaUrl, mediaType } = req.body as CreateAnnouncementInput;
  const id = randomUUID();
  db().prepare(
    'INSERT INTO announcements (id, user_id, content, media_url, media_type) VALUES (?, ?, ?, ?, ?)'
  ).run(id, userId, content, mediaUrl ?? null, mediaType ?? null);
  const row = db().prepare('SELECT * FROM announcements WHERE id = ?').get(id) as AnnouncementRow;
  res.status(201).json(toAnnouncementDTO(row, userId));
}

export function listAnnouncements(req: AuthRequest, res: Response): void {
  const { cursor, limit } = req.query as unknown as ListAnnouncementsQuery;
  const pageSize = limit ?? 20;
  const rows = (cursor
    ? db().prepare(
        'SELECT * FROM announcements WHERE created_at < ? ORDER BY created_at DESC LIMIT ?'
      ).all(cursor, pageSize)
    : db().prepare(
        'SELECT * FROM announcements ORDER BY created_at DESC LIMIT ?'
      ).all(pageSize)
  ) as AnnouncementRow[];

  const items = rows.map((r) => toAnnouncementDTO(r, req.userId));
  const nextCursor = rows.length === pageSize ? rows[rows.length - 1]?.created_at ?? null : null;
  res.json({ items, nextCursor });
}

export function getAnnouncement(req: AuthRequest, res: Response): void {
  const { id } = req.params as unknown as AnnouncementIdParams;
  const row = db().prepare('SELECT * FROM announcements WHERE id = ?').get(id) as AnnouncementRow | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(toAnnouncementDTO(row, req.userId));
}

export function patchAnnouncement(req: AuthRequest, res: Response): void {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }
  const { id } = req.params as unknown as AnnouncementIdParams;
  const patch = req.body as PatchAnnouncementInput;

  const row = db().prepare('SELECT * FROM announcements WHERE id = ?').get(id) as AnnouncementRow | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  if (row.user_id !== userId) { res.status(403).json({ error: 'Only the author can change this post.' }); return; }

  const next = {
    content: patch.content ?? row.content,
    media_url: patch.mediaUrl === undefined ? row.media_url : patch.mediaUrl,
    media_type: patch.mediaType === undefined ? row.media_type : patch.mediaType,
  };
  db().prepare(
    `UPDATE announcements SET content=?, media_url=?, media_type=?, updated_at=datetime('now') WHERE id=?`
  ).run(next.content, next.media_url, next.media_type, id);
  const updated = db().prepare('SELECT * FROM announcements WHERE id = ?').get(id) as AnnouncementRow;
  res.json(toAnnouncementDTO(updated, userId));
}

export function deleteAnnouncement(req: AuthRequest, res: Response): void {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }
  const { id } = req.params as unknown as AnnouncementIdParams;
  const row = db().prepare('SELECT user_id FROM announcements WHERE id = ?').get(id) as { user_id: string } | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  if (row.user_id !== userId) { res.status(403).json({ error: 'Only the author can delete this post.' }); return; }
  db().prepare('DELETE FROM announcements WHERE id = ?').run(id);
  res.status(204).end();
}

export function createComment(req: AuthRequest, res: Response): void {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }
  const { id: announcementId } = req.params as unknown as AnnouncementIdParams;
  const { content } = req.body as CreateCommentInput;
  const exists = db().prepare('SELECT 1 FROM announcements WHERE id = ?').get(announcementId);
  if (!exists) { res.status(404).json({ error: 'Not found' }); return; }
  const id = randomUUID();
  db().prepare(
    'INSERT INTO comments (id, announcement_id, user_id, content) VALUES (?, ?, ?, ?)'
  ).run(id, announcementId, userId, content);
  const row = db().prepare('SELECT * FROM comments WHERE id = ?').get(id) as CommentRow;
  res.status(201).json({
    id: row.id,
    announcementId: row.announcement_id,
    authorId: row.user_id,
    content: row.content,
    createdAt: row.created_at,
    isAuthor: true,
  });
}

export function listComments(req: AuthRequest, res: Response): void {
  const { id: announcementId } = req.params as unknown as AnnouncementIdParams;
  const exists = db().prepare('SELECT 1 FROM announcements WHERE id = ?').get(announcementId);
  if (!exists) { res.status(404).json({ error: 'Not found' }); return; }
  const rows = db().prepare(
    'SELECT * FROM comments WHERE announcement_id = ? ORDER BY created_at ASC'
  ).all(announcementId) as CommentRow[];
  res.json(rows.map((r) => ({
    id: r.id,
    announcementId: r.announcement_id,
    authorId: r.user_id,
    content: r.content,
    createdAt: r.created_at,
    isAuthor: req.userId === r.user_id,
  })));
}

export function deleteComment(req: AuthRequest, res: Response): void {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }
  const { id } = req.params as unknown as AnnouncementIdParams;
  const row = db().prepare('SELECT user_id FROM comments WHERE id = ?').get(id) as { user_id: string } | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  if (row.user_id !== userId) { res.status(403).json({ error: 'Only the author can delete this comment.' }); return; }
  db().prepare('DELETE FROM comments WHERE id = ?').run(id);
  res.status(204).end();
}

export function toggleReaction(req: AuthRequest, res: Response): void {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }
  const { id: announcementId } = req.params as unknown as AnnouncementIdParams;
  const { type } = req.body as ReactInput;

  const exists = db().prepare('SELECT 1 FROM announcements WHERE id = ?').get(announcementId);
  if (!exists) { res.status(404).json({ error: 'Not found' }); return; }

  const existing = db().prepare(
    'SELECT id, type FROM reactions WHERE announcement_id = ? AND user_id = ?'
  ).get(announcementId, userId) as { id: string; type: ReactionType } | undefined;

  let toggled: 'added' | 'removed' | 'switched';
  if (!existing) {
    db().prepare(
      'INSERT INTO reactions (id, announcement_id, user_id, type) VALUES (?, ?, ?, ?)'
    ).run(randomUUID(), announcementId, userId, type);
    toggled = 'added';
  } else if (existing.type === type) {
    db().prepare('DELETE FROM reactions WHERE id = ?').run(existing.id);
    toggled = 'removed';
  } else {
    db().prepare('UPDATE reactions SET type = ? WHERE id = ?').run(type, existing.id);
    toggled = 'switched';
  }

  const { reactions, myReaction } = aggregateReactions(announcementId, userId);
  res.json({ toggled, reactions, myReaction });
}
