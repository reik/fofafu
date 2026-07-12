import type { NextFunction, Request, Response } from 'express';

/**
 * Wraps an async Express handler so a rejected promise is forwarded to
 * `next(err)` instead of crashing the process — Express 4 does not await
 * handlers itself. Every controller became async when the DB layer moved
 * from synchronous better-sqlite3 to async `pg` queries; routes must use
 * this wrapper instead of passing the controller directly.
 */
export function asyncHandler<Req extends Request = Request>(
  fn: (req: Req, res: Response, next: NextFunction) => Promise<void> | void
) {
  return (req: Req, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
