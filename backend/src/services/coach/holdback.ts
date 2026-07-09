/**
 * 50/50 holdback experiment bucketing for the live Reply Coach, per
 * `fofafu_vault/features/reply-coach-live.md` acceptance criteria
 * ("8-week minimum read horizon").
 *
 * Deterministic, stateless hash of `userId` -> {0, 1} bucket. No randomness,
 * no storage: the same user always lands in the same arm for the life of
 * the experiment, and the split is even across the user population (verified
 * by a 2000-id ratio test in `tests/coach-live.test.ts`).
 *
 * Users landing in the holdback (control) arm never see live coaching —
 * callers route them to the same silent `verdict: 'ok'` fallback as a
 * flag-off or cap-exceeded state.
 */

function hashUserId(userId: string): number {
  // FNV-1a 32-bit — simple, fast, well-distributed for short ASCII strings.
  let hash = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0; // unsigned 32-bit
}

export function isInHoldback(userId: string): boolean {
  return hashUserId(userId) % 2 === 0;
}
