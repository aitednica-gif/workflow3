import { Router, Response } from 'express';
import { loginHandler, registerHandler, meHandler } from '../controllers/authController';
import { validate } from '../middleware/validate';
import { authMiddleware } from '../middleware/auth';
import { registerSchema, loginSchema, RegisterInput, LoginInput } from '../lib/validation';
import { AuthenticatedRequest } from '../middleware/auth';

const router = Router();

router.post(
  '/register',
  validate(registerSchema),
  async (req: AuthenticatedRequest<{}, {}, RegisterInput>, res: Response): Promise<void> => {
    await registerHandler(req, res);
  }
);

router.post(
  '/login',
  validate(loginSchema),
  async (req: AuthenticatedRequest<{}, {}, LoginInput>, res: Response): Promise<void> => {
    await loginHandler(req, res);
  }
);

router.get(
  '/me',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    await meHandler(req, res);
  }
);

export default router;