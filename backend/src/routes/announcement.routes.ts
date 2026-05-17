import { Router } from 'express';
import {
  createAnnouncement,
  listAnnouncements,
  getAnnouncement,
  patchAnnouncement,
  deleteAnnouncement,
  createComment,
  listComments,
  deleteComment,
  toggleReaction,
} from '../controllers/announcement.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  CreateAnnouncementInput,
  PatchAnnouncementInput,
  ListAnnouncementsQuery,
  CreateCommentInput,
  ReactInput,
  AnnouncementIdParams,
} from '../schemas/announcement.schemas.js';

export const announcementRouter = Router();

announcementRouter.use(authenticate);

announcementRouter.post('/', validate(CreateAnnouncementInput, 'body'), createAnnouncement);
announcementRouter.get('/', validate(ListAnnouncementsQuery, 'query'), listAnnouncements);
announcementRouter.get('/:id', validate(AnnouncementIdParams, 'params'), getAnnouncement);
announcementRouter.patch('/:id', validate(AnnouncementIdParams, 'params'), validate(PatchAnnouncementInput, 'body'), patchAnnouncement);
announcementRouter.delete('/:id', validate(AnnouncementIdParams, 'params'), deleteAnnouncement);

announcementRouter.get('/:id/comments', validate(AnnouncementIdParams, 'params'), listComments);
announcementRouter.post('/:id/comments', validate(AnnouncementIdParams, 'params'), validate(CreateCommentInput, 'body'), createComment);

announcementRouter.post('/:id/reactions', validate(AnnouncementIdParams, 'params'), validate(ReactInput, 'body'), toggleReaction);

export const commentRouter = Router();
commentRouter.use(authenticate);
commentRouter.delete('/:id', validate(AnnouncementIdParams, 'params'), deleteComment);
