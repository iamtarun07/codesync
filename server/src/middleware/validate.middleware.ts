import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny } from 'zod';

type Source = 'body' | 'query' | 'params';

/**
 * Parses req[source] with the schema and replaces it with the parsed result,
 * so controllers only ever see validated, coerced, trimmed data.
 */
export function validate(schema: ZodTypeAny, source: Source = 'body'): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) return next(result.error);
    // req.query/params are getter-only in some Express versions; assign defensively.
    Object.defineProperty(req, source, { value: result.data, writable: true, configurable: true });
    next();
  };
}
