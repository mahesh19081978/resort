import { prisma } from '@/lib/db/prisma';
import type { Prisma } from '@prisma/client';

export interface AuditEventParams {
  userId?: string | null;
  action: 'LOGIN_SUCCESS' | 'LOGIN_FAILURE' | 'LOGOUT' | 'PASSWORD_CHANGE' | 'ROLE_ASSIGN' | string;
  entity: string;
  entityId: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Safely records a security or business audit event to the database.
 * If a transaction client (`tx`) is provided, writes within the transaction so mutation + audit are atomic.
 * If logging fails within a transaction, the error propagates so the entire transaction rolls back.
 */
export async function recordAuditEvent(
  params: AuditEventParams,
  tx?: Prisma.TransactionClient
): Promise<void> {
  const db = tx || prisma;
  try {
    // Exclude any accidentally passed password or secret keys
    const sanitizedOld = params.oldValues ? sanitizeValues(params.oldValues) : undefined;
    const sanitizedNew = params.newValues ? sanitizeValues(params.newValues) : undefined;

    await db.auditLog.create({
      data: {
        userId: params.userId || null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        oldValues: sanitizedOld ? JSON.parse(JSON.stringify(sanitizedOld)) : undefined,
        newValues: sanitizedNew ? JSON.parse(JSON.stringify(sanitizedNew)) : undefined,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
      },
    });
  } catch (error) {
    if (tx) {
      // Within transaction: do not swallow error, rethrow to ensure rollback
      throw error;
    }
    // Silently log in server console if DB connection is offline (e.g. during placeholder setup)
    console.warn(`[AuditLog] Non-blocking audit record failed:`, (error as Error).message);
  }
}

function sanitizeValues(obj: Record<string, unknown>): Record<string, unknown> {
  const clean = { ...obj };
  const sensitiveKeys = ['password', 'passwordHash', 'token', 'secret', 'authSecret'];
  for (const key of Object.keys(clean)) {
    if (sensitiveKeys.some((s) => key.toLowerCase().includes(s.toLowerCase()))) {
      clean[key] = '[REDACTED]';
    }
  }
  return clean;
}