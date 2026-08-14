import * as cookie from 'cookie';
import { User } from '../models/User';
import { AUTH_COOKIE, verifyToken } from '../utils/jwt';
import type { AppSocket } from '../types/socket.types';

/** Cookie first, then the explicit handshake token; a stale cookie must not
 * shadow a valid handshake token. The handshake token is the only channel that
 * survives a browser blocking the cross-site cookie. */
function tokensFromSocket(socket: AppSocket): string[] {
  const candidates: string[] = [];

  const header = socket.handshake.headers.cookie;
  if (header) {
    const fromCookie = cookie.parse(header)[AUTH_COOKIE];
    if (fromCookie) candidates.push(fromCookie);
  }

  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === 'string' && authToken.length > 0) candidates.push(authToken);

  return candidates;
}

/**
 * Handshake authentication. Identity comes from the JWT only — the client can
 * never assert who it is.
 */
export async function socketAuth(socket: AppSocket, next: (err?: Error) => void) {
  try {
    const tokens = tokensFromSocket(socket);
    if (tokens.length === 0) return next(new Error('UNAUTHENTICATED'));

    const userId = tokens.map(verifyToken).find((id): id is string => id !== null);
    if (!userId) return next(new Error('UNAUTHENTICATED'));

    const user = await User.findById(userId).select('username');
    if (!user) return next(new Error('UNAUTHENTICATED'));

    socket.data.user = { userId: user._id.toString(), username: user.username };
    socket.data.rooms = new Set<string>();
    socket.data.roles = new Map();
    socket.data.openFiles = new Map();
    socket.data.chatTimestamps = [];
    socket.data.runTimestamps = [];
    next();
  } catch (err) {
    console.error('[socket] auth failure', err);
    next(new Error('UNAUTHENTICATED'));
  }
}
