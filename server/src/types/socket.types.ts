import type { Server, Socket } from 'socket.io';
import type { ActivityType } from '../models/ActivityLog';
import type { RoomRole } from '../models/Room';

export interface PresenceUser {
  userId: string;
  username: string;
}

export interface RoomMemberView {
  userId: string;
  username: string;
  role: RoomRole;
  online: boolean;
}

export interface ChatMessageView {
  id: string;
  roomId: string;
  text: string;
  sender: { id: string; username: string };
  createdAt: string;
}

/** File metadata only — the body lives in the CRDT, fetched via `file:open`. */
export interface RoomFileView {
  fileId: string;
  name: string;
  path: string;
  type: 'file' | 'folder';
  language: string;
  updatedAt: string;
}

export interface RoomSettingsView {
  name: string;
  isPublic: boolean;
  passwordEnabled: boolean;
}

export interface ActivityView {
  id: string;
  roomId: string;
  type: ActivityType;
  actor: { id: string; username: string };
  metadata: Record<string, string>;
  createdAt: string;
}

export interface RoomStateView {
  roomId: string;
  name: string;
  language: string;
  /** The caller's own role, so the UI can go read-only immediately. */
  role: RoomRole;
  files: RoomFileView[];
  settings: RoomSettingsView;
}

/** Full Yjs state for one file (Y.encodeStateAsUpdate). */
export interface FileStateView {
  roomId: string;
  fileId: string;
  language: string;
  docState: Uint8Array;
}

export interface SocketErrorView {
  code: string;
  message: string;
}

export interface RunOutputView {
  roomId: string;
  by: string;
  language: string;
  runtime: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  ranAt: string;
}

export interface ClientToServerEvents {
  'room:join': (payload: { roomId: string }) => void;
  'room:leave': (payload: { roomId: string }) => void;
  /** Subscribes this socket to one file's CRDT stream. */
  'file:open': (payload: { roomId: string; fileId: string }) => void;
  'file:create': (payload: { roomId: string; path: string; type?: 'file' | 'folder' }) => void;
  'file:rename': (payload: { roomId: string; fileId: string; name: string }) => void;
  'file:delete': (payload: { roomId: string; fileId: string }) => void;
  'doc:update': (payload: { roomId: string; fileId: string; update: unknown }) => void;
  'awareness:update': (payload: { roomId: string; fileId: string; update: unknown }) => void;
  'room:language': (payload: { roomId: string; fileId: string; language: string }) => void;
  'chat:send': (payload: { roomId: string; text: string }) => void;
  'doc:save': (payload: { roomId: string; fileId: string }) => void;
  'code:run': (payload: { roomId: string; fileId: string; stdin?: string }) => void;
  /** Latency probe — echoed back untouched as `session:pong`. */
  'session:ping': (payload: { sentAt: number }) => void;
}

export interface ServerToClientEvents {
  'room:state': (payload: RoomStateView) => void;
  'room:members': (payload: { roomId: string; members: RoomMemberView[] }) => void;
  'room:files': (payload: { roomId: string; files: RoomFileView[] }) => void;
  'room:settings': (payload: { roomId: string; settings: RoomSettingsView }) => void;
  /** Sent to the affected user when their role changes mid-session. */
  'room:role': (payload: { roomId: string; role: RoomRole }) => void;
  'file:state': (payload: FileStateView) => void;
  'doc:update': (payload: { roomId: string; fileId: string; update: Uint8Array }) => void;
  'awareness:update': (payload: { roomId: string; fileId: string; update: Uint8Array }) => void;
  'room:language': (payload: {
    roomId: string;
    fileId: string;
    language: string;
    by: string;
  }) => void;
  'chat:message': (payload: ChatMessageView) => void;
  'doc:saved': (payload: { roomId: string; fileId: string; savedAt: string }) => void;
  'activity:new': (payload: ActivityView) => void;
  'code:running': (payload: { roomId: string; by: string; language: string }) => void;
  'code:output': (payload: RunOutputView) => void;
  'code:failed': (payload: { roomId: string; code: string; message: string }) => void;
  'session:pong': (payload: { sentAt: number }) => void;
  error: (payload: SocketErrorView) => void;
}

export interface SocketData {
  user: PresenceUser;
  /** Rooms this socket actually joined — the only rooms it may emit into. */
  rooms: Set<string>;
  /** Server-side role cache per room. Never read from the client payload. */
  roles: Map<string, RoomRole>;
  /** roomId -> currently open fileId, so file streams can be swapped safely. */
  openFiles: Map<string, string>;
  chatTimestamps: number[];
  runTimestamps: number[];
}

export type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

export type AppServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;
