import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { postUpload } from '../controllers/uploads.controller.js';

export const uploadsRouter = Router();
uploadsRouter.use(authenticate);
uploadsRouter.post('/', postUpload);
