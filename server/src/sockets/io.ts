import type { AppServer } from '../types/socket.types';

/**
 * The Socket.IO server instance, kept in its own module so REST controllers can
 * broadcast (role changes, settings) without importing the socket bootstrap and
 * creating a require cycle.
 */
let instance: AppServer | null = null;

export function setIO(io: AppServer): void {
  instance = io;
}

export function getIO(): AppServer | null {
  return instance;
}
