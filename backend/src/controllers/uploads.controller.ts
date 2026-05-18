import type { Response, Request, NextFunction } from 'express';
import { MulterError } from 'multer';
import type { AuthRequest } from '../middleware/auth.middleware.js';
import { uploadMiddleware } from '../services/uploads.service.js';

export function postUpload(req: AuthRequest, res: Response, next: NextFunction): void {
  uploadMiddleware(req as Request, res, (err: unknown) => {
    if (err instanceof MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: 'Image too large. Max 5 MB.' });
        return;
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        res.status(400).json({ error: 'Only JPEG, PNG, WebP, or GIF images.' });
        return;
      }
      res.status(400).json({ error: err.message });
      return;
    }
    if (err) return next(err);
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded.' });
      return;
    }
    const url = `/uploads/${req.file.filename}`;
    res.status(201).json({ url, mediaType: 'image' });
  });
}
