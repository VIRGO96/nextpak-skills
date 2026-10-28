import type { RequestHandler } from 'express';
import * as db from '../db';

export const requireAuth: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const userId = db.tokens[token];
  const user = db.users.find((u) => u.id === userId);
  if (!user) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  req.user = user;
  next();
};
