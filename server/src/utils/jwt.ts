import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';

export const AUTH_COOKIE = 'codesync_token';

/** Minimal payload: the subject is the only claim we control. */
export function signToken(userId: string): string {
  const options: SignOptions = {
    subject: userId,
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  };
  return jwt.sign({}, env.JWT_SECRET, options);
}

/** Returns the user id, or null when the token is missing/expired/forged. */
export function verifyToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    if (typeof payload === 'string' || !payload.sub) return null;
    return payload.sub;
  } catch {
    return null;
  }
}
