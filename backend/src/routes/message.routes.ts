import { Router } from 'express';
import { sendMessage, listThreads, getThread, markThreadRead, unreadCount } from '../controllers/message.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { SendMessageInput, ThreadParams } from '../schemas/message.schemas.js';

export const messageRouter = Router();
messageRouter.use(authenticate);

messageRouter.post('/', validate(SendMessageInput, 'body'), asyncHandler(sendMessage));
messageRouter.get('/threads', asyncHandler(listThreads));
messageRouter.get('/unread/count', asyncHandler(unreadCount));
messageRouter.get('/threads/:userId', validate(ThreadParams, 'params'), asyncHandler(getThread));
messageRouter.post('/threads/:userId/read', validate(ThreadParams, 'params'), asyncHandler(markThreadRead));
