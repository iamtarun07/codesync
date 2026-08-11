import { Message } from '../models/Message';
import { Room } from '../models/Room';
import { socketChatSchema } from '../validation/schemas';
import type { AppServer, AppSocket } from '../types/socket.types';
import { emitError, requireJoined } from './guards';

const CHAT_WINDOW_MS = 10_000;
const CHAT_MAX_PER_WINDOW = 10;

function withinRateLimit(socket: AppSocket): boolean {
  const now = Date.now();
  const recent = socket.data.chatTimestamps.filter((t) => now - t < CHAT_WINDOW_MS);
  if (recent.length >= CHAT_MAX_PER_WINDOW) {
    socket.data.chatTimestamps = recent;
    return false;
  }
  recent.push(now);
  socket.data.chatTimestamps = recent;
  return true;
}

export function registerChatHandlers(io: AppServer, socket: AppSocket): void {
  socket.on('chat:send', async (payload) => {
    const parsed = socketChatSchema.safeParse(payload);
    if (!parsed.success) {
      return emitError(socket, 'BAD_PAYLOAD', parsed.error.issues[0]?.message ?? 'Invalid message');
    }

    const { roomId, text } = parsed.data;
    if (!requireJoined(socket, roomId)) return;
    if (!withinRateLimit(socket)) {
      return emitError(socket, 'RATE_LIMITED', 'You are sending messages too quickly');
    }

    const room = await Room.findOne({ roomId }).select('_id');
    if (!room) return emitError(socket, 'ROOM_NOT_FOUND', 'Room no longer exists');

    // Sender and timestamp come from the server session, never the payload.
    const { userId, username } = socket.data.user;
    const message = await Message.create({ room: room._id, sender: userId, text });

    io.to(roomId).emit('chat:message', {
      id: message._id.toString(),
      roomId,
      text: message.text,
      sender: { id: userId, username },
      createdAt: message.createdAt.toISOString(),
    });
  });
}
