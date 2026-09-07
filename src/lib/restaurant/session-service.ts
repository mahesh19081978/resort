import { prisma } from '@/lib/db/prisma';
import { Prisma, TableStatus, TableSessionStatus } from '@prisma/client';
import { generateRestaurantNumber } from './numbers';
import { recordAuditEvent } from '@/lib/auth/audit';

export interface OpenSessionParams {
  restaurantId: string;
  tableIds: string[];
  paxCount: number;
  guestName?: string | null;
  userId?: string | null;
}

export interface CloseSessionParams {
  sessionId: string;
  force?: boolean;
  userId?: string | null;
}

export interface AddTablesParams {
  sessionId: string;
  tableIds: string[];
  userId?: string | null;
}

export async function openTableSession(params: OpenSessionParams, client: Prisma.TransactionClient | typeof prisma = prisma) {
  const { restaurantId, tableIds, paxCount, guestName, userId } = params;

  if (!tableIds.length) {
    throw new Error('At least one table must be specified to open a dining session.');
  }

  return await (client === prisma ? prisma.$transaction(async (tx) => runOpen(tx), { timeout: 15000 }) : runOpen(client as Prisma.TransactionClient));

  async function runOpen(tx: Prisma.TransactionClient) {
    // 1. Fetch tables and verify ownership and availability
    const tables = await tx.restaurantTable.findMany({
      where: {
        id: { in: tableIds },
        restaurantId,
        isActive: true,
      },
      include: {
        sessionTables: {
          where: {
            session: {
              status: { in: [TableSessionStatus.ACTIVE, TableSessionStatus.BILLED] },
            },
          },
          include: {
            session: true,
          },
        },
      },
    });

    if (tables.length !== tableIds.length) {
      throw new Error('One or more selected tables were not found or are deactivated.');
    }

    // 2. Concurrency check: Ensure none of the tables are already attached to an active or billed session
    for (const table of tables) {
      if (table.sessionTables.length > 0) {
        const activeSession = table.sessionTables[0].session;
        throw new Error(
          `CONFLICT: Table "${table.tableNumber}" is already engaged in active session ${activeSession.sessionCode}.`
        );
      }
      if (table.status !== TableStatus.AVAILABLE) {
        throw new Error(`Table "${table.tableNumber}" is not available (Current status: ${table.status}).`);
      }
    }

    // 3. Create TableSession
    const sessionCode = generateRestaurantNumber('SES');
    const session = await tx.tableSession.create({
      data: {
        sessionCode,
        status: TableSessionStatus.ACTIVE,
        guestName: guestName || null,
        paxCount,
        openedAt: new Date(),
      },
    });

    // 4. Associate physical tables via link table TableSessionTable
    await tx.tableSessionTable.createMany({
      data: tableIds.map((tableId) => ({
        sessionId: session.id,
        tableId,
        joinedAt: new Date(),
      })),
    });

    // 5. Update table statuses: OCCUPIED (or JOINED if multiple tables)
    const targetStatus = tableIds.length > 1 ? TableStatus.JOINED : TableStatus.OCCUPIED;
    await tx.restaurantTable.updateMany({
      where: { id: { in: tableIds } },
      data: { status: targetStatus },
    });

    // 6. Record audit log
    await recordAuditEvent(
      {
        userId,
        action: 'TABLE_SESSION_OPEN',
        entity: 'TableSession',
        entityId: session.id,
        newValues: {
          sessionCode: session.sessionCode,
          tableIds,
          paxCount,
          guestName,
          status: TableSessionStatus.ACTIVE,
        },
      },
      tx
    );

    return {
      session,
      tableNumbers: tables.map((t) => t.tableNumber),
    };
  }
}

export async function addTablesToSession(params: AddTablesParams, client: Prisma.TransactionClient | typeof prisma = prisma) {
  const { sessionId, tableIds, userId } = params;

  return await (client === prisma ? prisma.$transaction(async (tx) => runAdd(tx)) : runAdd(client as Prisma.TransactionClient));

  async function runAdd(tx: Prisma.TransactionClient) {
    const session = await tx.tableSession.findUnique({
      where: { id: sessionId },
      include: { tables: true },
    });

    if (!session || session.status !== TableSessionStatus.ACTIVE) {
      throw new Error(`Table session not found or is no longer active.`);
    }

    // Verify candidate tables
    const candidateTables = await tx.restaurantTable.findMany({
      where: {
        id: { in: tableIds },
        isActive: true,
      },
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

    for (const table of candidateTables) {
      if (table.sessionTables.length > 0) {
        throw new Error(`CONFLICT: Table "${table.tableNumber}" is already in use by another session.`);
      }
      if (table.status !== TableStatus.AVAILABLE) {
        throw new Error(`Table "${table.tableNumber}" is not available.`);
      }
    }

    // Attach tables
    await tx.tableSessionTable.createMany({
      data: tableIds.map((tId) => ({
        sessionId: session.id,
        tableId: tId,
      })),
      skipDuplicates: true,
    });

    // Ensure all tables in session are marked JOINED
    const allTableIds = Array.from(new Set([...session.tables.map((t) => t.tableId), ...tableIds]));
    await tx.restaurantTable.updateMany({
      where: { id: { in: allTableIds } },
      data: { status: TableStatus.JOINED },
    });

    await recordAuditEvent(
      {
        userId,
        action: 'TABLE_SESSION_ADD_TABLES',
        entity: 'TableSession',
        entityId: session.id,
        newValues: { addedTableIds: tableIds, totalTables: allTableIds.length },
      },
      tx
    );

    return { success: true, totalTables: allTableIds.length };
  }
}

export async function closeTableSession(params: CloseSessionParams, client: Prisma.TransactionClient | typeof prisma = prisma) {
  const { sessionId, force = false, userId } = params;

  return await (client === prisma ? prisma.$transaction(async (tx) => runClose(tx)) : runClose(client as Prisma.TransactionClient));

  async function runClose(tx: Prisma.TransactionClient) {
    const session = await tx.tableSession.findUnique({
      where: { id: sessionId },
      include: {
        tables: {
          include: { table: true },
        },
        orders: {
          include: {
            bills: true,
          },
        },
      },
    });

    if (!session) {
      throw new Error('Table session not found.');
    }

    if (session.status === TableSessionStatus.CLOSED) {
      return { success: true, session };
    }

    // Check for unsettled orders/bills unless force=true
    if (!force) {
      for (const order of session.orders) {
        if (order.status !== 'COMPLETED' && order.status !== 'CANCELLED') {
          // Check if bills are unsettled
          const openBills = order.bills.filter(
            (b) => b.status === 'ISSUED' || b.status === 'DRAFT'
          );
          if (openBills.length > 0 || order.bills.length === 0) {
            throw new Error(
              `CANNOT_CLOSE_SESSION: Order ${order.orderNumber} is not yet fully settled or billed.`
            );
          }
        }
      }
    }

    const tableIds = session.tables.map((st) => st.tableId);

    // Update session to CLOSED
    const updatedSession = await tx.tableSession.update({
      where: { id: sessionId },
      data: {
        status: TableSessionStatus.CLOSED,
        closedAt: new Date(),
      },
    });

    // Release all physical tables back to AVAILABLE
    if (tableIds.length > 0) {
      await tx.restaurantTable.updateMany({
        where: { id: { in: tableIds } },
        data: { status: TableStatus.AVAILABLE },
      });
    }

    await recordAuditEvent(
      {
        userId,
        action: 'TABLE_SESSION_CLOSE',
        entity: 'TableSession',
        entityId: sessionId,
        oldValues: { status: session.status },
        newValues: { status: TableSessionStatus.CLOSED, releasedTables: tableIds },
      },
      tx
    );

    return { success: true, session: updatedSession };
  }
}
