import { z } from 'zod';
import { ACTIVITY_GROUPS } from '../models/ActivityLog';
import { MAX_MESSAGE_LENGTH } from '../models/Message';
import { ROOM_ROLES } from '../models/Room';
import { FILE_ID_REGEX, ROOM_ID_REGEX } from '../utils/roomId';
import { SUPPORTED_LANGUAGES } from '../utils/languages';

export const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters'),
  email: z.string().trim().toLowerCase().email('A valid email is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('A valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

export const languageSchema = z.enum(SUPPORTED_LANGUAGES);

export const createRoomSchema = z.object({
  name: z.string().trim().min(1, 'Room name is required').max(60, 'Room name is too long'),
  language: languageSchema.default('javascript'),
  isPublic: z.boolean().default(true),
});

export const roomIdParamSchema = z.object({
  roomId: z.string().trim().regex(ROOM_ID_REGEX, 'Invalid room ID'),
});

export const messageQuerySchema = z.object({
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const roomIdField = z.string().trim().regex(ROOM_ID_REGEX, 'Invalid room ID');
const fileIdField = z.string().trim().regex(FILE_ID_REGEX, 'Invalid file ID');
const roomPasswordField = z
  .string()
  .min(4, 'Room password must be at least 4 characters')
  .max(128, 'Room password is too long');

// ---- REST: room settings, roles, activity ----------------------------------

export const roleParamSchema = z.object({
  roomId: z.string().trim().regex(ROOM_ID_REGEX, 'Invalid room ID'),
  userId: z.string().trim().regex(/^[0-9a-fA-F]{24}$/, 'Invalid user ID'),
});

export const updateRoleSchema = z.object({
  // Ownership transfer is deliberately not exposed here.
  role: z.enum(ROOM_ROLES).refine((role) => role !== 'owner', 'Ownership cannot be reassigned'),
});

export const updateSettingsSchema = z
  .object({
    name: z.string().trim().min(1, 'Room name is required').max(60, 'Room name is too long').optional(),
    isPublic: z.boolean().optional(),
    password: z
      .object({
        enabled: z.boolean(),
        value: roomPasswordField.optional(),
      })
      .optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update')
  .refine(
    (body) => !(body.password?.enabled && !body.password.value),
    'A password is required to enable protection',
  );

export const roomPasswordSchema = z.object({ password: roomPasswordField });

export const activityQuerySchema = z.object({
  group: z.enum(['all', ...(Object.keys(ACTIVITY_GROUPS) as [string, ...string[]])]).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// ---- socket payloads -------------------------------------------------------

export const socketRoomSchema = z.object({ roomId: roomIdField });

export const socketFileSchema = z.object({ roomId: roomIdField, fileId: fileIdField });

export const socketFileCreateSchema = z.object({
  roomId: roomIdField,
  path: z.string().trim().min(1, 'A file name is required').max(260, 'Path is too long'),
  type: z.enum(['file', 'folder']).default('file'),
});

export const socketFileRenameSchema = z.object({
  roomId: roomIdField,
  fileId: fileIdField,
  name: z.string().trim().min(1, 'A name is required').max(40, 'Name is too long'),
});

export const socketLanguageSchema = z.object({
  roomId: roomIdField,
  fileId: fileIdField,
  language: languageSchema,
});

export const socketRunSchema = z.object({
  roomId: roomIdField,
  fileId: fileIdField,
  stdin: z.string().max(10_000, 'Stdin is too long').default(''),
});

export const socketChatSchema = z.object({
  roomId: roomIdField,
  text: z.string().trim().min(1, 'Message cannot be empty').max(MAX_MESSAGE_LENGTH),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type MessageQuery = z.infer<typeof messageQuerySchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type RoomPasswordInput = z.infer<typeof roomPasswordSchema>;
export type ActivityQuery = z.infer<typeof activityQuerySchema>;
