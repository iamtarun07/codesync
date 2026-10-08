import type { Request, Response } from 'express';
import { ActivityLog, ACTIVITY_GROUPS, type ActivityType } from '../models/ActivityLog';
import { Message } from '../models/Message';
import {
  Room,
  isMember,
  memberRole,
  migrateFilesAtomically,
  needsPassword,
  ownerId,
  refId,
  setRoomPassword,
  verifyRoomPassword,
  type IRoom,
  type RoomRole,
} from '../models/Room';
import { recordActivity } from '../services/activity';
import { activityView, fileViews, settingsView } from '../services/roomViews';
import { ApiError } from '../utils/ApiError';
import { generateFileId, generateRoomId } from '../utils/roomId';
import { extensionForLanguage, starterSource } from '../utils/languages';
import { currentUser } from '../middleware/auth.middleware';
import { evictRoomDocs } from '../sockets/docStore';
import { handleLeave } from '../sockets';
import { getIO } from '../sockets/io';
import { broadcastMembers } from '../sockets/presence';
import type {
  ActivityQuery,
  CreateRoomInput,
  MessageQuery,
  RoomPasswordInput,
  UpdateRoleInput,
  UpdateSettingsInput,
} from '../validation/schemas';

interface PopulatedUser {
  _id: { toString(): string };
  username?: string;
}

function userView(value: unknown): { id: string; username: string } | null {
  if (!value || typeof value !== 'object') return null;
  const doc = value as PopulatedUser;
  return { id: doc._id.toString(), username: doc.username ?? 'Unknown' };
}

/**
 * Explicit projection — internal fields (docState, passwordHash, __v) never
 * reach the client. `myRole` lets the UI apply role rules before the socket
 * handshake completes.
 */
function toRoomDTO(room: IRoom, viewerId: string) {
  const owner = ownerId(room);

  return {
    roomId: room.roomId,
    name: room.name,
    owner: userView(room.owner) ?? { id: owner, username: 'Unknown' },
    members: room.members
      .map((m) => ({
        user: userView(m.user),
        role: (userView(m.user)?.id === owner ? 'owner' : m.role) as RoomRole,
        lastSeenAt: m.lastSeenAt,
      }))
      .filter(
        (m): m is { user: { id: string; username: string }; role: RoomRole; lastSeenAt: Date } =>
          m.user !== null,
      ),
    memberCount: room.members.length,
    language: room.language,
    files: fileViews(room),
    settings: settingsView(room),
    myRole: memberRole(room, viewerId),
    isPublic: room.isPublic,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
  };
}

async function findRoomOr404(roomId: string, withSecrets = false): Promise<IRoom> {
  const query = Room.findOne({ roomId })
    .populate('owner', 'username')
    .populate('members.user', 'username');
  if (withSecrets) query.select('+docState +passwordHash');

  const room = await query;
  if (!room) throw ApiError.notFound('Room not found', 'ROOM_NOT_FOUND');
  return room;
}

/** Owner-only guard shared by the settings and role endpoints. */
function assertOwner(room: IRoom, userId: string): void {
  if (ownerId(room) !== userId) {
    throw ApiError.forbidden('Only the room owner can do that', 'NOT_ROOM_OWNER');
  }
}

/**
 * Pulls live sessions out of a room after a REST change revoked their access
 * (password turned on, room deleted). The client reacts to the error code by
 * re-opening the room, which lands on the password gate or the not-found page.
 */
async function evictSessions(
  room: IRoom,
  code: 'PASSWORD_REQUIRED' | 'ROOM_NOT_FOUND',
  message: string,
  keep: (userId: string) => boolean = () => false,
): Promise<void> {
  const io = getIO();
  if (!io) return;
  for (const remote of await io.in(room.roomId).fetchSockets()) {
    const socket = io.sockets.sockets.get(remote.id);
    if (!socket || keep(socket.data.user.userId)) continue;
    await handleLeave(io, socket, room.roomId);
    socket.emit('error', { code, message });
  }
}

function refreshRoom(room: IRoom): void {
  const io = getIO();
  if (!io) return;
  io.to(room.roomId).emit('room:files', { roomId: room.roomId, files: fileViews(room) });
  io.to(room.roomId).emit('room:settings', { roomId: room.roomId, settings: settingsView(room) });
  broadcastMembers(io, room.roomId).catch((err) => console.error('[rooms] member broadcast failed', err));
}

export async function createRoom(req: Request, res: Response) {
  const user = currentUser(req);
  const { name, language, isPublic } = req.body as CreateRoomInput;

  // Collisions are astronomically unlikely; retry anyway rather than 500.
  let room: IRoom | null = null;
  for (let attempt = 0; attempt < 5 && !room; attempt += 1) {
    const roomId = generateRoomId();
    if (await Room.exists({ roomId })) continue;

    const fileName = `main.${extensionForLanguage(language)}`;
    room = await Room.create({
      roomId,
      name,
      language,
      isPublic,
      owner: user._id,
      members: [{ user: user._id, role: 'owner', lastSeenAt: new Date() }],
      content: '',
      // Every room starts as a workspace with one file.
      files: [
        {
          fileId: generateFileId(),
          name: fileName,
          path: fileName,
          type: 'file',
          language,
          content: starterSource(language),
        },
      ],
    });
  }
  if (!room) throw new ApiError(500, 'Could not allocate a room ID', 'ROOM_ID_EXHAUSTED');

  await room.populate([
    { path: 'owner', select: 'username' },
    { path: 'members.user', select: 'username' },
  ]);

  res.status(201).json({
    success: true,
    data: { room: toRoomDTO(room, user._id.toString()) },
  });
}

export async function listRooms(req: Request, res: Response) {
  const user = currentUser(req);

  const rooms = await Room.find({ 'members.user': user._id })
    .sort({ updatedAt: -1 })
    .limit(50)
    .populate('owner', 'username')
    .populate('members.user', 'username');

  res.json({
    success: true,
    data: {
      rooms: rooms.map((room) => {
        // Dashboard cards need counts, not the workspace contents.
        const dto = toRoomDTO(room, user._id.toString());
        return { ...dto, fileCount: dto.files.filter((f) => f.type === 'file').length };
      }),
    },
  });
}

export async function getRoom(req: Request, res: Response) {
  const user = currentUser(req);
  const { roomId } = req.params as { roomId: string };
  const userId = user._id.toString();
  const room = await findRoomOr404(roomId, true);

  if (!isMember(room, userId) && !room.isPublic) {
    throw ApiError.forbidden('This room is private', 'ROOM_PRIVATE');
  }
  if (needsPassword(room, userId)) {
    throw ApiError.forbidden('This room is password protected', 'PASSWORD_REQUIRED');
  }

  // Legacy rooms become workspaces the first time they are opened.
  await migrateFilesAtomically(room);

  res.json({ success: true, data: { room: toRoomDTO(room, userId) } });
}

export async function joinRoom(req: Request, res: Response) {
  const user = currentUser(req);
  const { roomId } = req.params as { roomId: string };
  const userId = user._id.toString();

  const room = await Room.findOne({ roomId }).select('+docState');
  if (!room) throw ApiError.notFound('Room not found', 'ROOM_NOT_FOUND');

  const alreadyMember = isMember(room, userId);
  if (!alreadyMember) {
    if (!room.isPublic) throw ApiError.forbidden('This room is private', 'ROOM_PRIVATE');
  }

  // Checked before enrolment: a stranger only becomes a member by clearing the
  // password (see unlockRoom), so membership alone never unlocks room data.
  if (needsPassword(room, userId)) {
    throw ApiError.forbidden('This room is password protected', 'PASSWORD_REQUIRED');
  }

  if (!alreadyMember) {
    // Joining by ID is read-only; the owner promotes people who should edit.
    await Room.updateOne(
      { _id: room._id, 'members.user': { $ne: user._id } },
      { $push: { members: { user: user._id, role: 'viewer', lastSeenAt: new Date() } } },
    );
    room.members.push({ user: user._id, role: 'viewer', lastSeenAt: new Date() });
  }
  await migrateFilesAtomically(room);

  await room.populate([
    { path: 'owner', select: 'username' },
    { path: 'members.user', select: 'username' },
  ]);

  res.json({
    success: true,
    data: { room: toRoomDTO(room, userId), joined: !alreadyMember },
  });
}

/**
 * Password check. On success the member row is stamped so the user is not
 * prompted again until the password changes. The password itself is never
 * stored, echoed, or put in a token.
 */
export async function unlockRoom(req: Request, res: Response) {
  const user = currentUser(req);
  const { roomId } = req.params as { roomId: string };
  const { password } = req.body as RoomPasswordInput;
  const userId = user._id.toString();

  const room = await Room.findOne({ roomId }).select('+passwordHash +docState');
  if (!room) throw ApiError.notFound('Room not found', 'ROOM_NOT_FOUND');
  if (!room.isPublic && !isMember(room, userId)) {
    throw ApiError.forbidden('This room is private', 'ROOM_PRIVATE');
  }

  const ok = await verifyRoomPassword(room, password);
  if (!ok) throw ApiError.unauthorized('Incorrect password', 'BAD_ROOM_PASSWORD');

  let member = room.members.find((m) => refId(m.user) === userId);
  if (!member) {
    room.members.push({ user: user._id, role: 'viewer', lastSeenAt: new Date() });
    member = room.members[room.members.length - 1];
  }
  member.passwordOkAt = new Date();
  await room.save();
  await migrateFilesAtomically(room);

  await room.populate([
    { path: 'owner', select: 'username' },
    { path: 'members.user', select: 'username' },
  ]);

  res.json({ success: true, data: { room: toRoomDTO(room, userId) } });
}

export async function updateSettings(req: Request, res: Response) {
  const user = currentUser(req);
  const { roomId } = req.params as { roomId: string };
  const body = req.body as UpdateSettingsInput;
  const userId = user._id.toString();

  const room = await Room.findOne({ roomId }).select('+passwordHash');
  if (!room) throw ApiError.notFound('Room not found', 'ROOM_NOT_FOUND');
  assertOwner(room, userId);

  const activities: { type: ActivityType; metadata?: Record<string, string> }[] = [];

  if (body.name !== undefined && body.name !== room.name) {
    room.name = body.name;
    activities.push({ type: 'ROOM_SETTINGS_CHANGED', metadata: { name: body.name } });
  }
  if (body.isPublic !== undefined && body.isPublic !== room.isPublic) {
    room.isPublic = body.isPublic;
    activities.push({
      type: 'ROOM_SETTINGS_CHANGED',
      metadata: { access: body.isPublic ? 'public' : 'private' },
    });
  }
  if (body.password) {
    if (body.password.enabled && body.password.value) {
      await setRoomPassword(room, body.password.value);
      activities.push({ type: 'PASSWORD_ENABLED' });
    } else if (!body.password.enabled) {
      room.passwordEnabled = false;
      room.passwordHash = undefined;
      activities.push({ type: 'PASSWORD_DISABLED' });
    }
  }

  await room.save();

  await room.populate([
    { path: 'owner', select: 'username' },
    { path: 'members.user', select: 'username' },
  ]);
  refreshRoom(room);
  if (activities.some((activity) => activity.type === 'PASSWORD_ENABLED')) {
    // Everyone but the owner has to clear the new password before continuing.
    await evictSessions(room, 'PASSWORD_REQUIRED', 'The owner changed the room password', (id) => id === userId);
  }

  for (const activity of activities) {
    await recordActivity({
      roomObjectId: room._id,
      roomId,
      actor: { id: userId, username: user.username },
      type: activity.type,
      metadata: activity.metadata,
    });
  }

  res.json({ success: true, data: { room: toRoomDTO(room, userId) } });
}

/**
 * Role management. Owner-only, and the owner cannot demote themselves — that
 * would leave the room without anyone able to administer it.
 */
export async function updateMemberRole(req: Request, res: Response) {
  const user = currentUser(req);
  const { roomId, userId: targetId } = req.params as { roomId: string; userId: string };
  const { role } = req.body as UpdateRoleInput;
  const actorId = user._id.toString();

  const room = await Room.findOne({ roomId });
  if (!room) throw ApiError.notFound('Room not found', 'ROOM_NOT_FOUND');
  assertOwner(room, actorId);

  if (targetId === ownerId(room)) {
    throw ApiError.badRequest('The owner role cannot be changed', 'CANNOT_CHANGE_OWNER');
  }

  const member = room.members.find((m) => refId(m.user) === targetId);
  if (!member) throw ApiError.notFound('That user is not a member of this room', 'NOT_A_MEMBER');

  const previous = member.role;
  if (previous === role) {
    res.json({ success: true, data: { userId: targetId, role } });
    return;
  }

  member.role = role;
  await room.save();

  // Live enforcement: refresh the server-side role cache on the target's
  // sockets so an open session flips to read-only without a reload.
  const io = getIO();
  if (io) {
    for (const peer of await io.in(roomId).fetchSockets()) {
      if (peer.data.user?.userId !== targetId) continue;
      peer.data.roles.set(roomId, role);
      peer.emit('room:role', { roomId, role });
    }
    await broadcastMembers(io, roomId);
  }

  const target = room.members.find((m) => refId(m.user) === targetId);
  await recordActivity({
    roomObjectId: room._id,
    roomId,
    actor: { id: actorId, username: user.username },
    type: 'ROLE_CHANGED',
    metadata: { userId: targetId, from: previous, to: target?.role ?? role },
  });

  res.json({ success: true, data: { userId: targetId, role } });
}

export async function listActivity(req: Request, res: Response) {
  const user = currentUser(req);
  const { roomId } = req.params as { roomId: string };
  const { group, limit } = req.query as unknown as ActivityQuery;

  const room = await Room.findOne({ roomId }).select('_id isPublic members owner passwordEnabled');
  if (!room) throw ApiError.notFound('Room not found', 'ROOM_NOT_FOUND');
  const viewerId = user._id.toString();
  if (!isMember(room, viewerId)) {
    throw ApiError.forbidden('Join the room to see its activity', 'NOT_A_MEMBER');
  }
  if (needsPassword(room, viewerId)) {
    throw ApiError.forbidden('This room is password protected', 'PASSWORD_REQUIRED');
  }

  const filter: Record<string, unknown> = { room: room._id };
  if (group !== 'all') {
    filter.type = { $in: ACTIVITY_GROUPS[group as keyof typeof ACTIVITY_GROUPS] };
  }

  const entries = await ActivityLog.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('actor', 'username');

  res.json({
    success: true,
    data: { activity: entries.map((entry) => activityView(entry, roomId)) },
  });
}

export async function deleteRoom(req: Request, res: Response) {
  const user = currentUser(req);
  const { roomId } = req.params as { roomId: string };

  const room = await Room.findOne({ roomId });
  if (!room) throw ApiError.notFound('Room not found', 'ROOM_NOT_FOUND');
  if (ownerId(room) !== user._id.toString()) {
    throw ApiError.forbidden('Only the room owner can delete this room', 'NOT_ROOM_OWNER');
  }

  await Message.deleteMany({ room: room._id });
  await ActivityLog.deleteMany({ room: room._id });
  await room.deleteOne();
  await evictSessions(room, 'ROOM_NOT_FOUND', 'This room was deleted by its owner');
  evictRoomDocs(roomId);

  res.json({ success: true, data: { deleted: true } });
}

export async function listMessages(req: Request, res: Response) {
  const user = currentUser(req);
  const { roomId } = req.params as { roomId: string };
  const { before, limit } = req.query as unknown as MessageQuery;

  const room = await Room.findOne({ roomId });
  if (!room) throw ApiError.notFound('Room not found', 'ROOM_NOT_FOUND');
  const viewerId = user._id.toString();
  if (!isMember(room, viewerId) && !room.isPublic) {
    throw ApiError.forbidden('This room is private', 'ROOM_PRIVATE');
  }
  // Chat is room content: a locked room keeps it behind the password too.
  if (needsPassword(room, viewerId)) {
    throw ApiError.forbidden('This room is password protected', 'PASSWORD_REQUIRED');
  }

  const filter: Record<string, unknown> = { room: room._id };
  if (before) filter.createdAt = { $lt: new Date(before) };

  const messages = await Message.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('sender', 'username');

  res.json({
    success: true,
    data: {
      // Newest-first from the DB; the client reverses for display.
      messages: messages.map((m) => ({
        id: m._id.toString(),
        roomId,
        text: m.text,
        sender: userView(m.sender) ?? { id: String(m.sender), username: 'Unknown' },
        createdAt: m.createdAt.toISOString(),
      })),
    },
  });
}
