import type { Server as HttpServer } from 'http';
import { Types } from 'mongoose';
import { Server } from 'socket.io';
import { env } from '../config/env';
import { Room, memberRole, migrateFiles, needsPassword, refId } from '../models/Room';
import { recordActivity } from '../services/activity';
import { fileViews, settingsView } from '../services/roomViews';
import { socketRoomSchema } from '../validation/schemas';
import type { AppServer, AppSocket } from '../types/socket.types';
import { socketAuth } from './auth';
import { registerChatHandlers } from './chat';
import { registerFileHandlers, closeOpenFile } from './files';
import { registerEditorHandlers } from './editor';
import { emitError } from './guards';
import { setIO } from './io';
import { addPresence, broadcastMembers, isUserOnline, removePresence } from './presence';
import { registerRunHandlers } from './run';

async function handleJoin(io: AppServer, socket: AppSocket, rawRoomId: unknown): Promise<void> {
  const parsed = socketRoomSchema.safeParse({ roomId: rawRoomId });
  if (!parsed.success) return emitError(socket, 'BAD_PAYLOAD', 'Invalid room ID');

  const { roomId } = parsed.data;
  if (socket.data.rooms.has(roomId)) return;

  // `+docState` is needed so a legacy single-buffer room can be migrated.
  const room = await Room.findOne({ roomId }).select('+docState');
  if (!room) return emitError(socket, 'ROOM_NOT_FOUND', 'Room not found');

  const userId = socket.data.user.userId;
  let role = memberRole(room, userId);

  if (!role) {
    if (!room.isPublic) return emitError(socket, 'ROOM_PRIVATE', 'This room is private');
    // Public rooms auto-enrol, mirroring POST /api/rooms/:roomId/join.
    room.members.push({
      user: new Types.ObjectId(userId),
      role: 'editor',
      lastSeenAt: new Date(),
    });
    role = 'editor';
  } else {
    const member = room.members.find((m) => refId(m.user) === userId);
    if (member) member.lastSeenAt = new Date();
  }

  // Password gate sits after membership so an invited member is still asked.
  if (needsPassword(room, userId)) {
    return emitError(socket, 'PASSWORD_REQUIRED', 'This room is password protected');
  }

  const migrated = migrateFiles(room);
  await room.save();

  await socket.join(roomId);
  socket.data.rooms.add(roomId);
  socket.data.roles.set(roomId, role);

  const wasOnline = isUserOnline(roomId, userId);

  socket.emit('room:state', {
    roomId,
    name: room.name,
    language: room.language,
    role,
    files: fileViews(room),
    settings: settingsView(room),
  });
  if (migrated) {
    console.info(`[rooms] migrated ${roomId} to a multi-file workspace`);
  }

  addPresence(roomId, socket.id, socket.data.user);
  await broadcastMembers(io, roomId);

  // One entry per arrival, not per tab.
  if (!wasOnline) {
    await recordActivity({
      roomObjectId: room._id,
      roomId,
      actor: { id: userId, username: socket.data.user.username },
      type: 'USER_JOINED',
      metadata: { role },
    });
  }
}

async function handleLeave(io: AppServer, socket: AppSocket, roomId: string): Promise<void> {
  if (!socket.data.rooms.has(roomId)) return;

  const userId = socket.data.user.userId;
  socket.data.rooms.delete(roomId);
  socket.data.roles.delete(roomId);
  removePresence(roomId, socket.id);
  await closeOpenFile(socket, roomId);
  await socket.leave(roomId);
  await broadcastMembers(io, roomId);

  if (!isUserOnline(roomId, userId)) {
    const room = await Room.findOne({ roomId }).select('_id');
    if (room) {
      await recordActivity({
        roomObjectId: room._id,
        roomId,
        actor: { id: userId, username: socket.data.user.username },
        type: 'USER_LEFT',
      });
    }
  }
}

export function createSocketServer(httpServer: HttpServer): AppServer {
  const io: AppServer = new Server(httpServer, {
    cors: { origin: env.CLIENT_URL, credentials: true },
    maxHttpBufferSize: 1e6,
  });

  io.use((socket, next) => {
    void socketAuth(socket, next);
  });

  io.on('connection', (socket) => {
    registerEditorHandlers(io, socket);
    registerFileHandlers(io, socket);
    registerChatHandlers(io, socket);
    registerRunHandlers(io, socket);

    // Round-trip probe for the session latency readout. Echo only — no state.
    socket.on('session:ping', (payload) => {
      if (typeof payload?.sentAt === 'number') socket.emit('session:pong', payload);
    });

    socket.on('room:join', (payload) => {
      void handleJoin(io, socket, payload?.roomId);
    });

    socket.on('room:leave', (payload) => {
      const parsed = socketRoomSchema.safeParse(payload);
      if (!parsed.success) return;
      void handleLeave(io, socket, parsed.data.roomId);
    });

    // Tabs close without sending room:leave — disconnect is the real cleanup.
    socket.on('disconnect', () => {
      const rooms = [...socket.data.rooms];
      socket.data.rooms.clear();
      socket.data.roles.clear();
      void Promise.all(
        rooms.map(async (roomId) => {
          const userId = socket.data.user.userId;
          removePresence(roomId, socket.id);
          await closeOpenFile(socket, roomId);
          await broadcastMembers(io, roomId);

          if (!isUserOnline(roomId, userId)) {
            const room = await Room.findOne({ roomId }).select('_id');
            if (room) {
              await recordActivity({
                roomObjectId: room._id,
                roomId,
                actor: { id: userId, username: socket.data.user.username },
                type: 'USER_LEFT',
              });
            }
          }
        }),
      );
    });
  });

  setIO(io);
  return io;
}
