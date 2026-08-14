import type { NextFunction, Request, Response } from 'express';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { AUTH_COOKIE, verifyToken } from '../utils/jwt';

/**
 * Every place the token can arrive, cookie first.
 *
 * All candidates are returned rather than just the first present one: a stale
 * cookie alongside a fresh Bearer header must not fail the request. The Bearer
 * header is also the only channel that works when the browser blocks the
 * cross-site auth cookie.
 */
function extractTokens(req: Request): string[] {
  const candidates: string[] = [];

  const cookieToken = req.cookies?.[AUTH_COOKIE];
  if (typeof cookieToken === 'string' && cookieToken.length > 0) candidates.push(cookieToken);

  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) candidates.push(header.slice(7));

  return candidates;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const tokens = extractTokens(req);
    if (tokens.length === 0) throw ApiError.unauthorized();

    const userId = tokens.map(verifyToken).find((id): id is string => id !== null) ?? null;
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
