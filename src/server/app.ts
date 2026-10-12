import express from 'express';
import authRoutes from './routes/auth';
import { authMiddleware, AuthenticatedRequest } from './middleware/auth';

const app = express();

app.use(express.json());

app.use('/auth', authRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/profile', authMiddleware, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;