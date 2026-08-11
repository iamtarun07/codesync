import bcrypt from 'bcryptjs';
import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import { extensionForLanguage } from '../utils/languages';
import { generateFileId } from '../utils/roomId';

export const ROOM_ROLES = ['owner', 'editor', 'viewer'] as const;
export type RoomRole = (typeof ROOM_ROLES)[number];

/** Roles allowed to mutate the workspace. Viewer is strictly read-only. */
export const WRITE_ROLES: RoomRole[] = ['owner', 'editor'];

const PASSWORD_ROUNDS = 10;

export interface IRoomMember {
  user: Types.ObjectId;
  role: RoomRole;
  lastSeenAt: Date;
  /** Set when this member cleared the room password. Reset when it changes. */
  passwordOkAt?: Date;
}

export interface IRoomFile {
  fileId: string;
  name: string;
  /** POSIX-style path, unique per room. Folders are entries too. */
  path: string;
  type: 'file' | 'folder';
  language: string;
  /** Plain-text mirror of the CRDT, for previews and fallback. */
  content: string;
  docState?: Buffer;
  createdAt: Date;
  updatedAt: Date;
}

export interface IRoom extends Document {
  _id: Types.ObjectId;
  roomId: string;
  name: string;
  owner: Types.ObjectId;
  members: Types.DocumentArray<IRoomMember & Document>;
  files: Types.DocumentArray<IRoomFile & Document>;
  language: string;
  content: string;
  docState?: Buffer;
  isPublic: boolean;
  passwordEnabled: boolean;
  passwordHash?: string;
  createdAt: Date;
  updatedAt: Date;
}

const memberSchema = new Schema<IRoomMember>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ROOM_ROLES, default: 'editor' },
    lastSeenAt: { type: Date, default: Date.now },
    passwordOkAt: { type: Date },
  },
  { _id: false },
);

const fileSchema = new Schema<IRoomFile>(
  {
    fileId: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    path: { type: String, required: true, trim: true, maxlength: 260 },
    type: { type: String, enum: ['file', 'folder'], default: 'file' },
    language: { type: String, default: 'plaintext' },
    content: { type: String, default: '' },
    // Per-file binary Yjs state. Excluded by default so listings stay small.
    docState: { type: Buffer, select: false },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const roomSchema = new Schema<IRoom>(
  {
    // Public, user-facing identifier. Never expose _id as the join code.
    // `unique` builds the index; a separate `index: true` would duplicate it.
    roomId: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    members: { type: [memberSchema], default: [] },
    files: { type: [fileSchema], default: [] },
    language: { type: String, default: 'javascript' },
    // Pre-multi-file rooms kept their buffer here; migrateFiles() moves it into
    // files[0] and this then mirrors whichever file was edited most recently.
    content: { type: String, default: '' },
    docState: { type: Buffer, select: false },
    isPublic: { type: Boolean, default: true },
    passwordEnabled: { type: Boolean, default: false },
    passwordHash: { type: String, select: false },
  },
  { timestamps: true },
);

roomSchema.index({ 'members.user': 1, updatedAt: -1 });

export const Room: Model<IRoom> = model<IRoom>('Room', roomSchema);

/**
 * Id of a reference that may or may not be populated. `owner.toString()` on a
 * populated User document returns the whole document, not the id — every role
 * and ownership check has to go through this.
 */
export function refId(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  const doc = value as { _id?: { toString(): string } };
  return doc._id ? doc._id.toString() : String(value);
}

export function ownerId(room: IRoom): string {
  return refId(room.owner);
}

export function isMember(room: IRoom, userId: string): boolean {
  return room.members.some((m) => refId(m.user) === userId);
}

export function memberRole(room: IRoom, userId: string): RoomRole | null {
  if (ownerId(room) === userId) return 'owner';
  const member = room.members.find((m) => refId(m.user) === userId);
  return member ? member.role : null;
}

export function canWrite(role: RoomRole | null): boolean {
  return role !== null && WRITE_ROLES.includes(role);
}

export function findFile(room: IRoom, fileId: string): (IRoomFile & Document) | null {
  return room.files.find((f) => f.fileId === fileId) ?? null;
}

/**
 * Password gate. The owner is never locked out of their own room, and a member
 * who already entered the current password is not asked again.
 */
export function needsPassword(room: IRoom, userId: string): boolean {
  if (!room.passwordEnabled) return false;
  if (ownerId(room) === userId) return false;
  const member = room.members.find((m) => refId(m.user) === userId);
  return !member?.passwordOkAt;
}

export async function setRoomPassword(room: IRoom, password: string): Promise<void> {
  room.passwordHash = await bcrypt.hash(password, PASSWORD_ROUNDS);
  room.passwordEnabled = true;
  // A new password invalidates every previous unlock.
  const owner = ownerId(room);
  room.members.forEach((member) => {
    if (refId(member.user) !== owner) member.passwordOkAt = undefined;
  });
}

export async function verifyRoomPassword(room: IRoom, password: string): Promise<boolean> {
  if (!room.passwordEnabled || !room.passwordHash) return true;
  return bcrypt.compare(password, room.passwordHash);
}

/**
 * Backfills the file list for rooms created before the multi-file workspace.
 * The existing Yjs state is moved, not recreated, so edit history survives.
 * Caller must have selected `+docState`. Returns true when the room changed.
 */
export function migrateFiles(room: IRoom): boolean {
  if (room.files.length > 0) return false;

  const language = room.language || 'javascript';
  const name = `main.${extensionForLanguage(language)}`;
  room.files.push({
    fileId: generateFileId(),
    name,
    path: name,
    type: 'file',
    language,
    content: room.content ?? '',
    docState: room.docState,
    createdAt: room.createdAt ?? new Date(),
    updatedAt: new Date(),
  });
  return true;
}
