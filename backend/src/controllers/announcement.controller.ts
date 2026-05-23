import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import type { AuthRequest } from '../middleware/auth.middleware.js';
import type {
  CreateAnnouncementInput,
  PatchAnnouncementInput,
  ListAnnouncementsQuery,
  CreateCommentInput,
  PatchCommentInput,
  CommentIdParams,
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
  author_name: string | null;
}

interface CommentRow {
  id: string;
  announcement_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  author_name: string | null;
}

const ANNOUNCEMENT_SELECT = `
  SELECT a.id, a.user_id, a.content, a.media_url, a.media_type, a.created_at, a.updated_at,
         f.name AS author_name
  FROM announcements a
  LEFT JOIN families f ON f.user_id = a.user_id
`;

const COMMENT_SELECT = `
  SELECT c.id, c.announcement_id, c.user_id, c.content, c.created_at, c.updated_at,
         f.name AS author_name
  FROM comments c
  LEFT JOIN families f ON f.user_id = c.user_id
`;

function toCommentDTO(row: CommentRow, viewerUserId: string | undefined): Record<string, unknown> {
  return {
    id: row.id,
    announcementId: row.announcement_id,
    authorId: row.user_id,
    authorName: row.author_name,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isAuthor: viewerUserId === row.user_id,
  };
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
    authorName: row.author_name,
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
  const row = db().prepare(`${ANNOUNCEMENT_SELECT} WHERE a.id = ?`).get(id) as AnnouncementRow;
  res.status(201).json(toAnnouncementDTO(row, userId));
}

export function listAnnouncements(req: AuthRequest, res: Response): void {
  const { cursor, limit, familyId } = req.query as unknown as ListAnnouncementsQuery;
  const pageSize = limit ?? 20;

  // family-recent-posts: when `familyId` is provided, resolve it to the owning
  // user_id and filter the feed. Unknown familyId returns an empty page rather
  // than 404 — the FamilyView surface shows the empty state, and the family
  // detail endpoint is the right place to surface a 404 for a missing family.
  let authorUserId: string | null = null;
  if (familyId !== undefined) {
    const fam = db().prepare('SELECT user_id FROM families WHERE id = ?').get(familyId) as { user_id: string } | undefined;
    if (!fam) {
      res.json({ items: [], nextCursor: null });
      return;
    }
    authorUserId = fam.user_id;
  }

  let rows: AnnouncementRow[];
  if (authorUserId !== null && cursor) {
    rows = db().prepare(
      `${ANNOUNCEMENT_SELECT} WHERE a.user_id = ? AND a.created_at < ? ORDER BY a.created_at DESC LIMIT ?`
    ).all(authorUserId, cursor, pageSize) as AnnouncementRow[];
  } else if (authorUserId !== null) {
    rows = db().prepare(
      `${ANNOUNCEMENT_SELECT} WHERE a.user_id = ? ORDER BY a.created_at DESC LIMIT ?`
    ).all(authorUserId, pageSize) as AnnouncementRow[];
  } else if (cursor) {
    rows = db().prepare(
      `${ANNOUNCEMENT_SELECT} WHERE a.created_at < ? ORDER BY a.created_at DESC LIMIT ?`
    ).all(cursor, pageSize) as AnnouncementRow[];
  } else {
    rows = db().prepare(
      `${ANNOUNCEMENT_SELECT} ORDER BY a.created_at DESC LIMIT ?`
    ).all(pageSize) as AnnouncementRow[];
  }

  const items = rows.map((r) => toAnnouncementDTO(r, req.userId));
  const nextCursor = rows.length === pageSize ? rows[rows.length - 1]?.created_at ?? null : null;
  res.json({ items, nextCursor });
}

export function getAnnouncement(req: AuthRequest, res: Response): void {
  const { id } = req.params as unknown as AnnouncementIdParams;
  const row = db().prepare(`${ANNOUNCEMENT_SELECT} WHERE a.id = ?`).get(id) as AnnouncementRow | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(toAnnouncementDTO(row, req.userId));
}

export function patchAnnouncement(req: AuthRequest, res: Response): void {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }
  const { id } = req.params as unknown as AnnouncementIdParams;
  const patch = req.body as PatchAnnouncementInput;

  const row = db().prepare(`${ANNOUNCEMENT_SELECT} WHERE a.id = ?`).get(id) as AnnouncementRow | undefined;
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
  const updated = db().prepare(`${ANNOUNCEMENT_SELECT} WHERE a.id = ?`).get(id) as AnnouncementRow;
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
  const row = db().prepare(`${COMMENT_SELECT} WHERE c.id = ?`).get(id) as CommentRow;
  res.status(201).json(toCommentDTO(row, userId));
}

export function listComments(req: AuthRequest, res: Response): void {
  const { id: announcementId } = req.params as unknown as AnnouncementIdParams;
  const exists = db().prepare('SELECT 1 FROM announcements WHERE id = ?').get(announcementId);
  if (!exists) { res.status(404).json({ error: 'Not found' }); return; }
  const rows = db().prepare(
    `${COMMENT_SELECT} WHERE c.announcement_id = ? ORDER BY c.created_at ASC`
  ).all(announcementId) as CommentRow[];
  res.json(rows.map((r) => toCommentDTO(r, req.userId)));
}

export function patchComment(req: AuthRequest, res: Response): void {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }
  const { id } = req.params as unknown as CommentIdParams;
  const { content } = req.body as PatchCommentInput;

  const row = db().prepare('SELECT user_id FROM comments WHERE id = ?').get(id) as { user_id: string } | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  if (row.user_id !== userId) { res.status(403).json({ error: 'Only the author can edit this comment.' }); return; }

  db().prepare(
    `UPDATE comments SET content = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(content, id);
  const updated = db().prepare(`${COMMENT_SELECT} WHERE c.id = ?`).get(id) as CommentRow;
  res.json(toCommentDTO(updated, userId));
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
