import type { Types } from 'mongoose';
import { ActivityLog, type ActivityType } from '../models/ActivityLog';
import { getIO } from '../sockets/io';

interface RecordArgs {
  roomObjectId: Types.ObjectId;
  roomId: string;
  actor: { id: string; username: string };
  type: ActivityType;
  metadata?: Record<string, string>;
}

/**
 * Writes one activity entry and pushes it to everyone in the room. Logging is
 * best-effort: a failed write must never break the action it describes.
 */
export async function recordActivity({
  roomObjectId,
  roomId,
  actor,
  type,
  metadata = {},
}: RecordArgs): Promise<void> {
  try {
    const entry = await ActivityLog.create({
      room: roomObjectId,
      actor: actor.id,
      type,
      metadata,
    });

    getIO()?.to(roomId).emit('activity:new', {
      id: entry._id.toString(),
      roomId,
      type,
      actor,
      metadata,
      createdAt: entry.createdAt.toISOString(),
    });
  } catch (err) {
    console.error(`[activity] could not record ${type} for room ${roomId}`, err);
  }
}
