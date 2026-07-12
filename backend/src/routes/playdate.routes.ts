import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  AvailabilitySlotInput,
  AvailabilitySlotPatch,
  AvailabilityFamilyParams,
  SlotIdParams,
  PlaydateRequestInput,
  PlaydateRequestIdParams,
  PlaydateRequestRespondInput,
} from '../schemas/playdates.schemas.js';
import {
  getAvailability,
  addSlot,
  updateSlot,
  deleteSlot,
  getRequests,
  createRequest,
  respondToRequest,
} from '../controllers/playdates.controller.js';

export const playdateRouter = Router();
playdateRouter.use(authenticate);

// Availability slots
playdateRouter.get(
  '/availability/:familyId',
  validate(AvailabilityFamilyParams, 'params'),
  asyncHandler(getAvailability),
);
playdateRouter.post(
  '/availability',
  validate(AvailabilitySlotInput, 'body'),
  asyncHandler(addSlot),
);
playdateRouter.put(
  '/availability/:id',
  validate(SlotIdParams, 'params'),
  validate(AvailabilitySlotPatch, 'body'),
  asyncHandler(updateSlot),
);
playdateRouter.delete(
  '/availability/:id',
  validate(SlotIdParams, 'params'),
  asyncHandler(deleteSlot),
);

// Playdate requests
playdateRouter.get('/requests', asyncHandler(getRequests));
playdateRouter.post(
  '/requests',
  validate(PlaydateRequestInput, 'body'),
  asyncHandler(createRequest),
);
playdateRouter.put(
  '/requests/:id/respond',
  validate(PlaydateRequestIdParams, 'params'),
  validate(PlaydateRequestRespondInput, 'body'),
  asyncHandler(respondToRequest),
);
