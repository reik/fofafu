import { Router } from 'express';
import { register, verifyEmail, login } from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.middleware.js';
import { RegisterInput, LoginInput, VerifyQuery } from '../schemas/auth.schemas.js';

export const authRouter = Router();

authRouter.post('/register', validate(RegisterInput, 'body'), register);
authRouter.get('/verify', validate(VerifyQuery, 'query'), verifyEmail);
authRouter.post('/login', validate(LoginInput, 'body'), login);
