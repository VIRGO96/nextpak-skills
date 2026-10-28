import { Router } from 'express';
import { requireAuth } from '../middleware/auth';

export const usersRouter = Router();

usersRouter.get('/me', requireAuth, (req, res) => {
  const { id, name, email, phone } = req.user!;
  res.json({ id, name, email, phone });
});
