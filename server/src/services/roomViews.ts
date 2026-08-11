import type { IActivityLog } from '../models/ActivityLog';
import type { IRoom } from '../models/Room';
import type { ActivityView, RoomFileView, RoomSettingsView } from '../types/socket.types';

/** Folders first, then alphabetically by path — a stable, IDE-like ordering. */
export function fileViews(room: IRoom): RoomFileView[] {
  return room.files
    .map((file) => ({
      fileId: file.fileId,
      name: file.name,
      path: file.path,
      type: file.type,
      language: file.language,
      updatedAt: (file.updatedAt ?? new Date()).toISOString(),
    }))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.path.localeCompare(b.path);
    });
}

/** Never includes passwordHash — only whether protection is on. */
export function settingsView(room: IRoom): RoomSettingsView {
  return {
    name: room.name,
    isPublic: room.isPublic,
    passwordEnabled: room.passwordEnabled,
  };
}

interface PopulatedActor {
  _id: { toString(): string };
  username?: string;
}

export function activityView(entry: IActivityLog, roomId: string): ActivityView {
  const actor = entry.actor as unknown as PopulatedActor;
  return {
    id: entry._id.toString(),
    roomId,
    type: entry.type,
    actor: {
      id: actor?._id ? actor._id.toString() : String(entry.actor),
      username: actor?.username ?? 'Unknown',
    },
    metadata: entry.metadata ?? {},
    createdAt: entry.createdAt.toISOString(),
  };
}
