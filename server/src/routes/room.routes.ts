import { Router } from 'express';
import {
  createRoom,
  deleteRoom,
  getRoom,
  joinRoom,
  listActivity,
  listMessages,
  listRooms,
  unlockRoom,
  updateMemberRole,
  updateSettings,
} from '../controllers/room.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { roomPasswordLimiter } from '../middleware/rateLimit.middleware';
import { validate } from '../middleware/validate.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import {
  activityQuerySchema,
  createRoomSchema,
  messageQuerySchema,
  roleParamSchema,
  roomIdParamSchema,
  roomPasswordSchema,
  updateRoleSchema,
  updateSettingsSchema,
} from '../validation/schemas';

const router = Router();

// Every room route is authenticated; membership and role are checked per handler.
router.use(asyncHandler(requireAuth));

router.post('/', validate(createRoomSchema), asyncHandler(createRoom));
router.get('/', asyncHandler(listRooms));

router.get('/:roomId', validate(roomIdParamSchema, 'params'), asyncHandler(getRoom));
router.post('/:roomId/join', validate(roomIdParamSchema, 'params'), asyncHandler(joinRoom));
router.delete('/:roomId', validate(roomIdParamSchema, 'params'), asyncHandler(deleteRoom));

// Room password attempts are brute-forceable, so they get their own limiter.
router.post(
  '/:roomId/unlock',
  roomPasswordLimiter,
  validate(roomIdParamSchema, 'params'),
  validate(roomPasswordSchema),
  asyncHandler(unlockRoom),
);

router.patch(
  '/:roomId/settings',
  validate(roomIdParamSchema, 'params'),
  validate(updateSettingsSchema),
  asyncHandler(updateSettings),
);

router.patch(
  '/:roomId/members/:userId/role',
  validate(roleParamSchema, 'params'),
  validate(updateRoleSchema),
  asyncHandler(updateMemberRole),
);

router.get(
  '/:roomId/activity',
  validate(roomIdParamSchema, 'params'),
  validate(activityQuerySchema, 'query'),
  asyncHandler(listActivity),
);

router.get(
  '/:roomId/messages',
  validate(roomIdParamSchema, 'params'),
  validate(messageQuerySchema, 'query'),
  asyncHandler(listMessages),
);

export default router;
