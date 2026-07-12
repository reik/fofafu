import { Router } from 'express';
import {
  createAnnouncement,
  listAnnouncements,
  getAnnouncement,
  patchAnnouncement,
  deleteAnnouncement,
  createComment,
  listComments,
  patchComment,
  deleteComment,
  toggleReaction,
} from '../controllers/announcement.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  CreateAnnouncementInput,
  PatchAnnouncementInput,
  ListAnnouncementsQuery,
  CreateCommentInput,
  PatchCommentInput,
  CommentIdParams,
  ReactInput,
  AnnouncementIdParams,
} from '../schemas/announcement.schemas.js';

export const announcementRouter = Router();

announcementRouter.use(authenticate);

announcementRouter.post('/', validate(CreateAnnouncementInput, 'body'), asyncHandler(createAnnouncement));
announcementRouter.get('/', validate(ListAnnouncementsQuery, 'query'), asyncHandler(listAnnouncements));
announcementRouter.get('/:id', validate(AnnouncementIdParams, 'params'), asyncHandler(getAnnouncement));
announcementRouter.patch('/:id', validate(AnnouncementIdParams, 'params'), validate(PatchAnnouncementInput, 'body'), asyncHandler(patchAnnouncement));
announcementRouter.delete('/:id', validate(AnnouncementIdParams, 'params'), asyncHandler(deleteAnnouncement));

announcementRouter.get('/:id/comments', validate(AnnouncementIdParams, 'params'), asyncHandler(listComments));
announcementRouter.post('/:id/comments', validate(AnnouncementIdParams, 'params'), validate(CreateCommentInput, 'body'), asyncHandler(createComment));

announcementRouter.post('/:id/reactions', validate(AnnouncementIdParams, 'params'), validate(ReactInput, 'body'), asyncHandler(toggleReaction));

export const commentRouter = Router();
commentRouter.use(authenticate);
commentRouter.patch('/:id', validate(CommentIdParams, 'params'), validate(PatchCommentInput, 'body'), asyncHandler(patchComment));
commentRouter.delete('/:id', validate(CommentIdParams, 'params'), asyncHandler(deleteComment));
