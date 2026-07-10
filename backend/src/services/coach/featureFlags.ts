/**
 * Minimal env-flag module scoped to the reply coach.
 *
 * Reads the env on each call (no caching) so tests can flip the flag between
 * cases without restarting the app. Production-side this is a single string
 * comparison; the cost is negligible.
 *
 * When new flags arrive, extend this module — do not scatter `process.env.*`
 * reads through controllers.
 */

export function isReplyCoachEnabled(): boolean {
  return process.env.REPLY_COACH_ENABLED === 'true';
}

/**
 * reply-coach-live: gates the swap from `MockClaudeClient` to
 * `LiveClaudeClient`. Independent of `isReplyCoachEnabled` (which gates the
 * whole endpoint) — this one only decides which client backs it.
 */
export function isReplyCoachLiveEnabled(): boolean {
  return process.env.REPLY_COACH_LIVE_ENABLED === 'true';
}
