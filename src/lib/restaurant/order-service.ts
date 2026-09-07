import { prisma } from '@/lib/db/prisma';
import { Prisma, OrderType, OrderStatus, TableSessionStatus, StayStatus } from '@prisma/client';
import { generateRestaurantNumber } from './numbers';
import { recordAuditEvent } from '@/lib/auth/audit';

export interface CreateOrderItemInput {
  menuItemId: string;
  quantity: number;
  notes?: string | null;
}

export interface CreateOrderParams {
  restaurantId: string;
  orderType: OrderType;
  tableSessionId?: string | null;
  stayId?: string | null;
  roomId?: string | null;
  notes?: string | null;
  items: CreateOrderItemInput[];
  fireKOTImmediately?: boolean;
  kitchenNote?: string | null;
  userId?: string | null;
}

export async function createRestaurantOrder(
  params: CreateOrderParams,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const {
    restaurantId,
    orderType,
    tableSessionId,
    stayId,
    roomId,
    notes,
    items,
    fireKOTImmediately = true,
    kitchenNote,
    userId,
  } = params;

  if (!items.length) {
    throw new Error('Order must have at least one menu item.');
  }

  return await (client === prisma
    ? prisma.$transaction(async (tx) => runCreate(tx), { timeout: 15000 })
    : runCreate(client as Prisma.TransactionClient));

  async function runCreate(tx: Prisma.TransactionClient) {
    // 1. Validate Order Type Context
    if (orderType === OrderType.DINE_IN) {
      if (!tableSessionId) {
        throw new Error('Table session is required for DINE_IN orders.');
      }
      const session = await tx.tableSession.findUnique({
        where: { id: tableSessionId },
      });
      if (!session || session.status !== TableSessionStatus.ACTIVE) {
        throw new Error('Specified dining session does not exist or is not active.');
      }
    } else if (orderType === OrderType.ROOM_SERVICE) {
      if (!stayId || !roomId) {
        throw new Error('Active Stay and Room reference are required for ROOM_SERVICE orders.');
      }
      const stay = await tx.stay.findUnique({
        where: { id: stayId },
        include: {
          roomAssignments: {
            where: { status: 'ACTIVE' },
          },
        },
      });
      if (!stay || stay.status !== StayStatus.ACTIVE) {
        throw new Error('Specified stay is not currently active.');
      }
      const hasRoom = stay.roomAssignments.some((ra) => ra.roomId === roomId);
      if (!hasRoom) {
        throw new Error('Room is not actively assigned to the specified stay.');
      }
    }

    // 2. Fetch all menu items from database to snapshot price & tax securely (Never trust client)
    const menuItemIds = items.map((i) => i.menuItemId);
    const dbMenuItems = await tx.menuItem.findMany({
      where: {
        id: { in: menuItemIds },
        isAvailable: true,
      },
    });

    if (dbMenuItems.length !== new Set(menuItemIds).size) {
      throw new Error('One or more requested menu items are unavailable or do not exist.');
    }

    const itemMap = new Map(dbMenuItems.map((item) => [item.id, item]));

    // 3. Create Order
    const orderNumber = generateRestaurantNumber('ORD');
    const order = await tx.restaurantOrder.create({
      data: {
        orderNumber,
        restaurantId,
        orderType,
        status: OrderStatus.CONFIRMED,
        tableSessionId: orderType === OrderType.DINE_IN ? tableSessionId : null,
        stayId: orderType === OrderType.ROOM_SERVICE ? stayId : null,
        roomId: orderType === OrderType.ROOM_SERVICE ? roomId : null,
        notes: notes || null,
      },
    });

    // 4. Create Order Items with authoritative financial snapshots (Decimal)
    const createdItems = [];
    for (const itemInput of items) {
      const dbItem = itemMap.get(itemInput.menuItemId)!;
      const createdItem = await tx.restaurantOrderItem.create({
        data: {
          orderId: order.id,
          menuItemId: dbItem.id,
          quantity: itemInput.quantity,
          unitPrice: dbItem.price,
          taxRate: dbItem.taxRate,
          notes: itemInput.notes || null,
        },
      });
      createdItems.push({
        ...createdItem,
        menuItemName: dbItem.name,
      });
    }

    // 5. If fireKOTImmediately is true, generate initial KOT
    let initialKOT = null;
    if (fireKOTImmediately) {
      const kotNumber = generateRestaurantNumber('KOT');
      initialKOT = await tx.kOT.create({
        data: {
          kotNumber,
          orderId: order.id,
          status: 'SENT',
          serverUserId: userId || null,
          kitchenNote: kitchenNote || null,
          items: {
            create: createdItems.map((ci) => ({
              orderItemId: ci.id,
              menuItemId: ci.menuItemId,
              quantity: ci.quantity,
              notes: ci.notes || null,
            })),
          },
        },
        include: {
          items: {
            include: { menuItem: true },
          },
        },
      });
    }

    // 6. Record Audit Log
    await recordAuditEvent(
      {
        userId,
        action: 'RESTAURANT_ORDER_CREATE',
        entity: 'RestaurantOrder',
        entityId: order.id,
        newValues: {
          orderNumber: order.orderNumber,
          orderType,
          itemCount: items.length,
          kotNumber: initialKOT?.kotNumber || null,
        },
      },
      tx
    );

    return {
      order,
      items: createdItems,
      kot: initialKOT,
    };
  }
}

export interface CancelOrderParams {
  orderId: string;
  reason?: string;
  userId?: string | null;
}

export async function cancelRestaurantOrder(
  params: CancelOrderParams,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const { orderId, reason, userId } = params;

  return await (client === prisma
    ? prisma.$transaction(async (tx) => runCancel(tx))
    : runCancel(client as Prisma.TransactionClient));

  async function runCancel(tx: Prisma.TransactionClient) {
    const order = await tx.restaurantOrder.findUnique({
      where: { id: orderId },
      include: {
        kots: true,
        bills: true,
      },
    });

    if (!order) {
      throw new Error('Restaurant order not found.');
    }

    if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.COMPLETED) {
      throw new Error(`Order cannot be cancelled in state ${order.status}.`);
    }

    // Check if any bills are settled
    const hasSettledBill = order.bills.some(
      (b) => b.status === 'SETTLED' || b.status === 'CHARGED_TO_ROOM'
    );
    if (hasSettledBill) {
      throw new Error('Cannot cancel an order with settled or room-charged bills.');
    }

    // Update order status
    const updatedOrder = await tx.restaurantOrder.update({
      where: { id: orderId },
      data: { status: OrderStatus.CANCELLED },
    });

    // Cancel all open KOTs
    await tx.kOT.updateMany({
      where: {
        orderId,
        status: { in: ['DRAFT', 'SENT', 'PREPARING'] },
      },
      data: { status: 'CANCELLED' },
    });

    // Cancel open bills
    await tx.restaurantBill.updateMany({
      where: {
        orderId,
        status: { in: ['DRAFT', 'ISSUED'] },
      },
      data: { status: 'CANCELLED' },
    });

    await recordAuditEvent(
      {
        userId,
        action: 'RESTAURANT_ORDER_CANCEL',
        entity: 'RestaurantOrder',
        entityId: order.id,
        oldValues: { status: order.status },
        newValues: { status: OrderStatus.CANCELLED, reason: reason || null },
      },
      tx
    );

    return { success: true, order: updatedOrder };
  }
}

export interface AddItemsToOrderParams {
  orderId: string;
  items: CreateOrderItemInput[];
  fireKOTImmediately?: boolean;
  kitchenNote?: string | null;
  userId?: string | null;
}

/**
 * Appends new items to an active order (incremental ordering).
 */
export async function addItemsToOrder(
  params: AddItemsToOrderParams,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const { orderId, items, fireKOTImmediately = false, kitchenNote, userId } = params;

  if (!items.length) {
    throw new Error('At least one item must be added.');
  }

  return await (client === prisma
    ? prisma.$transaction(async (tx) => runAdd(tx), { timeout: 15000 })
    : runAdd(client as Prisma.TransactionClient));

  async function runAdd(tx: Prisma.TransactionClient) {
    const order = await tx.restaurantOrder.findUnique({
      where: { id: orderId },
      include: { bills: { where: { status: { in: ['SETTLED', 'CHARGED_TO_ROOM'] } } } },
    });

    if (!order) {
      throw new Error('Restaurant order not found.');
    }

    if (order.status === 'CANCELLED' || order.status === 'COMPLETED') {
      throw new Error(`Cannot add items to order in state ${order.status}.`);
    }

    if (order.bills.length > 0) {
      throw new Error('Cannot add items to an order with settled or charged bills.');
    }

    const menuItemIds = items.map((i) => i.menuItemId);
    const dbMenuItems = await tx.menuItem.findMany({
      where: { id: { in: menuItemIds }, isAvailable: true },
    });

    if (dbMenuItems.length !== new Set(menuItemIds).size) {
      throw new Error('One or more requested menu items are unavailable or do not exist.');
    }

    const itemMap = new Map(dbMenuItems.map((item) => [item.id, item]));

    const createdItems = [];
    for (const itemInput of items) {
      const dbItem = itemMap.get(itemInput.menuItemId)!;
      const createdItem = await tx.restaurantOrderItem.create({
        data: {
          orderId: order.id,
          menuItemId: dbItem.id,
          quantity: itemInput.quantity,
          unitPrice: dbItem.price,
          taxRate: dbItem.taxRate,
          notes: itemInput.notes || null,
        },
      });
      createdItems.push({
        ...createdItem,
        menuItemName: dbItem.name,
      });
    }

    // If order was SERVED or BILLED, adding new unfired items rolls back to PREPARING / CONFIRMED
    if (order.status === 'SERVED' || order.status === 'BILLED') {
      await tx.restaurantOrder.update({
        where: { id: order.id },
        data: { status: OrderStatus.PREPARING },
      });
    }

    let incrementalKOT = null;
    if (fireKOTImmediately) {
      const kotNumber = generateRestaurantNumber('KOT');
      incrementalKOT = await tx.kOT.create({
        data: {
          kotNumber,
          orderId: order.id,
          status: 'SENT',
          serverUserId: userId || null,
          kitchenNote: kitchenNote || null,
          items: {
            create: createdItems.map((ci) => ({
              orderItemId: ci.id,
              menuItemId: ci.menuItemId,
              quantity: ci.quantity,
              notes: ci.notes || null,
            })),
          },
        },
        include: {
          items: { include: { menuItem: true } },
        },
      });
    }

    await recordAuditEvent(
      {
        userId,
        action: 'RESTAURANT_ORDER_ADD_ITEMS',
        entity: 'RestaurantOrder',
        entityId: order.id,
        newValues: {
          orderNumber: order.orderNumber,
          addedItemsCount: createdItems.length,
          kotNumber: incrementalKOT?.kotNumber || null,
        },
      },
      tx
    );

    return {
      orderId: order.id,
      items: createdItems,
      kot: incrementalKOT,
    };
  }
}

export interface VoidOrderItemParams {
  orderItemId: string;
  reason: string;
  userId?: string | null;
}

/**
 * Voids an order item before or after firing with audit trail.
 * If already fired, requires authorized void reason.
 */
export async function voidOrderItem(
  params: VoidOrderItemParams,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const { orderItemId, reason, userId } = params;

  if (!reason || !reason.trim()) {
    throw new Error('A valid reason is required to void an order item.');
  }

  return await (client === prisma
    ? prisma.$transaction(async (tx) => runVoid(tx))
    : runVoid(client as Prisma.TransactionClient));

  async function runVoid(tx: Prisma.TransactionClient) {
    const orderItem = await tx.restaurantOrderItem.findUnique({
      where: { id: orderItemId },
      include: {
        order: {
          include: {
            bills: {
              where: { status: { in: ['SETTLED', 'CHARGED_TO_ROOM'] } },
            },
          },
        },
        kotItems: {
          include: { kot: true },
        },
      },
    });

    if (!orderItem) {
      throw new Error('Order item not found.');
    }

    if (orderItem.order.bills.length > 0) {
      throw new Error('Cannot void items from an order with settled or room-charged bills.');
    }

    // Cancel non-served KOT items
    for (const ki of orderItem.kotItems) {
      if (ki.kot.status === 'SENT' || ki.kot.status === 'PREPARING') {
        // Log voided KOT item
      }
    }

    await tx.restaurantOrderItem.delete({
      where: { id: orderItemId },
    });

    await recordAuditEvent(
      {
        userId,
        action: 'RESTAURANT_ORDER_ITEM_VOID',
        entity: 'RestaurantOrderItem',
        entityId: orderItemId,
        oldValues: {
          orderId: orderItem.orderId,
          menuItemId: orderItem.menuItemId,
          quantity: orderItem.quantity,
          unitPrice: orderItem.unitPrice.toNumber(),
        },
        newValues: {
          reason,
        },
      },
      tx
    );

    return { success: true, orderItemId };
  }
}
