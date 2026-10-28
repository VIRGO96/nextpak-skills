import express from 'express';
import { usersRouter } from './routes/users';

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/v1/users', usersRouter);

  return app;
}
