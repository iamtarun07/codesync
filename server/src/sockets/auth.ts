import * as cookie from 'cookie';
import { User } from '../models/User';
import { AUTH_COOKIE, verifyToken } from '../utils/jwt';
import type { AppSocket } from '../types/socket.types';

function tokenFromSocket(socket: AppSocket): string | null {
  const header = socket.handshake.headers.cookie;
  if (header) {
    const parsed = cookie.parse(header);
    const fromCookie = parsed[AUTH_COOKIE];
    if (fromCookie) return fromCookie;
  }

  // Explicit handshake token: needed for CLI/Postman socket testing and for
  // deployments where the cookie is cross-site.
  const authToken = socket.handshake.auth?.token;
  return typeof authToken === 'string' && authToken.length > 0 ? authToken : null;
}

/**
 * Handshake authentication. Identity comes from the JWT only — the client can
 * never assert who it is.
 */
export async function socketAuth(socket: AppSocket, next: (err?: Error) => void) {
  try {
    const token = tokenFromSocket(socket);
    if (!token) return next(new Error('UNAUTHENTICATED'));

    const userId = verifyToken(token);
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
