import { Router } from 'express';
import { getMyFamily, getFamily, patchFamily } from '../controllers/family.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { FamilyPatch, FamilyIdParams } from '../schemas/family.schemas.js';

export const familyRouter = Router();

familyRouter.get('/me', authenticate, asyncHandler(getMyFamily));
familyRouter.patch('/me', authenticate, validate(FamilyPatch, 'body'), asyncHandler(patchFamily));
familyRouter.get('/:id', authenticate, validate(FamilyIdParams, 'params'), asyncHandler(getFamily));
