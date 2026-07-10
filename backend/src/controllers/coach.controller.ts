import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.middleware.js';
import type { CoachInput, CoachResponse } from '../schemas/coach.schemas.js';
import { isReplyCoachEnabled } from '../services/coach/featureFlags.js';
import { getClaudeClient } from '../services/coach/claudeClient.js';
import { consumeCoachCall } from '../services/coach/rateLimit.js';
import { logger } from '../utils/logger.js';

/**
 * Silent-fallback shape, returned on Claude failure so the composer never
 * blocks publish. Mirrors fixture A but is named here to make the intent at
 * the call site explicit.
 */
const SILENT_FALLBACK: CoachResponse = {
  verdict: 'ok',
  categories: [],
  reasoning: '',
  rewrite: null,
};

export async function coachComment(req: AuthRequest, res: Response): Promise<void> {
  // Defense-in-depth: the route already short-circuits when the flag is off,
  // but this guards against direct controller invocation in tests.
  if (!isReplyCoachEnabled()) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  // Rate-limit slot is consumed BEFORE the try/catch on purpose — client failures (timeouts, 5xx) count against the user's quota by design.
  const limit = consumeCoachCall(userId);
  if (!limit.allowed) {
    res.setHeader('Retry-After', String(limit.retryAfterSeconds));
    res.status(429).json({ error: 'Rate limit exceeded' });
    return;
  }

  const input = req.body as CoachInput;

  try {
    const result = await getClaudeClient(userId).coach(input);
    res.status(200).json(result);
  } catch (err) {
    // Never log the draft, threadContext, or any user-supplied field — only
    // the error class/message. The real `LiveClaudeClient` (reply-coach-live)
    // will throw on timeouts and 5xx; the composer must still publish.
    const message = err instanceof Error ? err.message : 'unknown error';
    logger.warn({ msg: 'coach client failure', message });
    res.status(200).json(SILENT_FALLBACK);
  }
}
