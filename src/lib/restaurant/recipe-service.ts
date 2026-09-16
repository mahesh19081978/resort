import { prisma } from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';
import { recordAuditEvent } from '@/lib/auth/audit';

export interface RecipeIngredientInput {
  inventoryItemId: string;
  quantity: number;
  notes?: string | null;
}

export interface SaveRecipeParams {
  menuItemId: string;
  yieldCount: number;
  instructions?: string | null;
  ingredients: RecipeIngredientInput[];
  userId?: string | null;
}

/**
 * Calculates Estimated Recipe Cost:
 * \sum (quantity * InventoryItem.standardCost)
 *
 * This is an operational estimate based on current standardCost and BOM quantities.
 * It is NOT an authoritative inventory valuation ledger entry.
 */
export function calculateEstimatedRecipeCost(
  ingredients: Array<{ quantity: Prisma.Decimal | number; standardCost: Prisma.Decimal | number }>
): Prisma.Decimal {
  let total = new Prisma.Decimal(0);
  for (const ing of ingredients) {
    const qty = new Prisma.Decimal(ing.quantity.toString());
    const cost = new Prisma.Decimal(ing.standardCost.toString());
    total = total.plus(qty.times(cost));
  }
  return new Prisma.Decimal(total.toFixed(2));
}

/**
 * Fetch recipe for a menu item with ingredients and base units.
 */
export async function getRecipeForMenuItem(menuItemId: string) {
  const recipe = await prisma.recipe.findUnique({
    where: { menuItemId },
    include: {
      menuItem: true,
      ingredients: {
        include: {
          inventoryItem: {
            include: { baseUnit: true },
          },
        },
      },
    },
  });

  if (!recipe) return null;

  const estimatedCost = calculateEstimatedRecipeCost(
    recipe.ingredients.map((ing) => ({
      quantity: ing.quantity,
      standardCost: ing.inventoryItem.standardCost,
    }))
  );

  return {
    ...recipe,
    estimatedCost: estimatedCost.toFixed(2),
  };
}

/**
 * Save or update recipe BOM.
 *
 * INVARIANTS ENFORCED:
 * 1. NEVER deducts stock or creates StockMovement.
 * 2. NEVER creates or modifies historical InventoryConsumption snapshots.
 * 3. Atomic transaction: updates Recipe header and line ingredients.
 * 4. Audit logged.
 */
export async function saveRecipe(
  params: SaveRecipeParams,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const { menuItemId, yieldCount, instructions, ingredients, userId } = params;

  if (yieldCount < 1) {
    throw new Error('Yield count must be at least 1.');
  }

  if (!ingredients.length) {
    throw new Error('Recipe must contain at least one ingredient.');
  }

  return await (client === prisma
    ? prisma.$transaction(async (tx) => runSave(tx), { timeout: 15000 })
    : runSave(client as Prisma.TransactionClient));

  async function runSave(tx: Prisma.TransactionClient) {
    // 1. Verify MenuItem exists
    const menuItem = await tx.menuItem.findUniqueOrThrow({ where: { id: menuItemId } });

    // 2. Verify all inventory items exist
    const invIds = ingredients.map((i) => i.inventoryItemId);
    const existingInvItems = await tx.inventoryItem.findMany({
      where: { id: { in: invIds } },
      include: { baseUnit: true },
    });

    if (existingInvItems.length !== new Set(invIds).size) {
      throw new Error('One or more selected inventory items do not exist.');
    }

    const invMap = new Map(existingInvItems.map((item) => [item.id, item]));

    // 3. Upsert Recipe Header
    const recipe = await tx.recipe.upsert({
      where: { menuItemId },
      update: {
        yieldCount,
        instructions: instructions || null,
      },
      create: {
        menuItemId,
        yieldCount,
        instructions: instructions || null,
      },
    });

    // 4. Replace Ingredients in transaction
    await tx.recipeIngredient.deleteMany({
      where: { recipeId: recipe.id },
    });

    const createdIngredients = [];
    for (const ing of ingredients) {
      const created = await tx.recipeIngredient.create({
        data: {
          recipeId: recipe.id,
          inventoryItemId: ing.inventoryItemId,
          quantity: new Prisma.Decimal(ing.quantity.toFixed(4)),
          notes: ing.notes || null,
        },
        include: {
          inventoryItem: { include: { baseUnit: true } },
        },
      });
      createdIngredients.push(created);
    }

    const estimatedCost = calculateEstimatedRecipeCost(
      createdIngredients.map((ci) => ({
        quantity: ci.quantity,
        standardCost: ci.inventoryItem.standardCost,
      }))
    );

    await recordAuditEvent(
      {
        userId,
        action: 'RECIPE_BOM_SAVED',
        entity: 'Recipe',
        entityId: recipe.id,
        newValues: {
          menuItemId,
          menuItemName: menuItem.name,
          yieldCount,
          ingredientCount: createdIngredients.length,
          estimatedCost: estimatedCost.toString(),
        },
      },
      tx
    );

    return {
      ...recipe,
      ingredients: createdIngredients,
      estimatedCost: estimatedCost.toFixed(2),
    };
  }
}

/**
 * Delete a recipe and its BOM ingredients for a menu item.
 */
export async function deleteRecipe(
  recipeId: string,
  userId?: string | null,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  return await (client === prisma
    ? prisma.$transaction(async (tx) => runDelete(tx))
    : runDelete(client as Prisma.TransactionClient));

  async function runDelete(tx: Prisma.TransactionClient) {
    const recipe = await tx.recipe.findUniqueOrThrow({
      where: { id: recipeId },
      include: { menuItem: true },
    });

    await tx.recipeIngredient.deleteMany({
      where: { recipeId },
    });

    const deleted = await tx.recipe.delete({
      where: { id: recipeId },
    });

    await recordAuditEvent(
      {
        userId,
        action: 'RECIPE_BOM_DELETED',
        entity: 'Recipe',
        entityId: recipe.id,
        oldValues: {
          menuItemId: recipe.menuItemId,
          menuItemName: recipe.menuItem.name,
        },
      },
      tx
    );

    return deleted;
  }
}

/**
 * @deprecated Legacy Phase 0.6 method permanently disabled in Phase 0.7.
 */
export async function deductOrderRecipeStock(_params: { orderId: string }): Promise<never> {
  throw new Error(
    'deductOrderRecipeStock is permanently deprecated and disabled in Phase 0.7. Stock deduction must go through InventoryConsumption and KOT workflow.'
  );
}
