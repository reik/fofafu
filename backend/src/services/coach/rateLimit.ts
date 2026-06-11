/**
 * Per-user in-memory rate limit for the coach endpoint.
 *
 * Rolling 60-minute window, 60 calls/user — matches the AC in
 * `vault/features/reply-coach.md`. Scoped to this route on purpose: the
 * generic `express-rate-limit` middleware is mounted at the app level for
 * the default 200 req/15min IP budget; the coach needs a per-USER budget
 * (one author across multiple tabs/sessions) and a separate horizon.
 *
 * Stored in process memory — fine for single-instance v1. When we scale
 * horizontally (post-`reply-coach-live`) this swaps to Redis or similar
 * without changing the call site.
 */

const WINDOW_MS = 60 * 60 * 1000;
const MAX_CALLS = 60;

const buckets = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  /** Approximate seconds until the oldest in-window call ages out. Only meaningful when `allowed` is false. */
  retryAfterSeconds: number;
}

export function consumeCoachCall(userId: string, now: number = Date.now()): RateLimitResult {
  const cutoff = now - WINDOW_MS;
  const existing = buckets.get(userId) ?? [];
  // Drop expired stamps. Stamps are append-only and roughly monotonic,
  // so a simple filter is correct and bounded by MAX_CALLS in size.
  const fresh = existing.filter((ts) => ts > cutoff);
  if (fresh.length >= MAX_CALLS) {
    const oldest = fresh[0] ?? now;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000));
    buckets.set(userId, fresh);
    return { allowed: false, retryAfterSeconds };
  }
  fresh.push(now);
  buckets.set(userId, fresh);
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Test-only: clears the in-memory state between tests. */
export function resetCoachRateLimitForTests(): void {
  buckets.clear();
}

export const COACH_RATE_LIMIT_MAX = MAX_CALLS;
export const COACH_RATE_LIMIT_WINDOW_MS = WINDOW_MS;
