import request from 'supertest';
import express from 'express';
import authRoutes from '../routes/auth';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { hashPassword, generateToken, verifyToken } from '../lib/auth';

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);

  app.get('/api/profile', authMiddleware, (req: AuthenticatedRequest, res) => {
    res.json({ user: req.user });
  });

  return app;
};

describe('Auth Controller', () => {
  let app: express.Express;

  beforeEach(() => {
    app = createApp();
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      const hashedPassword = await hashPassword('password123');
      await prisma.user.create({
        data: {
          email: 'test@example.com',
          password: hashedPassword,
        },
      });
    });

    it('should login with valid credentials and return 200 with token', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123',
        })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(typeof response.body.token).toBe('string');
      expect(response.body.token.length).toBeGreaterThan(0);

      const payload = verifyToken(response.body.token);
      expect(payload).not.toBeNull();
      expect(payload!.userId).toBeDefined();
    });

    it('should return 401 for wrong password', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword',
        })
        .expect(401);

      expect(response.body.error).toBe('Invalid credentials');
    });

    it('should return 401 for non-existent user', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123',
        })
        .expect(401);

      expect(response.body.error).toBe('Invalid credentials');
    });

    it('should return 400 for missing credentials', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'test@example.com',
        })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should return 400 for invalid email format', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'invalid-email',
          password: 'password123',
        })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should return token expiring in 24h', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123',
        })
        .expect(200);

      const payload = verifyToken(response.body.token);
      expect(payload).not.toBeNull();

      const now = Math.floor(Date.now() / 1000);
      const exp = (payload as any).exp;
      expect(exp - now).toBeLessThanOrEqual(24 * 60 * 60 + 10);
      expect(exp - now).toBeGreaterThan(24 * 60 * 60 - 10);
    });
  });

  describe('POST /auth/register', () => {
    it('should register a new user and return 201', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'newuser@example.com',
          password: 'password123',
        })
        .expect(201);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user.email).toBe('newuser@example.com');
      expect(response.body).toHaveProperty('token');

      const user = await prisma.user.findUnique({
        where: { email: 'newuser@example.com' },
      });
      expect(user).not.toBeNull();
      expect(user!.email).toBe('newuser@example.com');
    });

    it('should return 409 for duplicate email', async () => {
      await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123',
        })
        .expect(201);

      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'differentpassword',
        })
        .expect(409);

      expect(response.body.error).toBe('Email already registered');
    });

    it('should return 400 for invalid email', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'invalid-email',
          password: 'password123',
        })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should return 400 for short password', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'short',
        })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should hash password with bcrypt cost >= 10', async () => {
      await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123',
        })
        .expect(201);

      const user = await prisma.user.findUnique({
        where: { email: 'test@example.com' },
      });

      expect(user!.password).not.toBe('password123');
      expect(user!.password.startsWith('$2a$') || user!.password.startsWith('$2b$') || user!.password.startsWith('$2y$')).toBe(true);

      const costMatch = user!.password.match(/^\$2[aby]\$(\d{2})\$/);
      expect(costMatch).not.toBeNull();
      const cost = parseInt(costMatch![1], 10);
      expect(cost).toBeGreaterThanOrEqual(10);
    });
  });

  describe('GET /auth/me', () => {
    let userToken: string;
    let userId: string;

    beforeEach(async () => {
      const hashedPassword = await hashPassword('password123');
      const user = await prisma.user.create({
        data: {
          email: 'test@example.com',
          password: hashedPassword,
        },
      });
      userId = user.id;
      userToken = generateToken(userId);
    });

    it('should return user info with valid token', async () => {
      const response = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user.id).toBe(userId);
      expect(response.body.user.email).toBe('test@example.com');
    });

    it('should return 401 without token', async () => {
      const response = await request(app)
        .get('/auth/me')
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    it('should return 401 with invalid token', async () => {
      const response = await request(app)
        .get('/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.error).toBe('Invalid or expired token');
    });

    it('should return 401 for deleted user', async () => {
      await prisma.user.delete({ where: { id: userId } });

      const response = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(401);

      expect(response.body.error).toBe('User not found');
    });
  });
});
