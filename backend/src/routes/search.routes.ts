import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { searchFamilies } from '../controllers/search.controller.js';
import { SearchFamiliesQuery } from '../schemas/search.schemas.js';

export const searchRouter = Router();
searchRouter.use(authenticate);
searchRouter.get('/families', validate(SearchFamiliesQuery, 'query'), searchFamilies);
