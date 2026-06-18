import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import type { AuthRequest } from '../middleware/auth.middleware.js';
import type {
  AvailabilitySlotInput,
  AvailabilitySlotPatch,
  PlaydateRequestInput,
  PlaydateRequestRespondInput,
} from '../schemas/playdates.schemas.js';

// ── DB row shapes ─────────────────────────────────────────────────────────────

interface SlotRow {
  id: string;
  family_id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: 'free' | 'busy';
  note: string | null;
  created_at: string;
  updated_at: string;
}

interface RequestRow {
  id: string;
  slot_id: string;
  requester_family_id: string;
  owner_family_id: string;
  message: string | null;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  updated_at: string;
  requester_name: string | null;
  owner_name: string | null;
  slot_date: string;
  slot_start_time: string;
  slot_end_time: string;
}

// ── DTO helpers ───────────────────────────────────────────────────────────────

function toSlotDTO(row: SlotRow): Record<string, unknown> {
  return {
    id: row.id,
    familyId: row.family_id,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    status: row.status,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRequestDTO(row: RequestRow): Record<string, unknown> {
  return {
    id: row.id,
    slotId: row.slot_id,
    requesterFamilyId: row.requester_family_id,
    ownerFamilyId: row.owner_family_id,
    message: row.message,
    status: row.status,
    requesterName: row.requester_name,
    ownerName: row.owner_name,
    slotDate: row.slot_date,
    slotStartTime: row.slot_start_time,
    slotEndTime: row.slot_end_time,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// JOIN query reused across request reads
const REQUEST_SELECT = `
  SELECT
    pr.*,
    rf.name  AS requester_name,
    of_.name AS owner_name,
    s.date       AS slot_date,
    s.start_time AS slot_start_time,
    s.end_time   AS slot_end_time
  FROM playdate_requests pr
  JOIN families rf   ON rf.id   = pr.requester_family_id
  JOIN families of_  ON of_.id  = pr.owner_family_id
  JOIN availability_slots s ON s.id = pr.slot_id
`;

// ── Helper: resolve family row id from JWT userId ─────────────────────────────

function getFamilyId(userId: string): string | null {
  const row = db().prepare('SELECT id FROM families WHERE user_id = ?').get(userId) as
    | { id: string }
    | undefined;
  return row?.id ?? null;
}

// ── GET /playdates/availability/:familyId ─────────────────────────────────────

export function getAvailability(req: AuthRequest, res: Response): void {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }

  const { familyId } = req.params;
  const myFamilyId = getFamilyId(userId);
  const isSelf = myFamilyId === familyId;

  const rows = isSelf
    ? (db()
        .prepare('SELECT * FROM availability_slots WHERE family_id = ? ORDER BY date, start_time')
        .all(familyId) as SlotRow[])
    : (db()
        .prepare(
          "SELECT * FROM availability_slots WHERE family_id = ? AND status = 'free' ORDER BY date, start_time",
        )
        .all(familyId) as SlotRow[]);

  res.json(rows.map(toSlotDTO));
}

// ── POST /playdates/availability ──────────────────────────────────────────────

export function addSlot(req: AuthRequest, res: Response): void {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }

  const familyId = getFamilyId(userId);
  if (!familyId) { res.status(404).json({ error: 'Family not found' }); return; }

  const { date, startTime, endTime, status = 'free', note } = req.body as AvailabilitySlotInput;
  const id = randomUUID();

  db()
    .prepare(
      `INSERT INTO availability_slots (id, family_id, date, start_time, end_time, status, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, familyId, date, startTime, endTime, status, note ?? null);

  const slot = db()
    .prepare('SELECT * FROM availability_slots WHERE id = ?')
    .get(id) as SlotRow;
  res.status(201).json(toSlotDTO(slot));
}

// ── PUT /playdates/availability/:id ───────────────────────────────────────────

export function updateSlot(req: AuthRequest, res: Response): void {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }

  const { id } = req.params;
  const slot = db()
    .prepare('SELECT * FROM availability_slots WHERE id = ?')
    .get(id) as SlotRow | undefined;
  if (!slot) { res.status(404).json({ error: 'Slot not found' }); return; }

  const myFamilyId = getFamilyId(userId);
  if (slot.family_id !== myFamilyId) { res.status(403).json({ error: 'Forbidden' }); return; }

  const { date, startTime, endTime, status, note } = req.body as AvailabilitySlotPatch;

  db()
    .prepare(
      `UPDATE availability_slots
       SET date = ?, start_time = ?, end_time = ?, status = ?, note = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(
      date ?? slot.date,
      startTime ?? slot.start_time,
      endTime ?? slot.end_time,
      status ?? slot.status,
      note !== undefined ? note : slot.note,
      id,
    );

  const updated = db()
    .prepare('SELECT * FROM availability_slots WHERE id = ?')
    .get(id) as SlotRow;
  res.json(toSlotDTO(updated));
}

// ── DELETE /playdates/availability/:id ────────────────────────────────────────

export function deleteSlot(req: AuthRequest, res: Response): void {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }

  const { id } = req.params;
  const slot = db()
    .prepare('SELECT * FROM availability_slots WHERE id = ?')
    .get(id) as SlotRow | undefined;
  if (!slot) { res.status(404).json({ error: 'Slot not found' }); return; }

  const myFamilyId = getFamilyId(userId);
  if (slot.family_id !== myFamilyId) { res.status(403).json({ error: 'Forbidden' }); return; }

  db().prepare('DELETE FROM availability_slots WHERE id = ?').run(id);
  res.json({ success: true });
}

// ── GET /playdates/requests ───────────────────────────────────────────────────

export function getRequests(req: AuthRequest, res: Response): void {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }

  const myFamilyId = getFamilyId(userId);
  if (!myFamilyId) { res.json([]); return; }

  const rows = db()
    .prepare(
      `${REQUEST_SELECT}
       WHERE pr.requester_family_id = ? OR pr.owner_family_id = ?
       ORDER BY pr.created_at DESC`,
    )
    .all(myFamilyId, myFamilyId) as RequestRow[];

  res.json(rows.map(toRequestDTO));
}

// ── POST /playdates/requests ──────────────────────────────────────────────────

export function createRequest(req: AuthRequest, res: Response): void {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }

  const myFamilyId = getFamilyId(userId);
  if (!myFamilyId) { res.status(404).json({ error: 'Family not found' }); return; }

  const { slotId, message } = req.body as PlaydateRequestInput;

  const slot = db()
    .prepare("SELECT * FROM availability_slots WHERE id = ? AND status = 'free'")
    .get(slotId) as SlotRow | undefined;
  if (!slot) { res.status(404).json({ error: 'Slot not found or not available' }); return; }
  if (slot.family_id === myFamilyId) { res.status(400).json({ error: 'Cannot request your own slot' }); return; }

  const existing = db()
    .prepare(
      "SELECT id FROM playdate_requests WHERE requester_family_id = ? AND slot_id = ? AND status = 'pending'",
    )
    .get(myFamilyId, slotId);
  if (existing) { res.status(400).json({ error: 'You already have a pending request for this slot' }); return; }

  const id = randomUUID();
  db()
    .prepare(
      `INSERT INTO playdate_requests (id, slot_id, requester_family_id, owner_family_id, message)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(id, slotId, myFamilyId, slot.family_id, message ?? null);

  const row = db()
    .prepare(`${REQUEST_SELECT} WHERE pr.id = ?`)
    .get(id) as RequestRow;
  res.status(201).json(toRequestDTO(row));
}

// ── PUT /playdates/requests/:id/respond ──────────────────────────────────────

export function respondToRequest(req: AuthRequest, res: Response): void {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }

  const { id } = req.params;
  const request = db()
    .prepare('SELECT * FROM playdate_requests WHERE id = ?')
    .get(id) as RequestRow | undefined;
  if (!request) { res.status(404).json({ error: 'Request not found' }); return; }

  const myFamilyId = getFamilyId(userId);
  if (request.owner_family_id !== myFamilyId) { res.status(403).json({ error: 'Forbidden' }); return; }
  if (request.status !== 'pending') { res.status(400).json({ error: 'Request already resolved' }); return; }

  const { status } = req.body as PlaydateRequestRespondInput;
  db()
    .prepare("UPDATE playdate_requests SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, id);

  const updated = db()
    .prepare(`${REQUEST_SELECT} WHERE pr.id = ?`)
    .get(id) as RequestRow;
  res.json(toRequestDTO(updated));
}
