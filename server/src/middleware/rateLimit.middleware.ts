import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

/**
 * Brute force is the only realistic attack surface on this app, so the limiter
 * sits on /api/auth only. Editor traffic is high-frequency by design and runs
 * over Socket.IO, which is rate-limited separately (chat) or not at all (Yjs).
 */
export const authLimiter = rateLimit({
  windowMs: 60_000,
  limit: env.NODE_ENV === 'test' ? 1000 : 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many attempts, please try again in a minute',
    code: 'RATE_LIMITED',
  },
});

/**
 * Coarse ceiling for the whole REST surface, so a single client cannot hammer
 * the API. Deliberately generous: the dashboard, room open and chat history are
 * the only REST calls a session makes, and editor traffic is Socket.IO.
 */
export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: env.NODE_ENV === 'test' ? 10_000 : 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests, please slow down',
    code: 'RATE_LIMITED',
  },
});

/**
 * Room passwords are equally brute-forceable, but they get their own counter:
 * sharing the auth one would mean guessing a room password locks the user out
 * of logging in.
 */
export const roomPasswordLimiter = rateLimit({
  windowMs: 60_000,
  limit: env.NODE_ENV === 'test' ? 1000 : 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many password attempts, please try again in a minute',
    code: 'RATE_LIMITED',
  },
});
