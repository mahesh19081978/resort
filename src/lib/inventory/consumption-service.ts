import { prisma } from '@/lib/db/prisma';
import { Prisma, StockMovementType } from '@prisma/client';
import { postStockMovement } from './stock-ledger-service';
import { recordAuditEvent } from '@/lib/auth/audit';

export interface ConsumeKOTInventoryParams {
  kotId: string;
  storeId?: string;
  userId?: string | null;
  /**
   * Optional manual mapping of KOTItem served delta.
   * If omitted, will evaluate servedQuantity vs existing consumed portions.
   */
  itemDeltas?: Array<{
    kotItemId: string;
    servedDelta: number;
  }>;
}

export interface ConsumptionItemResult {
  kotItemId: string;
  menuItemName: string;
  servedDelta: number;
  ingredientsDeducted: Array<{
    inventoryItemId: string;
    inventoryItemName: string;
    quantity: number;
    movementNumber: string;
  }>;
}

export interface ConsumeKOTInventoryResult {
  success: boolean;
  kotId: string;
  kotNumber: string;
  orderNumber: string;
  consumptions: ConsumptionItemResult[];
}

/**
 * Hardened Phase 0.7 Kitchen Inventory Consumption Engine.
 *
 * Replaces the defective Phase 0.6 deductOrderRecipeStock().
 *
 * Invariants Enforced:
 * 1. Consumes strictly per KOTItem, traversing:
 *    KOT -> KOTItem -> MenuItem -> Recipe -> RecipeIngredient -> InventoryItem -> StockMovement.
 * 2. Operates strictly on SERVED QUANTITY DELTA (servedDelta), never cumulative quantities.
 * 3. Exact-once idempotency: Stores deterministic sequence & unique idempotency key on immutable InventoryConsumption.
 * 4. Snapshots Recipe ingredients, yields, and standard costs on the consumption record at execution time.
 * 5. Uses transactional row locking (SELECT ... FOR UPDATE) on Stock rows via postStockMovement().
 * 6. Atomically decrements Stock.quantityOnHand and emits authoritative StockMovement(STOCK_ISSUE).
 * 7. Records an AuditLog entry.
 */
export async function consumeKOTInventory(
  params: ConsumeKOTInventoryParams,
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<ConsumeKOTInventoryResult> {
  const { kotId, storeId, userId, itemDeltas } = params;

  return await (client === prisma
    ? prisma.$transaction(async (tx) => runConsumption(tx), {
        maxWait: 10000,
        timeout: 25000,
      })
    : runConsumption(client as Prisma.TransactionClient));

  async function runConsumption(tx: Prisma.TransactionClient): Promise<ConsumeKOTInventoryResult> {
    const kot = await tx.kOT.findUnique({
      where: { id: kotId },
      include: {
        order: true,
        items: {
          include: {
            menuItem: {
              include: {
                recipe: {
                  include: {
                    ingredients: {
                      include: {
                        inventoryItem: {
                          include: {
                            baseUnit: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            consumptions: true,
          },
        },
      },
    });

    if (!kot) {
      throw new Error(`KOT ticket [${kotId}] not found.`);
    }

    // Resolve target Kitchen Store
    let targetStoreId = storeId;
    if (!targetStoreId) {
      const kitchenStore = await tx.store.findFirst({
        where: { code: 'STORE-KIT', isActive: true },
      });
      if (!kitchenStore) {
        throw new Error('Default kitchen store [STORE-KIT] not found or inactive.');
      }
      targetStoreId = kitchenStore.id;
    }

    const consumptionResults: ConsumptionItemResult[] = [];

    for (const kotItem of kot.items) {
      // Determine portions to consume in this run (served delta)
      let delta = 0;

      if (itemDeltas && itemDeltas.length > 0) {
        const matchingDelta = itemDeltas.find((d) => d.kotItemId === kotItem.id);
        if (matchingDelta) {
          delta = matchingDelta.servedDelta;
        }
      } else {
        // Automatic determination:
        // Calculate total already consumed
        const alreadyConsumed = kotItem.consumptions.reduce(
          (sum, c) => sum + c.portionsDelta,
          0
        );

        // Effective consumable portions = servedQuantity (or fired - cancelled if served is 0 but KOT is marked SERVED)
        let effectiveServed = kotItem.servedQuantity;
        if (effectiveServed === 0 && kot.status === 'SERVED') {
          effectiveServed = Math.max(0, kotItem.quantity - kotItem.cancelledQuantity);
        }

        delta = Math.max(0, effectiveServed - alreadyConsumed);
      }

      if (delta <= 0) {
        continue;
      }

      // Check for Recipe BOM
      const recipe = kotItem.menuItem.recipe;
      if (!recipe || !recipe.ingredients.length) {
        // Menu item has no BOM (e.g. non-inventoried or beverage without recipe)
        continue;
      }

      const yieldCount = recipe.yieldCount || 1;
      const sequenceNumber = kotItem.consumptions.length + 1;
      const idempotencyKey = `CONSUME_${kotItem.id}_SEQ_${sequenceNumber}`;

      // Create Recipe BOM Snapshot
      const bomSnapshot = recipe.ingredients.map((ing) => ({
        inventoryItemId: ing.inventoryItemId,
        inventoryItemName: ing.inventoryItem.name,
        baseUnitCode: ing.inventoryItem.baseUnit.code,
        quantityPerYield: ing.quantity.toString(),
        standardCost: ing.inventoryItem.standardCost.toString(),
      }));

      // Create immutable InventoryConsumption record
      const consumptionRecord = await tx.inventoryConsumption.create({
        data: {
          kotItemId: kotItem.id,
          sequenceNumber,
          portionsDelta: delta,
          idempotencyKey,
          recipeId: recipe.id,
          recipeYield: yieldCount,
          bomSnapshot,
        },
      });

      const ingredientsDeducted: Array<{
        inventoryItemId: string;
        inventoryItemName: string;
        quantity: number;
        movementNumber: string;
      }> = [];

      // Deduct ingredients
      for (const ingredient of recipe.ingredients) {
        const qtyPerYield = ingredient.quantity;
        const totalIngredientQty = qtyPerYield.times(delta).dividedBy(yieldCount);

        const movementResult = await postStockMovement(
          {
            storeId: targetStoreId,
            itemId: ingredient.inventoryItemId,
            movementType: StockMovementType.STOCK_ISSUE,
            quantity: totalIngredientQty,
            consumptionId: consumptionRecord.id,
            sourceType: 'KOT_ITEM',
            sourceId: kotItem.id,
            performedById: userId || null,
            remarks: `KOT Consumption: #${kot.kotNumber} (Order #${kot.order.orderNumber}) - ${kotItem.menuItem.name} (Delta: ${delta}x)`,
            allowNegativeStock: false,
          },
          tx
        );

        ingredientsDeducted.push({
          inventoryItemId: ingredient.inventoryItemId,
          inventoryItemName: ingredient.inventoryItem.name,
          quantity: totalIngredientQty.toNumber(),
          movementNumber: movementResult.movementNumber,
        });
      }

      // Update KOTItem servedQuantity to match new cumulative total
      const updatedServed = Math.max(kotItem.servedQuantity, kotItem.consumptions.reduce((sum, c) => sum + c.portionsDelta, 0) + delta);
      await tx.kOTItem.update({
        where: { id: kotItem.id },
        data: { servedQuantity: updatedServed },
      });

      consumptionResults.push({
        kotItemId: kotItem.id,
        menuItemName: kotItem.menuItem.name,
        servedDelta: delta,
        ingredientsDeducted,
      });
    }

    if (consumptionResults.length > 0) {
      await recordAuditEvent(
        {
          userId,
          action: 'KOT_INVENTORY_CONSUMPTION',
          entity: 'KOT',
          entityId: kot.id,
          newValues: {
            kotNumber: kot.kotNumber,
            orderNumber: kot.order.orderNumber,
            itemsConsumed: consumptionResults.length,
            consumptions: consumptionResults,
          },
        },
        tx
      );
    }

    return {
      success: true,
      kotId: kot.id,
      kotNumber: kot.kotNumber,
      orderNumber: kot.order.orderNumber,
      consumptions: consumptionResults,
    };
  }
}
