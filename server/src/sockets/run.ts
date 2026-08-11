import { Room, findFile } from '../models/Room';
import { recordActivity } from '../services/activity';
import { RunError, isRunnable, runCode } from '../services/runner';
import { socketRunSchema } from '../validation/schemas';
import type { AppServer, AppSocket } from '../types/socket.types';
import { getLiveContent } from './docStore';
import { emitError, requireWriteAccess } from './guards';

const RUN_WINDOW_MS = 60_000;
const RUN_MAX_PER_WINDOW = 5;

function withinRateLimit(socket: AppSocket): boolean {
  const now = Date.now();
  const recent = socket.data.runTimestamps.filter((t) => now - t < RUN_WINDOW_MS);
  socket.data.runTimestamps = recent;
  if (recent.length >= RUN_MAX_PER_WINDOW) return false;
  recent.push(now);
  return true;
}

export function registerRunHandlers(io: AppServer, socket: AppSocket): void {
  /**
   * The source is read from the server's authoritative Y.Doc for the requested
   * file, not from the payload — so everyone runs exactly what is in the room,
   * and a client cannot smuggle in different code than its collaborators see.
   */
  socket.on('code:run', async (payload) => {
    const parsed = socketRunSchema.safeParse({
      roomId: payload?.roomId,
      fileId: payload?.fileId,
      stdin: payload?.stdin,
    });
    if (!parsed.success) return emitError(socket, 'BAD_PAYLOAD', 'Invalid run request');

    const { roomId, fileId, stdin } = parsed.data;
    // Execution is an owner/editor action; viewers only watch the output.
    if (!requireWriteAccess(socket, roomId)) return;

    if (!withinRateLimit(socket)) {
      return socket.emit('code:failed', {
        roomId,
        code: 'RATE_LIMITED',
        message: `You can run code ${RUN_MAX_PER_WINDOW} times per minute`,
      });
    }

    const room = await Room.findOne({ roomId }).select('_id language files');
    if (!room) return emitError(socket, 'ROOM_NOT_FOUND', 'Room no longer exists');

    const file = findFile(room, fileId);
    if (!file || file.type !== 'file') {
      return emitError(socket, 'FILE_NOT_FOUND', 'That file no longer exists');
    }

    const language = file.language;
    if (!isRunnable(language)) {
      return socket.emit('code:failed', {
        roomId,
        code: 'LANGUAGE_NOT_RUNNABLE',
        message: `${language} is not executable — switch to JavaScript, TypeScript, Python, Java or C++`,
      });
    }

    const source = getLiveContent(roomId, fileId) ?? file.content;
    const by = socket.data.user.username;
    io.to(roomId).emit('code:running', { roomId, by, language });

    const startedAt = Date.now();
    try {
      const result = await runCode(language, source, stdin);
      io.to(roomId).emit('code:output', {
        roomId,
        by,
        language,
        runtime: result.runtime,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        durationMs: Date.now() - startedAt,
        ranAt: new Date().toISOString(),
      });
      await recordActivity({
        roomObjectId: room._id,
        roomId,
        actor: { id: socket.data.user.userId, username: by },
        type: 'CODE_RUN',
        metadata: { path: file.path, language },
      });
    } catch (err) {
      const isRunError = err instanceof RunError;
      if (!isRunError) console.error('[run] unexpected failure', err);
      io.to(roomId).emit('code:failed', {
        roomId,
        code: isRunError ? err.code : 'RUN_FAILED',
        message: isRunError ? err.message : 'Could not run the code',
      });
    }
  });
}
