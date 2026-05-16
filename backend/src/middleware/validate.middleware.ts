import type { Request, Response, NextFunction } from 'express';
import type { ZodTypeAny } from 'zod';

type Source = 'body' | 'query' | 'params';

export function validate(schema: ZodTypeAny, source: Source = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      res.status(400).json({ error: 'Validation failed', fields: fieldErrors });
      return;
    }
    // Replace with parsed (coerced) value.
    (req as unknown as Record<Source, unknown>)[source] = result.data;
    next();
  };
}
