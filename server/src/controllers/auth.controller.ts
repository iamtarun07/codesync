import jwt from 'jsonwebtoken';
import type { CookieOptions, Request, Response } from 'express';
import { User, toSafeUser } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { AUTH_COOKIE, signToken } from '../utils/jwt';
import { isProduction } from '../config/env';
import { currentUser } from '../middleware/auth.middleware';
import type { LoginInput, RegisterInput } from '../validation/schemas';

const BASE_COOKIE: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  // Dev runs client:5173 and server:5000 — same site, different origin, so
  // 'lax' works. Cross-site production deployments need 'none' + HTTPS.
  sameSite: isProduction ? 'none' : 'lax',
  path: '/',
};

function issueSession(res: Response, userId: string) {
  const token = signToken(userId);
  const decoded = jwt.decode(token);
  const maxAge =
    typeof decoded === 'object' && decoded?.exp ? decoded.exp * 1000 - Date.now() : 7 * 864e5;
  res.cookie(AUTH_COOKIE, token, { ...BASE_COOKIE, maxAge });
}

export async function register(req: Request, res: Response) {
  const { username, email, password } = req.body as RegisterInput;

  const existing = await User.findOne({ email });
  if (existing) throw ApiError.conflict('That email is already registered', 'EMAIL_TAKEN');

  const user = await User.create({ username, email, password });
  issueSession(res, user._id.toString());

  res.status(201).json({ success: true, data: { user: toSafeUser(user) } });
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body as LoginInput;

  // Same message for "no such user" and "wrong password": no account enumeration.
  const user = await User.findOne({ email }).select('+password');
  if (!user) throw ApiError.unauthorized('Invalid credentials', 'INVALID_CREDENTIALS');

  const matches = await user.comparePassword(password);
  if (!matches) throw ApiError.unauthorized('Invalid credentials', 'INVALID_CREDENTIALS');

  issueSession(res, user._id.toString());
  res.json({ success: true, data: { user: toSafeUser(user) } });
}

export async function me(req: Request, res: Response) {
  res.json({ success: true, data: { user: toSafeUser(currentUser(req)) } });
}

export async function logout(_req: Request, res: Response) {
  res.clearCookie(AUTH_COOKIE, BASE_COOKIE);
  res.json({ success: true, data: { loggedOut: true } });
}
