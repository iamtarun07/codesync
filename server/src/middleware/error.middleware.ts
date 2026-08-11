import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { isProduction } from '../config/env';
import { ApiError } from '../utils/ApiError';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`, 'ROUTE_NOT_FOUND'));
}

interface DuplicateKeyError {
  code: number;
  keyValue?: Record<string, unknown>;
}

function isDuplicateKeyError(err: unknown): err is DuplicateKeyError {
  return typeof err === 'object' && err !== null && (err as DuplicateKeyError).code === 11000;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    const message = err.issues.map((i) => i.message).join('; ');
    return res.status(400).json({ success: false, message, code: 'VALIDATION_ERROR' });
  }

  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      code: err.code,
    });
  }

  if (isDuplicateKeyError(err)) {
    const field = Object.keys(err.keyValue ?? {})[0] ?? 'field';
    return res.status(409).json({
      success: false,
      message: `That ${field} is already in use`,
      code: 'DUPLICATE_KEY',
    });
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const message = Object.values(err.errors)
      .map((e) => e.message)
      .join('; ');
    return res.status(400).json({ success: false, message, code: 'VALIDATION_ERROR' });
  }

  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ success: false, message: 'Invalid identifier', code: 'BAD_ID' });
  }

  // Unknown failure: log it, but never leak internals to the client.
  console.error('[error]', err);
  return res.status(500).json({
    success: false,
    message: isProduction ? 'Something went wrong' : String(err),
    code: 'INTERNAL_ERROR',
  });
}
