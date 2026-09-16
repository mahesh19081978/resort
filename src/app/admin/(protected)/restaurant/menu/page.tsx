import { prisma } from '@/lib/db/prisma';
import { requirePermission } from '@/lib/auth/auth';
import { RestaurantHeader } from '@/components/restaurant/RestaurantHeader';
import {
  MenuManagementClient,
  MenuCategoryData,
  MenuItemData,
} from '@/components/restaurant/MenuManagementClient';

export const dynamic = 'force-dynamic';

export default async function RestaurantMenuPage() {
  await requirePermission('restaurant:order:read');

  const restaurant = await prisma.restaurant.findFirst({
    where: { isActive: true },
    include: {
      menus: {
        where: { isActive: true },
        include: {
          items: {
            where: { isArchived: false },
            include: {
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
        No active restaurant found. Please configure the restaurant in seed data.
      </div>
    );
  }

  // Format serializable categories and items
  const formattedCategories: MenuCategoryData[] = restaurant.menus.map((cat) => ({
    id: cat.id,
    name: cat.name,
    displayOrder: cat.displayOrder,
    isActive: cat.isActive,
    items: cat.items.map((item) => ({
      id: item.id,
      categoryId: item.categoryId,
      name: item.name,
      code: item.code,
      description: item.description,
      price: item.price.toNumber(),
      taxRate: item.taxRate.toNumber(),
      taxCode: item.taxCode,
      isVegetarian: item.isVegetarian,
      isAvailable: item.isAvailable,
      availabilityStatus: (item.availabilityStatus || 'AVAILABLE') as MenuItemData['availabilityStatus'],
      prepTimeMinutes: item.prepTimeMinutes,
      isArchived: item.isArchived,
      kitchenStation: item.kitchenStation || 'MAIN_KITCHEN',
      imageUrl: item.imageUrl,
      recipe: item.recipe
        ? {
            id: item.recipe.id,
            yieldCount: item.recipe.yieldCount,
            ingredients: item.recipe.ingredients.map((ing) => ({
              id: ing.id,
              quantity: ing.quantity.toString(),
              inventoryItem: {
                id: ing.inventoryItem.id,
                name: ing.inventoryItem.name,
                baseUnit: { code: ing.inventoryItem.baseUnit.code },
              },
            })),
          }
        : null,
    })),
  }));

  return (
    <div className="space-y-6">
      <RestaurantHeader
        title="Restaurant Menu Management"
        subtitle="Configure dish categories, live items, pricing, station assignments, and availability lifecycle."
      />
      <MenuManagementClient
        restaurantId={restaurant.id}
        categories={formattedCategories}
      />
    </div>
  );
}
