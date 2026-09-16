import { prisma } from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';
import { recordAuditEvent } from '@/lib/auth/audit';

export interface UpsertSittingAreaParams {
  id?: string;
  restaurantId: string;
  name: string;
  code: string;
  description?: string | null;
  displayOrder?: number;
  isActive?: boolean;
  userId?: string | null;
}

/**
 * List all sitting areas for a restaurant including table counts.
 */
export async function listSittingAreas(restaurantId: string) {
  return await prisma.sittingArea.findMany({
    where: { restaurantId },
    include: {
      _count: {
        select: {
          tables: { where: { isArchived: false } },
        },
      },
      tables: {
        where: { isArchived: false },
        orderBy: { tableNumber: 'asc' },
      },
    },
    orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
  });
}

/**
 * Upsert sitting area with code/name uniqueness per restaurant and audit trail.
 */
export async function upsertSittingArea(
  params: UpsertSittingAreaParams,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const { id, restaurantId, name, code, description, displayOrder = 0, isActive = true, userId } = params;

  return await (client === prisma
    ? prisma.$transaction(async (tx) => runUpsert(tx))
    : runUpsert(client as Prisma.TransactionClient));

  async function runUpsert(tx: Prisma.TransactionClient) {
    if (id) {
      const existing = await tx.sittingArea.findUniqueOrThrow({ where: { id } });

      const updated = await tx.sittingArea.update({
        where: { id },
        data: {
          name,
          code,
          description: description || null,
          displayOrder,
          isActive,
        },
      });

      await recordAuditEvent(
        {
          userId,
          action: 'SITTING_AREA_UPDATED',
          entity: 'SittingArea',
          entityId: updated.id,
          oldValues: { name: existing.name, code: existing.code, isActive: existing.isActive },
          newValues: { name: updated.name, code: updated.code, isActive: updated.isActive },
        },
        tx
      );

      return updated;
    } else {
      const created = await tx.sittingArea.create({
        data: {
          restaurantId,
          name,
          code,
          description: description || null,
          displayOrder,
          isActive,
        },
      });

      await recordAuditEvent(
        {
          userId,
          action: 'SITTING_AREA_CREATED',
          entity: 'SittingArea',
          entityId: created.id,
          newValues: { restaurantId, name, code, isActive },
        },
        tx
      );

      return created;
    }
  }
}

/**
 * Toggle sitting area active status.
 */
export async function toggleSittingAreaActive(
  sittingAreaId: string,
  isActive: boolean,
  userId?: string | null,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  return await (client === prisma
    ? prisma.$transaction(async (tx) => runToggle(tx))
    : runToggle(client as Prisma.TransactionClient));

  async function runToggle(tx: Prisma.TransactionClient) {
    const area = await tx.sittingArea.findUniqueOrThrow({ where: { id: sittingAreaId } });

    const updated = await tx.sittingArea.update({
      where: { id: sittingAreaId },
      data: { isActive },
    });

    await recordAuditEvent(
      {
        userId,
        action: 'SITTING_AREA_STATUS_CHANGED',
        entity: 'SittingArea',
        entityId: area.id,
        oldValues: { name: area.name, isActive: area.isActive },
        newValues: { name: area.name, isActive },
      },
      tx
    );

    return updated;
  }
}
