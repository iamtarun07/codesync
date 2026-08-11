import { Schema, model, type Document, type Model, type Types } from 'mongoose';

export const ACTIVITY_TYPES = [
  'USER_JOINED',
  'USER_LEFT',
  'FILE_CREATED',
  'FILE_RENAMED',
  'FILE_DELETED',
  'LANGUAGE_CHANGED',
  'CODE_SAVED',
  'CODE_RUN',
  'ROLE_CHANGED',
  'ROOM_SETTINGS_CHANGED',
  'PASSWORD_ENABLED',
  'PASSWORD_DISABLED',
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** Coarse buckets the Activity panel filters by. */
export const ACTIVITY_GROUPS = {
  files: ['FILE_CREATED', 'FILE_RENAMED', 'FILE_DELETED', 'LANGUAGE_CHANGED', 'CODE_SAVED', 'CODE_RUN'],
  members: ['USER_JOINED', 'USER_LEFT', 'ROLE_CHANGED'],
  settings: ['ROOM_SETTINGS_CHANGED', 'PASSWORD_ENABLED', 'PASSWORD_DISABLED'],
} as const satisfies Record<string, readonly ActivityType[]>;

export interface IActivityLog extends Document {
  _id: Types.ObjectId;
  room: Types.ObjectId;
  actor: Types.ObjectId;
  type: ActivityType;
  /** Small labels only (file name, role, language) — never code content. */
  metadata: Record<string, string>;
  createdAt: Date;
}

const activitySchema = new Schema<IActivityLog>(
  {
    room: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ACTIVITY_TYPES, required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

activitySchema.index({ room: 1, createdAt: -1 });

export const ActivityLog: Model<IActivityLog> = model<IActivityLog>('ActivityLog', activitySchema);
