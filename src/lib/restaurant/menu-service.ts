import { prisma } from '@/lib/db/prisma';
import { Prisma, MenuItemAvailability } from '@prisma/client';
import { recordAuditEvent } from '@/lib/auth/audit';

/**
 * The ONLY canonical orderability predicate.
 * Both POS UI and order-service must use this exact rule.
 */
export function isMenuItemOrderable(item: {
  isAvailable: boolean;
  isArchived?: boolean;
  availabilityStatus?: MenuItemAvailability | string;
}): boolean {
  if (!item.isAvailable) return false;
  if (item.isArchived) return false;
  if (item.availabilityStatus && item.availabilityStatus !== 'AVAILABLE') return false;
  return true;
}

export interface UpsertMenuCategoryParams {
  id?: string;
  restaurantId: string;
  name: string;
  displayOrder?: number;
  isActive?: boolean;
  userId?: string | null;
}

export interface UpsertMenuItemParams {
  id?: string;
  categoryId: string;
  name: string;
  code: string;
  description?: string | null;
  price: number;
  taxRate?: number;
  taxCode?: string | null;
  isVegetarian?: boolean;
  isAvailable?: boolean;
  availabilityStatus?: MenuItemAvailability;
  prepTimeMinutes?: number | null;
  isArchived?: boolean;
  kitchenStation?: string;
  imageUrl?: string | null;
  userId?: string | null;
}

/**
 * List all categories for a restaurant, ordered by displayOrder.
 */
export async function listMenuCategories(restaurantId: string) {
  return await prisma.menuCategory.findMany({
    where: { restaurantId },
    include: {
      items: {
        where: { isArchived: false },
        orderBy: { name: 'asc' },
      },
    },
    orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
  });
}

/**
 * Upsert category with name uniqueness and audit logging.
 */
export async function upsertMenuCategory(
  params: UpsertMenuCategoryParams,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const { id, restaurantId, name, displayOrder = 0, isActive = true, userId } = params;

  return await (client === prisma
    ? prisma.$transaction(async (tx) => runUpsertCategory(tx))
    : runUpsertCategory(client as Prisma.TransactionClient));

  async function runUpsertCategory(tx: Prisma.TransactionClient) {
    if (id) {
      const existing = await tx.menuCategory.findUniqueOrThrow({ where: { id } });
      const updated = await tx.menuCategory.update({
        where: { id },
        data: { name, displayOrder, isActive },
      });

      await recordAuditEvent(
        {
          userId,
          action: 'MENU_CATEGORY_UPDATED',
          entity: 'MenuCategory',
          entityId: updated.id,
          oldValues: { name: existing.name, displayOrder: existing.displayOrder, isActive: existing.isActive },
          newValues: { name: updated.name, displayOrder: updated.displayOrder, isActive: updated.isActive },
        },
        tx
      );

      return updated;
    } else {
      const created = await tx.menuCategory.create({
        data: { restaurantId, name, displayOrder, isActive },
      });

      await recordAuditEvent(
        {
          userId,
          action: 'MENU_CATEGORY_CREATED',
          entity: 'MenuCategory',
          entityId: created.id,
          newValues: { restaurantId, name, displayOrder, isActive },
        },
        tx
      );

      return created;
    }
  }
}

/**
 * List all menu items for a restaurant with category and recipe relations.
 */
export async function listMenuItems(
  restaurantId: string,
  options?: {
    categoryId?: string;
    includeArchived?: boolean;
    availabilityStatus?: MenuItemAvailability;
    searchQuery?: string;
  }
) {
  const where: Prisma.MenuItemWhereInput = {
    category: { restaurantId },
    ...(options?.includeArchived ? {} : { isArchived: false }),
    ...(options?.categoryId ? { categoryId: options.categoryId } : {}),
    ...(options?.availabilityStatus ? { availabilityStatus: options.availabilityStatus } : {}),
    ...(options?.searchQuery
      ? {
          OR: [
            { name: { contains: options.searchQuery, mode: 'insensitive' } },
            { code: { contains: options.searchQuery, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  return await prisma.menuItem.findMany({
    where,
    include: {
      category: true,
      recipe: {
        include: {
          ingredients: {
            include: {
              inventoryItem: {
                include: { baseUnit: true },
              },
            },
          },
        },
      },
    },
    orderBy: [{ category: { displayOrder: 'asc' } }, { name: 'asc' }],
  });
}

/**
 * Upsert menu item with code uniqueness and audit logging.
 */
export async function upsertMenuItem(
  params: UpsertMenuItemParams,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const {
    id,
    categoryId,
    name,
    code,
    description,
    price,
    taxRate = 5.0,
    taxCode,
    isVegetarian = true,
    isAvailable = true,
    availabilityStatus = 'AVAILABLE',
    prepTimeMinutes,
    isArchived = false,
    kitchenStation = 'MAIN_KITCHEN',
    imageUrl,
    userId,
  } = params;

  return await (client === prisma
    ? prisma.$transaction(async (tx) => runUpsert(tx))
    : runUpsert(client as Prisma.TransactionClient));

  async function runUpsert(tx: Prisma.TransactionClient) {
    const priceDecimal = new Prisma.Decimal(price.toFixed(2));
    const taxRateDecimal = new Prisma.Decimal(taxRate.toFixed(2));

    if (id) {
      const existing = await tx.menuItem.findUniqueOrThrow({ where: { id } });

      const updated = await tx.menuItem.update({
        where: { id },
        data: {
          categoryId,
          name,
          code,
          description: description || null,
          price: priceDecimal,
          taxRate: taxRateDecimal,
          taxCode: taxCode || null,
          isVegetarian,
          isAvailable,
          availabilityStatus,
          prepTimeMinutes: prepTimeMinutes || null,
          isArchived,
          kitchenStation,
          imageUrl: imageUrl || null,
        },
      });

      await recordAuditEvent(
        {
          userId,
          action: 'MENU_ITEM_UPDATED',
          entity: 'MenuItem',
          entityId: updated.id,
          oldValues: {
            name: existing.name,
            code: existing.code,
            price: existing.price.toString(),
            availabilityStatus: existing.availabilityStatus,
          },
          newValues: {
            name: updated.name,
            code: updated.code,
            price: updated.price.toString(),
            availabilityStatus: updated.availabilityStatus,
          },
        },
        tx
      );

      return updated;
    } else {
      const created = await tx.menuItem.create({
        data: {
          categoryId,
          name,
          code,
          description: description || null,
          price: priceDecimal,
          taxRate: taxRateDecimal,
          taxCode: taxCode || null,
          isVegetarian,
          isAvailable,
          availabilityStatus,
          prepTimeMinutes: prepTimeMinutes || null,
          isArchived,
          kitchenStation,
          imageUrl: imageUrl || null,
        },
      });

      await recordAuditEvent(
        {
          userId,
          action: 'MENU_ITEM_CREATED',
          entity: 'MenuItem',
          entityId: created.id,
          newValues: {
            name: created.name,
            code: created.code,
            price: created.price.toString(),
            availabilityStatus: created.availabilityStatus,
          },
        },
        tx
      );

      return created;
    }
  }
}

/**
 * Update price with strict audit trail.
 */
export async function updateMenuItemPrice(
  menuItemId: string,
  newPrice: number,
  userId?: string | null,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  if (newPrice <= 0) {
    throw new Error('Price must be greater than zero.');
  }

  const priceDecimal = new Prisma.Decimal(newPrice.toFixed(2));

  return await (client === prisma
    ? prisma.$transaction(async (tx) => runUpdatePrice(tx))
    : runUpdatePrice(client as Prisma.TransactionClient));

  async function runUpdatePrice(tx: Prisma.TransactionClient) {
    const item = await tx.menuItem.findUniqueOrThrow({ where: { id: menuItemId } });
    const oldPrice = item.price;

    const updated = await tx.menuItem.update({
      where: { id: menuItemId },
      data: { price: priceDecimal },
    });

    await recordAuditEvent(
      {
        userId,
        action: 'MENU_ITEM_PRICE_CHANGED',
        entity: 'MenuItem',
        entityId: item.id,
        oldValues: { name: item.name, code: item.code, price: oldPrice.toString() },
        newValues: { name: item.name, code: item.code, price: priceDecimal.toString() },
      },
      tx
    );

    return updated;
  }
}

/**
 * Set menu item availability status.
 */
export async function setMenuItemAvailability(
  menuItemId: string,
  status: MenuItemAvailability,
  isAvailable?: boolean,
  userId?: string | null,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const effectiveAvailable = isAvailable !== undefined ? isAvailable : status === 'AVAILABLE';

  return await (client === prisma
    ? prisma.$transaction(async (tx) => runUpdateAvailability(tx))
    : runUpdateAvailability(client as Prisma.TransactionClient));

  async function runUpdateAvailability(tx: Prisma.TransactionClient) {
    const item = await tx.menuItem.findUniqueOrThrow({ where: { id: menuItemId } });

    const updated = await tx.menuItem.update({
      where: { id: menuItemId },
      data: {
        availabilityStatus: status,
        isAvailable: effectiveAvailable,
      },
    });

    await recordAuditEvent(
      {
        userId,
        action: 'MENU_ITEM_AVAILABILITY_CHANGED',
        entity: 'MenuItem',
        entityId: item.id,
        oldValues: { name: item.name, code: item.code, availabilityStatus: item.availabilityStatus, isAvailable: item.isAvailable },
        newValues: { name: item.name, code: item.code, availabilityStatus: status, isAvailable: effectiveAvailable },
      },
      tx
    );

    return updated;
  }
}

/**
 * Delete or safely archive a menu item.
 * Deeply checks all FK / historical references across OrderItem, KOTItem, Recipe, etc.
 * If historical dependencies exist, archival is performed instead of hard-deletion.
 */
export async function deleteOrArchiveMenuItem(
  menuItemId: string,
  userId?: string | null,
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<{ hardDeleted: boolean; item: any }> {
  return await (client === prisma
    ? prisma.$transaction(async (tx) => runDeleteOrArchive(tx))
    : runDeleteOrArchive(client as Prisma.TransactionClient));

  async function runDeleteOrArchive(tx: Prisma.TransactionClient) {
    const item = await tx.menuItem.findUniqueOrThrow({
      where: { id: menuItemId },
      include: {
        orderItems: { select: { id: true }, take: 1 },
        kotItems: { select: { id: true }, take: 1 },
        recipe: { select: { id: true } },
      },
    });

    const hasOrderHistory = item.orderItems.length > 0 || item.kotItems.length > 0;

    if (hasOrderHistory) {
      // Cannot hard delete historical transactions. Safely archive.
      const archived = await tx.menuItem.update({
        where: { id: menuItemId },
        data: {
          isArchived: true,
          isAvailable: false,
          availabilityStatus: 'TEMPORARILY_UNAVAILABLE',
        },
      });

      await recordAuditEvent(
        {
          userId,
          action: 'MENU_ITEM_ARCHIVED',
          entity: 'MenuItem',
          entityId: item.id,
          oldValues: { name: item.name, code: item.code, isArchived: item.isArchived },
          newValues: { name: item.name, code: item.code, isArchived: true, isAvailable: false },
        },
        tx
      );

      return { hardDeleted: false, item: archived };
    }

    // Zero order history: if it has a recipe, clean up recipe first
    if (item.recipe) {
      await tx.recipeIngredient.deleteMany({ where: { recipeId: item.recipe.id } });
      await tx.recipe.delete({ where: { id: item.recipe.id } });
    }

    const deleted = await tx.menuItem.delete({ where: { id: menuItemId } });

    await recordAuditEvent(
      {
        userId,
        action: 'MENU_ITEM_DELETED',
        entity: 'MenuItem',
        entityId: item.id,
        oldValues: { name: item.name, code: item.code },
      },
      tx
    );

    return { hardDeleted: true, item: deleted };
  }
}
