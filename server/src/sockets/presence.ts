import { Room, ownerId as roomOwnerId, type RoomRole } from '../models/Room';
import type { AppServer, PresenceUser, RoomMemberView } from '../types/socket.types';

/** roomId -> socketId -> user. A user with two tabs has two entries. */
const presence = new Map<string, Map<string, PresenceUser>>();

export function addPresence(roomId: string, socketId: string, user: PresenceUser): void {
  let room = presence.get(roomId);
  if (!room) {
    room = new Map();
    presence.set(roomId, room);
  }
  room.set(socketId, user);
}

export function removePresence(roomId: string, socketId: string): void {
  const room = presence.get(roomId);
  if (!room) return;
  room.delete(socketId);
  if (room.size === 0) presence.delete(roomId);
}

export function onlineUserIds(roomId: string): Set<string> {
  const room = presence.get(roomId);
  if (!room) return new Set();
  return new Set([...room.values()].map((u) => u.userId));
}

/** True when the user still has at least one socket in the room. */
export function isUserOnline(roomId: string, userId: string): boolean {
  return onlineUserIds(roomId).has(userId);
}

/**
 * Full member list (from MongoDB) annotated with live connection state, so the
 * UI can render both "who belongs here" and "who is here right now".
 */
export async function buildMemberList(roomId: string): Promise<RoomMemberView[]> {
  const room = await Room.findOne({ roomId }).populate('members.user', 'username');
  if (!room) return [];

  const online = onlineUserIds(roomId);
  const ownerId = roomOwnerId(room);

  return room.members
    .map((member) => {
      const populated = member.user as unknown as { _id: { toString(): string }; username?: string };
      const userId = populated._id.toString();
      return {
        userId,
        username: populated.username ?? 'Unknown',
        // The owner field is the source of truth for ownership.
        role: (userId === ownerId ? 'owner' : member.role) as RoomRole,
        online: online.has(userId),
      };
    })
    .sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1;
      if (a.role !== b.role) return a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : 0;
      return a.username.localeCompare(b.username);
    });
}

export async function broadcastMembers(io: AppServer, roomId: string): Promise<void> {
  const members = await buildMemberList(roomId);
  io.to(roomId).emit('room:members', { roomId, members });
}
