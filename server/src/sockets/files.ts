import { Room, findFile, type IRoom, type IRoomFile } from '../models/Room';
import { recordActivity } from '../services/activity';
import { fileViews } from '../services/roomViews';
import {
  MAX_FILES_PER_ROOM,
  PathError,
  assertSegment,
  isDescendantPath,
  normalizePath,
  renamePath,
} from '../utils/filePath';
import { languageForFileName } from '../utils/languages';
import { generateFileId } from '../utils/roomId';
import {
  socketFileCreateSchema,
  socketFileRenameSchema,
  socketFileSchema,
} from '../validation/schemas';
import type { AppServer, AppSocket } from '../types/socket.types';
import { acquireDoc, encodeState, evictDoc, releaseDoc } from './docStore';
import { emitError, fileRoom, openFileIn, requireJoined, requireWriteAccess } from './guards';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function broadcastFiles(io: AppServer, room: IRoom): Promise<void> {
  io.to(room.roomId).emit('room:files', { roomId: room.roomId, files: fileViews(room) });
}

/**
 * Detaches this socket from whatever file it had open in a room, releasing the
 * in-memory Y.Doc. Called on file switch, room leave and disconnect.
 */
export async function closeOpenFile(socket: AppSocket, roomId: string): Promise<void> {
  const previous = openFileIn(socket, roomId);
  if (!previous) return;

  socket.data.openFiles.delete(roomId);
  await socket.leave(fileRoom(roomId, previous));
  await releaseDoc(roomId, previous);
}

/** Folder entries missing along a path (mkdir -p semantics). */
function missingFolders(room: IRoom, segments: string[]): IRoomFile[] {
  const entries: IRoomFile[] = [];
  for (let i = 1; i < segments.length; i += 1) {
    const folderPath = segments.slice(0, i).join('/');
    if (room.files.some((f) => f.path === folderPath)) continue;
    entries.push({
      fileId: generateFileId(),
      name: segments[i - 1],
      path: folderPath,
      type: 'folder',
      language: 'plaintext',
      content: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  return entries;
}

export function registerFileHandlers(io: AppServer, socket: AppSocket): void {
  /**
   * Subscribes to exactly one file's CRDT stream. Each file has its own Y.Doc,
   * so switching files can never mix two buffers together.
   */
  socket.on('file:open', async (payload) => {
    const parsed = socketFileSchema.safeParse(payload);
    if (!parsed.success) return emitError(socket, 'BAD_PAYLOAD', 'Invalid file:open payload');

    const { roomId, fileId } = parsed.data;
    if (!requireJoined(socket, roomId)) return;

    // Re-opening the file already being streamed is a resync request: the
    // client gets the authoritative state again and replays its own diff. This
    // is how a session recovers after a role change or a rejected update.
    if (openFileIn(socket, roomId) === fileId) {
      const currentState = encodeState(roomId, fileId);
      const currentRoom = await Room.findOne({ roomId }).select('files');
      const currentFile = currentRoom ? findFile(currentRoom, fileId) : null;
      if (currentState) {
        socket.emit('file:state', {
          roomId,
          fileId,
          language: currentFile?.language ?? 'plaintext',
          docState: currentState,
        });
      }
      return;
    }

    const doc = await acquireDoc(roomId, fileId);
    if (!doc) return emitError(socket, 'FILE_NOT_FOUND', 'That file no longer exists');

    // Release the previous file only once the new one is loaded, so a failed
    // switch leaves the session on a working document.
    await closeOpenFile(socket, roomId);

    socket.data.openFiles.set(roomId, fileId);
    await socket.join(fileRoom(roomId, fileId));

    const room = await Room.findOne({ roomId }).select('files');
    const file = room ? findFile(room, fileId) : null;
    const docState = encodeState(roomId, fileId);
    if (!docState) return emitError(socket, 'ROOM_INACTIVE', 'Could not load that file');

    socket.emit('file:state', {
      roomId,
      fileId,
      language: file?.language ?? 'plaintext',
      docState,
    });
  });

  socket.on('file:create', async (payload) => {
    const parsed = socketFileCreateSchema.safeParse(payload);
    if (!parsed.success) {
      return emitError(socket, 'BAD_PAYLOAD', parsed.error.issues[0]?.message ?? 'Invalid path');
    }

    const { roomId, path: rawPath, type } = parsed.data;
    if (!requireWriteAccess(socket, roomId)) return;

    let normalized;
    try {
      normalized = normalizePath(rawPath);
    } catch (err) {
      return emitError(socket, 'BAD_PATH', err instanceof PathError ? err.message : 'Invalid path');
    }

    const room = await Room.findOne({ roomId });
    if (!room) return emitError(socket, 'ROOM_NOT_FOUND', 'Room no longer exists');

    if (room.files.some((f) => f.path === normalized.path)) {
      return emitError(socket, 'PATH_TAKEN', `${normalized.path} already exists`);
    }
    if (room.files.length + normalized.segments.length > MAX_FILES_PER_ROOM) {
      return emitError(socket, 'TOO_MANY_FILES', `A room may hold ${MAX_FILES_PER_ROOM} entries`);
    }

    const entries = missingFolders(room, normalized.segments);
    entries.push({
      fileId: generateFileId(),
      name: normalized.name,
      path: normalized.path,
      type,
      language: type === 'file' ? languageForFileName(normalized.name) : 'plaintext',
      content: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // One conditional $push: it only lands if none of the new paths appeared
    // and the room is still under the cap since we read it. Never
    // load-modify-save, which would race (VersionError) and rewrite the files
    // array without the unselected per-file CRDT state.
    const result = await Room.updateOne(
      {
        _id: room._id,
        'files.path': { $nin: entries.map((entry) => entry.path) },
        [`files.${MAX_FILES_PER_ROOM - entries.length}`]: { $exists: false },
      },
      { $push: { files: { $each: entries } } },
    );
    if (result.modifiedCount === 0) {
      return emitError(socket, 'PATH_TAKEN', `${normalized.path} was just created or the room is full`);
    }

    const updated = await Room.findOne({ roomId });
    if (updated) await broadcastFiles(io, updated);
    await recordActivity({
      roomObjectId: room._id,
      roomId,
      actor: { id: socket.data.user.userId, username: socket.data.user.username },
      type: 'FILE_CREATED',
      metadata: { path: normalized.path, type },
    });
  });

  socket.on('file:rename', async (payload) => {
    const parsed = socketFileRenameSchema.safeParse(payload);
    if (!parsed.success) {
      return emitError(socket, 'BAD_PAYLOAD', parsed.error.issues[0]?.message ?? 'Invalid name');
    }

    const { roomId, fileId, name } = parsed.data;
    if (!requireWriteAccess(socket, roomId)) return;

    let nextName: string;
    try {
      nextName = assertSegment(name);
    } catch (err) {
      return emitError(socket, 'BAD_PATH', err instanceof PathError ? err.message : 'Invalid name');
    }

    const room = await Room.findOne({ roomId });
    if (!room) return emitError(socket, 'ROOM_NOT_FOUND', 'Room no longer exists');

    const file = findFile(room, fileId);
    if (!file) return emitError(socket, 'FILE_NOT_FOUND', 'That file no longer exists');

    const fromPath = file.path;
    const toPath = renamePath(fromPath, nextName);
    if (toPath === fromPath) return;
    if (room.files.some((f) => f.path === toPath)) {
      return emitError(socket, 'PATH_TAKEN', `${toPath} already exists`);
    }

    const now = new Date();
    const set: Record<string, unknown> = {
      'files.$[target].name': nextName,
      'files.$[target].path': toPath,
      'files.$[target].updatedAt': now,
    };
    if (file.type === 'file') set['files.$[target].language'] = languageForFileName(nextName);
    const arrayFilters: Record<string, unknown>[] = [{ 'target.fileId': fileId }];

    // A folder rename moves everything beneath it, each entry by its own id.
    // ponytail: a child created inside the folder in the same instant is left
    // at the old path; an aggregation-pipeline update closes that if it matters.
    if (file.type === 'folder') {
      room.files
        .filter((child) => isDescendantPath(child.path, fromPath))
        .forEach((child, i) => {
          set[`files.$[c${i}].path`] = `${toPath}/${child.path.slice(fromPath.length + 1)}`;
          set[`files.$[c${i}].updatedAt`] = now;
          arrayFilters.push({ [`c${i}.fileId`]: child.fileId });
        });
    }

    // Conditional on the source still being where we read it and the target
    // still being free, so two renames cannot collide.
    const result = await Room.updateOne(
      {
        _id: room._id,
        files: { $elemMatch: { fileId, path: fromPath } },
        'files.path': { $ne: toPath },
      },
      { $set: set },
      { arrayFilters },
    );
    if (result.modifiedCount === 0) {
      return emitError(socket, 'PATH_TAKEN', `${toPath} already exists`);
    }

    const updated = await Room.findOne({ roomId });
    if (updated) await broadcastFiles(io, updated);
    await recordActivity({
      roomObjectId: room._id,
      roomId,
      actor: { id: socket.data.user.userId, username: socket.data.user.username },
      type: 'FILE_RENAMED',
      metadata: { from: fromPath, to: toPath },
    });
  });

  socket.on('file:delete', async (payload) => {
    const parsed = socketFileSchema.safeParse(payload);
    if (!parsed.success) return emitError(socket, 'BAD_PAYLOAD', 'Invalid file:delete payload');

    const { roomId, fileId } = parsed.data;
    if (!requireWriteAccess(socket, roomId)) return;

    const room = await Room.findOne({ roomId });
    if (!room) return emitError(socket, 'ROOM_NOT_FOUND', 'Room no longer exists');

    const target = findFile(room, fileId);
    if (!target) return emitError(socket, 'FILE_NOT_FOUND', 'That file no longer exists');

    const doomed = room.files.filter(
      (f) => f.path === target.path || isDescendantPath(f.path, target.path),
    );
    const remainingFiles = room.files.filter(
      (f) => f.type === 'file' && !doomed.some((d) => d.fileId === f.fileId),
    );
    if (remainingFiles.length === 0) {
      return emitError(socket, 'LAST_FILE', 'A room must keep at least one file');
    }

    const doomedIds = new Set(doomed.map((f) => f.fileId));
    // $pull by path removes the entry and anything beneath it in one write,
    // conditional on a surviving file still existing. Rewriting the whole
    // array instead would drop every other file's unselected CRDT state.
    const result = await Room.updateOne(
      {
        _id: room._id,
        files: { $elemMatch: { type: 'file', fileId: { $nin: [...doomedIds] } } },
      },
      {
        $pull: {
          files: {
            $or: [
              { path: target.path },
              { path: { $regex: `^${escapeRegex(target.path)}/` } },
            ],
          },
        },
      },
    );
    if (result.modifiedCount === 0) {
      return emitError(socket, 'LAST_FILE', 'A room must keep at least one file');
    }

    doomedIds.forEach((id) => evictDoc(roomId, id));

    // Move anyone who was inside a deleted file onto a surviving one.
    const fallback = remainingFiles[0].fileId;
    for (const peer of await io.in(roomId).fetchSockets()) {
      const open = peer.data.openFiles?.get(roomId);
      if (open && doomedIds.has(open)) {
        peer.data.openFiles.delete(roomId);
        await peer.leave(fileRoom(roomId, open));
        const doc = await acquireDoc(roomId, fallback);
        if (!doc) continue;
        peer.data.openFiles.set(roomId, fallback);
        await peer.join(fileRoom(roomId, fallback));
        const docState = encodeState(roomId, fallback);
        if (docState) {
          peer.emit('file:state', {
            roomId,
            fileId: fallback,
            language: remainingFiles[0].language,
            docState,
          });
        }
      }
    }

    const updated = await Room.findOne({ roomId });
    if (updated) await broadcastFiles(io, updated);
    await recordActivity({
      roomObjectId: room._id,
      roomId,
      actor: { id: socket.data.user.userId, username: socket.data.user.username },
      type: 'FILE_DELETED',
      metadata: { path: target.path, type: target.type },
    });
  });
}

export { broadcastFiles };
