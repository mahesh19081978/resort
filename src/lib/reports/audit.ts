/**
 * Reports & Analytics — Audit & Activity Report Service
 *
 * Uses existing AuditLog model.
 * Does NOT expose secrets, passwords, session tokens, or sensitive document contents.
 */

import { prisma } from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';
import type { ResolvedPeriodRange } from '@/lib/dashboard/date';

export interface AuditReportSummary {
  totalEvents: number;
  uniqueUsers: number;
  uniqueEntities: number;
  topActions: Array<{ action: string; count: number }>;
}

export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  userId: string;
  userName: string;
  userRole: string;
  action: string;
  entity: string;
  entityId: string;
  changes: Prisma.JsonValue | null;
}

export interface AuditReportData {
  summary: AuditReportSummary;
  hasData: boolean;
}

export async function getAuditReport(
  periodRange: ResolvedPeriodRange
): Promise<AuditReportData> {
  const { current } = periodRange;

  const [totalEvents, uniqueUsersCount, uniqueEntities, topActionsRaw] = await Promise.all([
    prisma.auditLog.count({
      where: {
        createdAt: { gte: current.startTimestamp, lt: current.endTimestamp },
      },
    }),
    prisma.auditLog.groupBy({
      by: ['userId'],
      where: {
        createdAt: { gte: current.startTimestamp, lt: current.endTimestamp },
      },
    }),
    prisma.auditLog.groupBy({
      by: ['entity'],
      where: {
        createdAt: { gte: current.startTimestamp, lt: current.endTimestamp },
      },
    }),
    prisma.auditLog.groupBy({
      by: ['action'],
      where: {
        createdAt: { gte: current.startTimestamp, lt: current.endTimestamp },
      },
      _count: true,
      orderBy: { _count: { action: 'desc' } },
      take: 10,
    }),
  ]);

  const topActions = topActionsRaw.map((a) => ({
    action: a.action,
    count: a._count,
  }));

  return {
    summary: {
      totalEvents,
      uniqueUsers: uniqueUsersCount.length,
      uniqueEntities: uniqueEntities.length,
      topActions,
    },
    hasData: totalEvents > 0,
  };
}

export async function getAuditLogRows(
  periodRange: ResolvedPeriodRange,
  page: number = 1,
  pageSize: number = 50,
  filters?: {
    userId?: string;
    action?: string;
    entity?: string;
  }
) {
  const { current } = periodRange;
  const skip = (page - 1) * pageSize;

  const where: Prisma.AuditLogWhereInput = {
    createdAt: { gte: current.startTimestamp, lt: current.endTimestamp },
    ...(filters?.userId ? { userId: filters.userId } : {}),
    ...(filters?.action ? { action: filters.action } : {}),
    ...(filters?.entity ? { entity: filters.entity } : {}),
  };

  const [rows, totalRecords] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        oldValues: true,
        newValues: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      timestamp: r.createdAt,
      userId: r.user?.id || '',
      userName: r.user?.name || 'Unknown',
      userRole: r.user?.role || 'Unknown',
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      changes: sanitizeAuditChanges(r.oldValues, r.newValues),
    })),
    pagination: {
      page,
      pageSize,
      totalRecords,
      totalPages: Math.ceil(totalRecords / pageSize),
    },
  };
}

/**
 * Sanitize audit log changes to remove sensitive fields.
 */
function sanitizeAuditChanges(
  oldValues: Prisma.JsonValue | null,
  newValues: Prisma.JsonValue | null
): { old?: Record<string, unknown>; new?: Record<string, unknown> } | null {
  const sensitiveKeys = ['password', 'passwordHash', 'sessionVersion', 'token', 'secret', 'documentData', 'photoData'];

  const sanitize = (obj: Record<string, unknown>): Record<string, unknown> => {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk.toLowerCase()))) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = value;
      }
    }
    return result;
  };

  if (!oldValues && !newValues) return null;

  return {
    ...(oldValues && typeof oldValues === 'object' ? { old: sanitize(oldValues as Record<string, unknown>) } : {}),
    ...(newValues && typeof newValues === 'object' ? { new: sanitize(newValues as Record<string, unknown>) } : {}),
  };
}
