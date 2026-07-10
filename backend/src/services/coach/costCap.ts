/**
 * Per-org daily spend cap for the live Reply Coach ($5/day, per
 * `fofafu_vault/features/reply-coach-live.md` acceptance criteria).
 *
 * Simplification (noted in the feature's `### Backend` subsection): this is
 * an in-memory, single-process counter, not a persisted/cross-instance one.
 * That matches the rest of the coach's rate-limit/holdback state (see
 * `rateLimit.ts`) and is acceptable for v1 single-instance deployment. The
 * counter resets whenever the UTC calendar day rolls over, tracked lazily —
 * no cron job, just a day-key comparison on each call.
 */

const CAP_USD = 5;

let dayKey = utcDayKey();
let spentUsd = 0;

function utcDayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

function rollIfNewDay(): void {
  const today = utcDayKey();
  if (today !== dayKey) {
    dayKey = today;
    spentUsd = 0;
  }
}

export function recordCoachSpend(usd: number): void {
  rollIfNewDay();
  spentUsd += usd;
}

export function isCoachCostCapExceeded(): boolean {
  rollIfNewDay();
  return spentUsd >= CAP_USD;
}

/** Test-only: resets the in-memory counter and day key. */
export function resetCoachCostCapForTests(): void {
  dayKey = utcDayKey();
  spentUsd = 0;
}

export const COACH_DAILY_COST_CAP_USD = CAP_USD;
