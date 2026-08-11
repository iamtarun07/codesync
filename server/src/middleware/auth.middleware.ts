import type { NextFunction, Request, Response } from 'express';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { AUTH_COOKIE, verifyToken } from '../utils/jwt';

function extractToken(req: Request): string | null {
  const cookieToken = req.cookies?.[AUTH_COOKIE];
  if (typeof cookieToken === 'string' && cookieToken.length > 0) return cookieToken;

  // Bearer fallback keeps Postman/socket testing simple without weakening cookies.
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);

  return null;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = extractToken(req);
    if (!token) throw ApiError.unauthorized();

    const userId = verifyToken(token);
    if (!userId)
      throw ApiError.unauthorized('Session expired, please log in again', 'TOKEN_INVALID');

    const user = await User.findById(userId);
    if (!user) throw ApiError.unauthorized('Account no longer exists', 'USER_NOT_FOUND');

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Narrowing helper so controllers do not repeat the non-null assertion. */
export function currentUser(req: Request) {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}
