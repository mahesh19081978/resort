import { prisma } from '@/lib/db/prisma';
import { Prisma, StockMovementType } from '@prisma/client';
import { recordAuditEvent } from '@/lib/auth/audit';

export interface DeductOrderInventoryParams {
  orderId: string;
  storeId?: string;
  userId?: string | null;
}

/**
 * Phase 0.6 Inventory Boundary Service:
 * Inquires recipes (BOM) for items in a completed/served restaurant order
 * and records transactional StockMovement audit entries (STOCK_ISSUE)
 * without premature or arbitrary cart-level mutations.
 */
export async function deductOrderRecipeStock(
  params: DeductOrderInventoryParams,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const { orderId, storeId, userId } = params;

  return await (client === prisma
    ? prisma.$transaction(async (tx) => runDeduct(tx))
    : runDeduct(client as Prisma.TransactionClient));

  async function runDeduct(tx: Prisma.TransactionClient) {
    const order = await tx.restaurantOrder.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            menuItem: {
              include: {
                recipe: {
                  include: {
                    ingredients: {
                      include: {
                        inventoryItem: true,
                      },
                    },
                  },
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

    // Identify target kitchen store
    let targetStoreId = storeId;
    if (!targetStoreId) {
      const kitchenStore = await tx.store.findFirst({
        where: { code: 'STORE-KIT', isActive: true },
      });
      targetStoreId = kitchenStore?.id;
    }

    const deductions = [];

    for (const item of order.items) {
      const recipe = item.menuItem.recipe;
      if (!recipe || !recipe.ingredients.length) {
        continue;
      }

      const yieldCount = recipe.yieldCount || 1;
      const orderPortions = item.quantity;

      for (const ingredient of recipe.ingredients) {
        const qtyPerYield = ingredient.quantity;
        const totalIngredientQty = qtyPerYield
          .times(orderPortions)
          .dividedBy(yieldCount);

        const movementNumber =
          'MOV-' +
          new Date().toISOString().slice(0, 10).replace(/-/g, '') +
          '-' +
          Math.floor(1000 + Math.random() * 9000);

        const standardCost = ingredient.inventoryItem.standardCost || new Prisma.Decimal(0);
        const totalCost = standardCost.times(totalIngredientQty);

        const movement = await tx.stockMovement.create({
          data: {
            movementNumber,
            itemId: ingredient.inventoryItemId,
            movementType: StockMovementType.STOCK_ISSUE,
            quantity: new Prisma.Decimal(totalIngredientQty.toFixed(4)),
            unitCost: standardCost,
            totalCost: new Prisma.Decimal(totalCost.toFixed(2)),
            fromStoreId: targetStoreId || null,
            performedById: userId || null,
            remarks: `Auto consumption: Order #${order.orderNumber} - ${item.menuItem.name} (${item.quantity}x)`,
          },
        });

        deductions.push({
          itemId: ingredient.inventoryItemId,
          itemName: ingredient.inventoryItem.name,
          quantity: totalIngredientQty.toNumber(),
          movementNumber: movement.movementNumber,
        });
      }
    }

    if (deductions.length > 0) {
      await recordAuditEvent(
        {
          userId,
          action: 'RESTAURANT_INVENTORY_CONSUMPTION',
          entity: 'RestaurantOrder',
          entityId: order.id,
          newValues: {
            orderNumber: order.orderNumber,
            deductionsCount: deductions.length,
            deductions,
          },
        },
        tx
      );
    }

    return {
      success: true,
      orderNumber: order.orderNumber,
      deductions,
    };
  }
}
