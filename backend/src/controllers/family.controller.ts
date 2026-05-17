import type { Response } from 'express';
import { db } from '../db.js';
import type { AuthRequest } from '../middleware/auth.middleware.js';
import type { FamilyPatch, FamilyIdParams } from '../schemas/family.schemas.js';

interface FamilyRow {
  id: string;
  user_id: string;
  name: string;
  bio: string;
  kid_count: number | null;
  created_at: string;
  updated_at: string;
}

function toFamilyDTO(row: FamilyRow, viewerUserId: string | undefined): Record<string, unknown> {
  const isOwner = viewerUserId === row.user_id;
  return {
    id: row.id,
    name: row.name,
    bio: row.bio,
    kidCount: isOwner ? row.kid_count : null,
    isOwner,
    updatedAt: row.updated_at,
  };
}

export function getMyFamily(req: AuthRequest, res: Response): void {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const row = db().prepare('SELECT * FROM families WHERE user_id = ?').get(userId) as FamilyRow | undefined;
  if (!row) {
    res.status(404).json({ error: 'Family not found' });
    return;
  }
  res.json(toFamilyDTO(row, userId));
}

export function getFamily(req: AuthRequest, res: Response): void {
  const { id } = req.params as unknown as FamilyIdParams;
  const row = db().prepare('SELECT * FROM families WHERE id = ?').get(id) as FamilyRow | undefined;
  if (!row) {
    res.status(404).json({ error: 'Family not found' });
    return;
  }
  res.json(toFamilyDTO(row, req.userId));
}

export function patchFamily(req: AuthRequest, res: Response): void {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const patch = req.body as FamilyPatch;

  const row = db().prepare('SELECT * FROM families WHERE user_id = ?').get(userId) as FamilyRow | undefined;
  if (!row) {
    res.status(404).json({ error: 'Family not found' });
    return;
  }

  const next = {
    name: patch.name ?? row.name,
    bio: patch.bio ?? row.bio,
    kid_count: patch.kidCount === undefined ? row.kid_count : patch.kidCount,
  };

  db().prepare(
    `UPDATE families
     SET name = ?, bio = ?, kid_count = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(next.name, next.bio, next.kid_count, row.id);

  const updated = db().prepare('SELECT * FROM families WHERE id = ?').get(row.id) as FamilyRow;
  res.json(toFamilyDTO(updated, userId));
}
