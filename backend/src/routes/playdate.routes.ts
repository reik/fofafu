import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
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
  getAvailability,
);
playdateRouter.post(
  '/availability',
  validate(AvailabilitySlotInput, 'body'),
  addSlot,
);
playdateRouter.put(
  '/availability/:id',
  validate(SlotIdParams, 'params'),
  validate(AvailabilitySlotPatch, 'body'),
  updateSlot,
);
playdateRouter.delete(
  '/availability/:id',
  validate(SlotIdParams, 'params'),
  deleteSlot,
);

// Playdate requests
playdateRouter.get('/requests', getRequests);
playdateRouter.post(
  '/requests',
  validate(PlaydateRequestInput, 'body'),
  createRequest,
);
playdateRouter.put(
  '/requests/:id/respond',
  validate(PlaydateRequestIdParams, 'params'),
  validate(PlaydateRequestRespondInput, 'body'),
  respondToRequest,
);
