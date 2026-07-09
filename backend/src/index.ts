import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { apiRouter } from './routes/index.js';
import { runMigrations } from './migrate.js';
import { UPLOAD_DIR_ABSOLUTE } from './services/uploads.service.js';
import { assertCoachBootPreconditions } from './services/coach/bootCheck.js';

export function buildApp(): express.Express {
  const app = express();
  // helmet's CSP blocks cross-origin <img> by default; relax for static uploads in dev.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' }));
  app.use(express.json({ limit: '1mb' }));
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false }));
  app.get('/health', (_req, res) => { res.json({ ok: true }); });
  app.use('/uploads', express.static(UPLOAD_DIR_ABSOLUTE, { maxAge: '7d', fallthrough: false }));
  app.use('/api', apiRouter);
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[unhandled]', err);
    if (!res.headersSent) res.status(500).json({ error: 'Something went wrong on our end.' });
  });
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  assertCoachBootPreconditions();
  runMigrations();
  const port = Number(process.env.PORT ?? 4000);
  buildApp().listen(port, () => {
    console.log(`fofafu backend listening on :${port}`);
  });
}
