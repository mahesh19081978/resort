import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Fail-closed safety guard for E2E testing
if (process.env.E2E_TEST_MODE === 'true') {
  const dbUrl = process.env.DATABASE_URL || '';
  const allowedHostPatterns = (process.env.E2E_ALLOWED_DB_HOSTS || 'ep-aged-wind')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const blockedHostPatterns = ['ep-frosty-hall'];

  const isExplicitlyBlocked = blockedHostPatterns.some((pattern) => dbUrl.includes(pattern));
  const isExplicitlyAllowed = allowedHostPatterns.some((pattern) => dbUrl.includes(pattern));

  if (isExplicitlyBlocked || !isExplicitlyAllowed || !dbUrl) {
    throw new Error(
      '[CRITICAL DATABASE SAFETY GUARD] E2E_TEST_MODE is active but DATABASE_URL targets an unauthorized or protected database. Refusing to connect to protect business data.'
    );
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: process.env.DATABASE_URL ? { db: { url: process.env.DATABASE_URL } } : undefined,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;