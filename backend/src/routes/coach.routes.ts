import { Router, type Request, type Response, type NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { CoachInput } from '../schemas/coach.schemas.js';
import { coachComment } from '../controllers/coach.controller.js';
import { isReplyCoachEnabled } from '../services/coach/featureFlags.js';

/**
 * Flag-gate middleware. Returns 404 (not 403) when the flag is off so the
 * frontend can no-op cleanly without distinguishing "feature not built"
 * from "feature disabled". Runs BEFORE auth so anonymous probes also get
 * a clean 404.
 */
function requireCoachEnabled(_req: Request, res: Response, next: NextFunction): void {
  if (!isReplyCoachEnabled()) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  next();
}

export const coachRouter = Router();

coachRouter.post(
  '/',
  requireCoachEnabled,
  authenticate,
  validate(CoachInput, 'body'),
  coachComment,
);
