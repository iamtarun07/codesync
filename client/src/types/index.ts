export interface User {
  id: string;
  username: string;
  email: string;
  createdAt: string;
}

export type RoomRole = 'owner' | 'editor' | 'viewer';

export interface RoomMemberSummary {
  user: { id: string; username: string };
  role: RoomRole;
  lastSeenAt: string;
}

/** File metadata. Contents live in the per-file CRDT, never in Redux. */
export interface RoomFile {
  fileId: string;
  name: string;
  path: string;
  type: 'file' | 'folder';
  language: string;
  updatedAt: string;
}

export interface RoomSettings {
  name: string;
  isPublic: boolean;
  passwordEnabled: boolean;
}

export interface Room {
  roomId: string;
  name: string;
  owner: { id: string; username: string };
  members: RoomMemberSummary[];
  memberCount: number;
  language: string;
  files: RoomFile[];
  settings: RoomSettings;
  myRole: RoomRole | null;
  fileCount?: number;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RoomMemberView {
  userId: string;
  username: string;
  role: RoomRole;
  online: boolean;
}

export type ActivityType =
  | 'USER_JOINED'
  | 'USER_LEFT'
  | 'FILE_CREATED'
  | 'FILE_RENAMED'
  | 'FILE_DELETED'
  | 'LANGUAGE_CHANGED'
  | 'CODE_SAVED'
  | 'CODE_RUN'
  | 'ROLE_CHANGED'
  | 'ROOM_SETTINGS_CHANGED'
  | 'PASSWORD_ENABLED'
  | 'PASSWORD_DISABLED';

export type ActivityGroup = 'all' | 'files' | 'members' | 'settings';

export interface ActivityEntry {
  id: string;
  roomId: string;
  type: ActivityType;
  actor: { id: string; username: string };
  metadata: Record<string, string>;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  text: string;
  sender: { id: string; username: string };
  createdAt: string;
}

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected';

export interface RunOutput {
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

export interface RunState {
  status: 'idle' | 'running' | 'done' | 'failed';
  /** Who triggered the current or last run. */
  by: string | null;
  output: RunOutput | null;
  error: string | null;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiFailure {
  success: false;
  message: string;
  code: string;
}
