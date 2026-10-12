import { prisma } from '../lib/prisma';

beforeAll(async () => {
  await prisma.$connect();
  // Ensure tables exist
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE, password TEXT, "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME DEFAULT CURRENT_TIMESTAMP)`;
}, 30000);

afterAll(async () => {
  await prisma.$disconnect();
}, 30000);

afterEach(async () => {
  await prisma.user.deleteMany();
}, 30000);

export { prisma };