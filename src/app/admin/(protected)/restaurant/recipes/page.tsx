import { prisma } from '@/lib/db/prisma';
import { requirePermission } from '@/lib/auth/auth';
import { RestaurantHeader } from '@/components/restaurant/RestaurantHeader';
import {
  RecipeManagementClient,
  RecipeItemData,
  InventoryItemOption,
} from '@/components/restaurant/RecipeManagementClient';
import { calculateEstimatedRecipeCost } from '@/lib/restaurant/recipe-service';

export const dynamic = 'force-dynamic';

export default async function RestaurantRecipesPage() {
  await requirePermission('recipe:read');

  const restaurant = await prisma.restaurant.findFirst({
    where: { isActive: true },
    include: {
      menus: {
        where: { isActive: true },
        include: {
          items: {
            where: { isArchived: false },
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
            orderBy: { name: 'asc' },
          },
        },
        orderBy: { displayOrder: 'asc' },
      },
    },
  });

  if (!restaurant) {
    return (
      <div className="p-8 text-center text-resort-stone">
        No active restaurant found.
      </div>
    );
  }

  // Active inventory items for BOM ingredient pickers
  const rawInventoryItems = await prisma.inventoryItem.findMany({
    where: { isActive: true },
    include: { baseUnit: true },
    orderBy: { name: 'asc' },
  });

  const formattedInventoryItems: InventoryItemOption[] = rawInventoryItems.map((item) => ({
    id: item.id,
    name: item.name,
    code: item.code,
    unitCode: item.baseUnit.code,
    standardCost: item.standardCost.toNumber(),
  }));

  // Format menu items and recipes
  const allMenuItems = restaurant.menus.flatMap((cat) => cat.items);

  const formattedMenuItems: RecipeItemData[] = allMenuItems.map((item) => {
    let recipeData: RecipeItemData['recipe'] = null;

    if (item.recipe) {
      const estimatedCost = calculateEstimatedRecipeCost(
        item.recipe.ingredients.map((ing) => ({
          quantity: ing.quantity,
          standardCost: ing.inventoryItem.standardCost,
        }))
      );

      recipeData = {
        id: item.recipe.id,
        yieldCount: item.recipe.yieldCount,
        instructions: item.recipe.instructions,
        estimatedCost: estimatedCost.toFixed(2),
        ingredients: item.recipe.ingredients.map((ing) => ({
          id: ing.id,
          inventoryItemId: ing.inventoryItemId,
          inventoryItemName: ing.inventoryItem.name,
          unitCode: ing.inventoryItem.baseUnit.code,
          quantity: ing.quantity.toString(),
          standardCost: ing.inventoryItem.standardCost.toString(),
          notes: ing.notes,
        })),
      };
    }

    return {
      id: item.id,
      name: item.name,
      code: item.code,
      categoryName: item.category.name,
      price: item.price.toNumber(),
      recipe: recipeData,
    };
  });

  return (
    <div className="space-y-6">
      <RestaurantHeader
        title="Recipe Formulation & Bill of Materials (BOM)"
        subtitle="Manage ingredient compositions, yields, and calculate real-time estimated recipe food costs."
      />
      <RecipeManagementClient
        menuItems={formattedMenuItems}
        inventoryItems={formattedInventoryItems}
      />
    </div>
  );
}
