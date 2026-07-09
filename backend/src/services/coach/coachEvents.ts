import { db } from '../../db.js';

/**
 * Aggregate-only analytics write for the Reply Coach, per
 * `fofafu_vault/features/reply-coach-live.md` acceptance criteria: "No
 * draft, rewrite, or reasoning text persisted." The `coach_events` table
 * (see `migrate.ts`) has exactly the columns this row shape uses — there is
 * no free-text field to accidentally leak a draft into.
 */
export interface CoachEventRow {
  id: string;
  user_id: string;
  verdict: 'ok' | 'suggest';
  category: string | null;
  outcome: 'shown' | 'accepted' | 'edited' | 'dismissed' | 'none';
}

export function recordCoachEvent(row: {
  id: string;
  user_id: string;
  verdict: string;
  category?: string | null;
  outcome?: string;
}): void {
  db()
    .prepare(
      `INSERT INTO coach_events (id, user_id, verdict, category, outcome)
       VALUES (@id, @user_id, @verdict, @category, @outcome)`,
    )
    .run({
      id: row.id,
      user_id: row.user_id,
      verdict: row.verdict,
      category: row.category ?? null,
      outcome: row.outcome ?? 'none',
    });
}
