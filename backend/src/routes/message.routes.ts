import { Router } from 'express';
import { sendMessage, listThreads, getThread, markThreadRead, unreadCount } from '../controllers/message.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { SendMessageInput, ThreadParams } from '../schemas/message.schemas.js';

export const messageRouter = Router();
messageRouter.use(authenticate);

messageRouter.post('/', validate(SendMessageInput, 'body'), sendMessage);
messageRouter.get('/threads', listThreads);
messageRouter.get('/unread/count', unreadCount);
messageRouter.get('/threads/:userId', validate(ThreadParams, 'params'), getThread);
messageRouter.post('/threads/:userId/read', validate(ThreadParams, 'params'), markThreadRead);
