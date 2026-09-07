import { prisma } from '@/lib/db/prisma';
import { Prisma, KOTStatus } from '@prisma/client';
import { generateRestaurantNumber } from './numbers';
import { recordAuditEvent } from '@/lib/auth/audit';

export interface FireKOTItemInput {
  orderItemId: string;
  quantity: number;
  notes?: string | null;
}

export interface FireKOTParams {
  orderId: string;
  items: FireKOTItemInput[];
  kitchenNote?: string | null;
  userId?: string | null;
}

export interface UpdateKOTStatusParams {
  kotId: string;
  status: 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED';
  cancellationReason?: string | null;
  userId?: string | null;
}

/**
 * Fires a new KOT against an existing order.
 * One RestaurantOrder can have MULTIPLE KOTs.
 * Server-side validation guarantees the sum of KOT quantities for each order item
 * cannot exceed the total ordered quantity.
 */
export async function fireKOT(
  params: FireKOTParams,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const { orderId, items, kitchenNote, userId } = params;

  if (!items.length) {
    throw new Error('At least one item must be specified to fire a KOT.');
  }

  return await (client === prisma
    ? prisma.$transaction(async (tx) => runFire(tx))
    : runFire(client as Prisma.TransactionClient));

  async function runFire(tx: Prisma.TransactionClient) {
    const order = await tx.restaurantOrder.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            kotItems: {
              where: {
                kot: {
                  status: { not: 'CANCELLED' },
                },
              },
            },
          },
        },
      },
    });

    if (!order) {
      throw new Error('Restaurant order not found.');
    }

    if (order.status === 'CANCELLED' || order.status === 'COMPLETED') {
      throw new Error(`Cannot fire KOT for order in state ${order.status}.`);
    }

    const orderItemMap = new Map(order.items.map((i) => [i.id, i]));

    // Validate quantities for each item
    for (const reqItem of items) {
      const orderItem = orderItemMap.get(reqItem.orderItemId);
      if (!orderItem) {
        throw new Error(`Order item ${reqItem.orderItemId} does not belong to this order.`);
      }

      // Compute existing fired quantities across non-cancelled KOTs
      const alreadyFiredQty = orderItem.kotItems.reduce((sum, ki) => sum + ki.quantity, 0);
      const remainingAllowed = orderItem.quantity - alreadyFiredQty;

      if (reqItem.quantity <= 0) {
        throw new Error(`KOT quantity for item must be greater than zero.`);
      }

      if (reqItem.quantity > remainingAllowed) {
        throw new Error(
          `QUANTITY_OVERFLOW: Cannot fire ${reqItem.quantity} units of item. Only ${remainingAllowed} remaining to prepare (Order total: ${orderItem.quantity}, Already fired: ${alreadyFiredQty}).`
        );
      }
    }

    // Create KOT
    const kotNumber = generateRestaurantNumber('KOT');
    const kot = await tx.kOT.create({
      data: {
        kotNumber,
        orderId,
        status: KOTStatus.SENT,
        serverUserId: userId || null,
        kitchenNote: kitchenNote || null,
        items: {
          create: items.map((i) => {
            const orderItem = orderItemMap.get(i.orderItemId)!;
            return {
              orderItemId: i.orderItemId,
              menuItemId: orderItem.menuItemId,
              quantity: i.quantity,
              notes: i.notes || null,
            };
          }),
        },
      },
      include: {
        items: {
          include: {
            menuItem: true,
          },
        },
      },
    });

    // Update order status to PREPARING if currently CONFIRMED or PENDING
    if (order.status === 'PENDING' || order.status === 'CONFIRMED') {
      await tx.restaurantOrder.update({
        where: { id: orderId },
        data: { status: 'PREPARING' },
      });
    }

    await recordAuditEvent(
      {
        userId,
        action: 'KOT_FIRE',
        entity: 'KOT',
        entityId: kot.id,
        newValues: {
          kotNumber: kot.kotNumber,
          orderId,
          itemCount: items.length,
        },
      },
      tx
    );

    return { success: true, kot };
  }
}

/**
 * Transitions KOT status: SENT -> PREPARING -> READY -> SERVED (or CANCELLED).
 * Records timestamps for kitchen SLA tracking.
 */
export async function updateKOTStatus(
  params: UpdateKOTStatusParams,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const { kotId, status, cancellationReason, userId } = params;

  return await (client === prisma
    ? prisma.$transaction(async (tx) => runUpdate(tx))
    : runUpdate(client as Prisma.TransactionClient));

  async function runUpdate(tx: Prisma.TransactionClient) {
    const kot = await tx.kOT.findUnique({
      where: { id: kotId },
      include: {
        order: {
          include: {
            kots: true,
          },
        },
      },
    });

    if (!kot) {
      throw new Error('KOT not found.');
    }

    // Validate valid transitions
    const validTransitions: Record<string, string[]> = {
      SENT: ['PREPARING', 'READY', 'CANCELLED'],
      PREPARING: ['READY', 'CANCELLED'],
      READY: ['SERVED', 'CANCELLED'],
      SERVED: [],
      CANCELLED: [],
    };

    const allowed = validTransitions[kot.status] || [];
    if (!allowed.includes(status)) {
      throw new Error(`Invalid KOT state transition from ${kot.status} to ${status}.`);
    }

    const now = new Date();
    const updateData: Prisma.KOTUpdateInput = {
      status: status as KOTStatus,
    };

    if (status === 'PREPARING' && !kot.preparedAt) {
      updateData.preparedAt = now;
    } else if (status === 'READY') {
      updateData.readyAt = now;
    } else if (status === 'SERVED') {
      updateData.servedAt = now;
    }

    const updatedKOT = await tx.kOT.update({
      where: { id: kotId },
      data: updateData,
    });

    // Check if ALL non-cancelled fired quantities for all order items are SERVED to advance order status to SERVED
    if (status === 'SERVED') {
      // Query order items and all non-cancelled KOT items for this order
      const orderWithItems = await tx.restaurantOrder.findUnique({
        where: { id: kot.orderId },
        include: {
          items: {
            include: {
              kotItems: {
                where: {
                  kot: {
                    status: { not: 'CANCELLED' },
                  },
                },
                include: {
                  kot: true,
                },
              },
            },
          },
        },
      });

      if (orderWithItems && (orderWithItems.status === 'CONFIRMED' || orderWithItems.status === 'PREPARING')) {
        let hasAnyFiredKots = false;
        let allItemsFullyServed = true;

        for (const item of orderWithItems.items) {
          const firedKots = item.kotItems;
          if (firedKots.length > 0) {
            hasAnyFiredKots = true;
          }

          // Total quantity fired across non-cancelled KOTs
          const totalFiredQty = firedKots.reduce((sum, ki) => sum + ki.quantity, 0);

          // Total quantity served across SERVED KOTs (taking into account the currently updating KOT)
          const totalServedQty = firedKots
            .filter((ki) => (ki.kotId === kotId ? true : ki.kot.status === 'SERVED'))
            .reduce((sum, ki) => sum + ki.quantity, 0);

          // If item has not been fully fired, or served quantity does not match fired quantity, not fully served
          if (totalFiredQty < item.quantity || totalServedQty < totalFiredQty) {
            allItemsFullyServed = false;
            break;
          }
        }

        if (hasAnyFiredKots && allItemsFullyServed) {
          await tx.restaurantOrder.update({
            where: { id: kot.orderId },
            data: { status: 'SERVED' },
          });
        }
      }
    }

    await recordAuditEvent(
      {
        userId,
        action: 'KOT_STATUS_UPDATE',
        entity: 'KOT',
        entityId: kot.id,
        oldValues: { status: kot.status },
        newValues: { status, reason: cancellationReason || null },
      },
      tx
    );

    return { success: true, kot: updatedKOT };
  }
}
