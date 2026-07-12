import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getRecent } from '../controllers/community.controller.js';
import { RecentCommunityQuery } from '../schemas/community.schemas.js';

export const communityRouter = Router();
communityRouter.use(authenticate);
communityRouter.get('/recent', validate(RecentCommunityQuery, 'query'), asyncHandler(getRecent));
