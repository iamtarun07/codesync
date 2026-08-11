import { WRITE_ROLES, type RoomRole } from '../models/Room';
import type { AppSocket } from '../types/socket.types';

export function emitError(socket: AppSocket, code: string, message: string): void {
  socket.emit('error', { code, message });
}

/**
 * A socket may only act on rooms it actually joined through `room:join`
 * (which is where membership and the room password were verified). This blocks
 * a client from emitting into an arbitrary room ID.
 */
export function requireJoined(socket: AppSocket, roomId: string): boolean {
  if (socket.data.rooms?.has(roomId)) return true;
  emitError(socket, 'NOT_IN_ROOM', 'You have not joined this room');
  return false;
}

export function roleIn(socket: AppSocket, roomId: string): RoomRole | null {
  return socket.data.roles?.get(roomId) ?? null;
}

/**
 * Authorization for every mutating event. The role comes from the server-side
 * cache filled at join time (and refreshed when an owner changes it), never
 * from the payload — so a viewer cannot promote itself by editing the client.
 */
export function requireRole(socket: AppSocket, roomId: string, allowed: RoomRole[]): boolean {
  if (!requireJoined(socket, roomId)) return false;

  const role = roleIn(socket, roomId);
  if (role && allowed.includes(role)) return true;

  emitError(
    socket,
    'FORBIDDEN',
    role === 'viewer'
      ? 'You have view-only access to this room'
      : 'Your role does not allow that action',
  );
  return false;
}

/** Shorthand for the common "must be able to change the workspace" check. */
export function requireWriteAccess(socket: AppSocket, roomId: string): boolean {
  return requireRole(socket, roomId, WRITE_ROLES);
}

/** The file this socket currently has open in a room, if any. */
export function openFileIn(socket: AppSocket, roomId: string): string | null {
  return socket.data.openFiles?.get(roomId) ?? null;
}

export function fileRoom(roomId: string, fileId: string): string {
  return `${roomId}::${fileId}`;
}

/** Socket.IO delivers binary as Buffer (Node) — normalise before Yjs sees it. */
export function toUint8Array(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return null;
}
