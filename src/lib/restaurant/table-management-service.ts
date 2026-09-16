import { prisma } from '@/lib/db/prisma';
import { Prisma, TableStatus, TableSessionStatus } from '@prisma/client';
import { recordAuditEvent } from '@/lib/auth/audit';

export interface UpsertTableParams {
  id?: string;
  restaurantId: string;
  sittingAreaId: string;
  tableNumber: string;
  capacity: number;
  isActive?: boolean;
  userId?: string | null;
}

export interface BulkCreateTablesParams {
  restaurantId: string;
  sittingAreaId: string;
  prefix: string;
  startNumber: number;
  count: number;
  capacity: number;
  userId?: string | null;
}

/**
 * List all tables for a restaurant with SittingArea relation, grouped for management and POS.
 */
export async function listTables(
  restaurantId: string,
  options?: {
    sittingAreaId?: string;
    includeArchived?: boolean;
    activeOnly?: boolean;
  }
) {
  const where: Prisma.RestaurantTableWhereInput = {
    restaurantId,
    ...(options?.includeArchived ? {} : { isArchived: false }),
    ...(options?.activeOnly ? { isActive: true } : {}),
    ...(options?.sittingAreaId ? { sittingAreaId: options.sittingAreaId } : {}),
  };

  return await prisma.restaurantTable.findMany({
    where,
    include: {
      sittingArea: true,
      sessionTables: {
        where: {
          session: {
            status: { in: [TableSessionStatus.ACTIVE, TableSessionStatus.BILLED] },
          },
        },
        include: {
          session: {
            include: {
              tables: { include: { table: true } },
              orders: true,
            },
          },
        },
      },
    },
    orderBy: [
      { sittingArea: { displayOrder: 'asc' } },
      { tableNumber: 'asc' },
    ],
  });
}

/**
 * Upsert a single table.
 *
 * SAFETY INVARIANTS:
 * 1. Configuration UI CANNOT modify operational status (AVAILABLE, OCCUPIED, etc.).
 * 2. Renaming a table preserves the table ID and all historical references.
 * 3. Deactivating an OCCUPIED table is rejected until its session is closed.
 */
export async function upsertTable(
  params: UpsertTableParams,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const { id, restaurantId, sittingAreaId, tableNumber, capacity, isActive = true, userId } = params;

  return await (client === prisma
    ? prisma.$transaction(async (tx) => runUpsert(tx))
    : runUpsert(client as Prisma.TransactionClient));

  async function runUpsert(tx: Prisma.TransactionClient) {
    // Verify SittingArea exists and belongs to restaurant
    const area = await tx.sittingArea.findFirst({
      where: { id: sittingAreaId, restaurantId },
    });
    if (!area) {
      throw new Error('Selected sitting area does not exist for this restaurant.');
    }

    if (id) {
      const existing = await tx.restaurantTable.findUniqueOrThrow({
        where: { id },
        include: {
          sessionTables: {
            where: {
              session: {
                status: { in: [TableSessionStatus.ACTIVE, TableSessionStatus.BILLED] },
              },
            },
          },
        },
      });

      // Reject deactivation if engaged in an active dining session
      if (existing.isActive && !isActive && existing.sessionTables.length > 0) {
        throw new Error(
          `Cannot deactivate table "${existing.tableNumber}" while it is engaged in an active dining session.`
        );
      }

      const updated = await tx.restaurantTable.update({
        where: { id },
        data: {
          sittingAreaId,
          tableNumber,
          capacity,
          isActive,
        },
        include: { sittingArea: true },
      });

      await recordAuditEvent(
        {
          userId,
          action: 'TABLE_UPDATED',
          entity: 'RestaurantTable',
          entityId: updated.id,
          oldValues: {
            tableNumber: existing.tableNumber,
            capacity: existing.capacity,
            sittingAreaId: existing.sittingAreaId,
            isActive: existing.isActive,
          },
          newValues: {
            tableNumber: updated.tableNumber,
            capacity: updated.capacity,
            sittingAreaId: updated.sittingAreaId,
            isActive: updated.isActive,
          },
        },
        tx
      );

      return updated;
    } else {
      const created = await tx.restaurantTable.create({
        data: {
          restaurantId,
          sittingAreaId,
          tableNumber,
          capacity,
          isActive,
          status: TableStatus.AVAILABLE,
        },
        include: { sittingArea: true },
      });

      await recordAuditEvent(
        {
          userId,
          action: 'TABLE_CREATED',
          entity: 'RestaurantTable',
          entityId: created.id,
          newValues: {
            tableNumber: created.tableNumber,
            capacity: created.capacity,
            sittingAreaId: created.sittingAreaId,
            isActive: created.isActive,
          },
        },
        tx
      );

      return created;
    }
  }
}

/**
 * Concurrency-Safe Bulk Table Creation.
 *
 * Generates formatted table numbers (e.g. R-01 to R-06).
 * Executes in a SINGLE transaction with DB unique constraint protection.
 * If ANY collision occurs (or concurrent transaction causes P2002),
 * rolls back the entire batch cleanly (zero tables created).
 */
export async function bulkCreateTables(
  params: BulkCreateTablesParams,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const { restaurantId, sittingAreaId, prefix, startNumber, count, capacity, userId } = params;

  if (count < 1 || count > 50) {
    throw new Error('Count must be between 1 and 50 tables.');
  }
  if (capacity < 1 || capacity > 50) {
    throw new Error('Capacity must be between 1 and 50.');
  }

  // Pre-generate candidate numbers
  const candidateNumbers: string[] = [];
  for (let i = 0; i < count; i++) {
    const num = startNumber + i;
    const padded = num < 10 ? `0${num}` : `${num}`;
    candidateNumbers.push(`${prefix}-${padded}`);
  }

  return await (client === prisma
    ? prisma.$transaction(async (tx) => runBulk(tx), { timeout: 20000 })
    : runBulk(client as Prisma.TransactionClient));

  async function runBulk(tx: Prisma.TransactionClient) {
    // 1. Verify SittingArea
    const area = await tx.sittingArea.findFirst({
      where: { id: sittingAreaId, restaurantId },
    });
    if (!area) {
      throw new Error('Selected sitting area does not exist for this restaurant.');
    }

    // 2. Pre-check candidate collisions in database
    const existingCollisions = await tx.restaurantTable.findMany({
      where: {
        restaurantId,
        tableNumber: { in: candidateNumbers },
      },
      select: { tableNumber: true },
    });

    if (existingCollisions.length > 0) {
      const existingList = existingCollisions.map((t) => t.tableNumber).join(', ');
      throw new Error(
        `Bulk creation rejected: table number(s) [${existingList}] already exist in this restaurant. Entire batch rolled back.`
      );
    }

    // 3. Create all tables atomically
    const createdTables = [];
    for (const tableNumber of candidateNumbers) {
      const created = await tx.restaurantTable.create({
        data: {
          restaurantId,
          sittingAreaId,
          tableNumber,
          capacity,
          isActive: true,
          status: TableStatus.AVAILABLE,
        },
      });
      createdTables.push(created);
    }

    await recordAuditEvent(
      {
        userId,
        action: 'TABLES_BULK_CREATED',
        entity: 'RestaurantTable',
        entityId: area.id,
        newValues: {
          sittingAreaName: area.name,
          count: createdTables.length,
          tableNumbers: candidateNumbers,
          capacity,
        },
      },
      tx
    );

    return createdTables;
  }
}

/**
 * Delete or safely archive a table.
 * If the table has historical TableSession references, hard delete is blocked and it is marked archived.
 */
export async function deleteOrArchiveTable(
  tableId: string,
  userId?: string | null,
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<{ hardDeleted: boolean; table: any }> {
  return await (client === prisma
    ? prisma.$transaction(async (tx) => runDeleteOrArchive(tx))
    : runDeleteOrArchive(client as Prisma.TransactionClient));

  async function runDeleteOrArchive(tx: Prisma.TransactionClient) {
    const table = await tx.restaurantTable.findUniqueOrThrow({
      where: { id: tableId },
      include: {
        sessionTables: { select: { sessionId: true }, take: 1 },
      },
    });

    const hasHistory = table.sessionTables.length > 0;

    if (hasHistory) {
      // Historical session exists: cannot hard delete
      const archived = await tx.restaurantTable.update({
        where: { id: tableId },
        data: {
          isActive: false,
          isArchived: true,
        },
      });

      await recordAuditEvent(
        {
          userId,
          action: 'TABLE_ARCHIVED',
          entity: 'RestaurantTable',
          entityId: table.id,
          oldValues: { tableNumber: table.tableNumber, isArchived: table.isArchived },
          newValues: { tableNumber: table.tableNumber, isArchived: true, isActive: false },
        },
        tx
      );

      return { hardDeleted: false, table: archived };
    }

    // Zero history: safe hard delete
    const deleted = await tx.restaurantTable.delete({ where: { id: tableId } });

    await recordAuditEvent(
      {
        userId,
        action: 'TABLE_DELETED',
        entity: 'RestaurantTable',
        entityId: table.id,
        oldValues: { tableNumber: table.tableNumber },
      },
      tx
    );

    return { hardDeleted: true, table: deleted };
  }
}
