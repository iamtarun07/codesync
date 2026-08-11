import { Room, findFile } from '../models/Room';
import { recordActivity } from '../services/activity';
import { fileViews } from '../services/roomViews';
import { socketFileSchema, socketLanguageSchema } from '../validation/schemas';
import type { AppServer, AppSocket } from '../types/socket.types';
import { applyRemoteUpdate, flushDoc } from './docStore';
import {
  emitError,
  fileRoom,
  openFileIn,
  requireJoined,
  requireWriteAccess,
  toUint8Array,
} from './guards';

const MAX_UPDATE_BYTES = 512 * 1024;

export function registerEditorHandlers(io: AppServer, socket: AppSocket): void {
  /**
   * Yjs update relay, scoped to one file. The server applies the update to its
   * own Y.Doc for that file (so the persisted state stays authoritative) and
   * rebroadcasts the same opaque bytes to the other sockets viewing that file.
   * No merge logic here — the CRDT handles convergence.
   */
  socket.on('doc:update', (payload) => {
    const parsed = socketFileSchema.safeParse({
      roomId: payload?.roomId,
      fileId: payload?.fileId,
    });
    if (!parsed.success) return emitError(socket, 'BAD_PAYLOAD', 'Invalid doc:update payload');

    const { roomId, fileId } = parsed.data;
    // Editing is a write action: viewers are rejected here, not in the UI.
    if (!requireWriteAccess(socket, roomId)) return;
    if (openFileIn(socket, roomId) !== fileId) {
      return emitError(socket, 'FILE_NOT_OPEN', 'That file is not open in this session');
    }

    const update = toUint8Array(payload.update);
    if (!update || update.byteLength === 0 || update.byteLength > MAX_UPDATE_BYTES) {
      return emitError(socket, 'BAD_PAYLOAD', 'Invalid document update');
    }

    if (!applyRemoteUpdate(roomId, fileId, update)) {
      return emitError(socket, 'ROOM_INACTIVE', 'That file is not loaded');
    }

    socket.to(fileRoom(roomId, fileId)).emit('doc:update', { roomId, fileId, update });
  });

  /**
   * Cursors/selections/presence. Ephemeral: relayed, never persisted. Viewers
   * may publish awareness — a read-only cursor is still useful to the room.
   */
  socket.on('awareness:update', (payload) => {
    const parsed = socketFileSchema.safeParse({
      roomId: payload?.roomId,
      fileId: payload?.fileId,
    });
    if (!parsed.success) return;

    const { roomId, fileId } = parsed.data;
    if (!requireJoined(socket, roomId)) return;
    if (openFileIn(socket, roomId) !== fileId) return;

    const update = toUint8Array(payload.update);
    if (!update || update.byteLength === 0 || update.byteLength > MAX_UPDATE_BYTES) return;

    socket.to(fileRoom(roomId, fileId)).emit('awareness:update', { roomId, fileId, update });
  });

  socket.on('room:language', async (payload) => {
    const parsed = socketLanguageSchema.safeParse(payload);
    if (!parsed.success) return emitError(socket, 'BAD_PAYLOAD', 'Unsupported language');

    const { roomId, fileId, language } = parsed.data;
    if (!requireWriteAccess(socket, roomId)) return;

    const room = await Room.findOne({ roomId });
    if (!room) return emitError(socket, 'ROOM_NOT_FOUND', 'Room no longer exists');

    const file = findFile(room, fileId);
    if (!file || file.type !== 'file') {
      return emitError(socket, 'FILE_NOT_FOUND', 'That file no longer exists');
    }

    file.language = language;
    file.updatedAt = new Date();
    // Room-level language stays as the dashboard/runner default.
    room.language = language;
    await room.save();

    io.to(roomId).emit('room:language', {
      roomId,
      fileId,
      language,
      by: socket.data.user.username,
    });
    io.to(roomId).emit('room:files', { roomId, files: fileViews(room) });

    await recordActivity({
      roomObjectId: room._id,
      roomId,
      actor: { id: socket.data.user.userId, username: socket.data.user.username },
      type: 'LANGUAGE_CHANGED',
      metadata: { language, path: file.path },
    });
  });

  socket.on('doc:save', async (payload) => {
    const parsed = socketFileSchema.safeParse(payload);
    if (!parsed.success) return emitError(socket, 'BAD_PAYLOAD', 'Invalid save request');

    const { roomId, fileId } = parsed.data;
    if (!requireWriteAccess(socket, roomId)) return;

    await flushDoc(roomId, fileId, true);
    socket.emit('doc:saved', { roomId, fileId, savedAt: new Date().toISOString() });

    const room = await Room.findOne({ roomId }).select('_id files');
    const file = room ? findFile(room, fileId) : null;
    if (room && file) {
      await recordActivity({
        roomObjectId: room._id,
        roomId,
        actor: { id: socket.data.user.userId, username: socket.data.user.username },
        type: 'CODE_SAVED',
        metadata: { path: file.path },
      });
    }
  });
}
