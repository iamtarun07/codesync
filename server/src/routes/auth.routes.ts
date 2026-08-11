import { Router } from 'express';
import { login, logout, me, register } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { authLimiter } from '../middleware/rateLimit.middleware';
import { validate } from '../middleware/validate.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { loginSchema, registerSchema } from '../validation/schemas';

const router = Router();

router.post('/register', authLimiter, validate(registerSchema), asyncHandler(register));
router.post('/login', authLimiter, validate(loginSchema), asyncHandler(login));
router.get('/me', asyncHandler(requireAuth), asyncHandler(me));
router.post('/logout', asyncHandler(logout));

export default router;
