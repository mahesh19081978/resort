import { prisma } from '@/lib/db/prisma';
import { requirePermission } from '@/lib/auth/auth';
import { RestaurantHeader } from '@/components/restaurant/RestaurantHeader';
import { formatCurrency } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen, Check, X, ChefHat, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

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
    return <div className="p-8 text-center text-resort-stone">Restaurant not found.</div>;
  }

  return (
    <div className="space-y-6">
      <RestaurantHeader
        title="Restaurant Menu & Recipe BOM"
        subtitle="Live database-driven menu catalog with inventory ingredient formulations."
      />

      <div className="space-y-8">
        {restaurant.menus.map((category) => (
          <div key={category.id} className="space-y-4">
            <div className="flex items-center justify-between border-b border-resort-sand pb-2">
              <h2 className="font-serif text-lg font-bold text-resort-charcoal">
                {category.name}
              </h2>
              <span className="text-xs text-resort-stone">
                {category.items.length} items
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {category.items.map((item) => (
                <Card key={item.id} className="hover:shadow-sm transition-all border border-resort-sand">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              'w-2.5 h-2.5 rounded-full inline-block shrink-0',
                              item.isVegetarian ? 'bg-emerald-600' : 'bg-red-600'
                            )}
                            title={item.isVegetarian ? 'Vegetarian' : 'Non-Vegetarian'}
                          />
                          <h4 className="font-serif font-bold text-sm text-resort-charcoal">
                            {item.name}
                          </h4>
                        </div>
                        <span className="text-[10px] font-mono text-resort-stone uppercase">
                          {item.code}
                        </span>
                      </div>
                      <span className="font-bold text-sm text-resort-forest">
                        {formatCurrency(item.price.toNumber())}
                      </span>
                    </div>

                    {item.description && (
                      <p className="text-xs text-resort-stone leading-relaxed">
                        {item.description}
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-resort-sand/60 text-[11px] text-resort-stone">
                      <span>Station: <strong>{item.kitchenStation || 'Main Kitchen'}</strong></span>
                      <span>GST: <strong>{item.taxRate.toString()}%</strong></span>
                    </div>

                    {/* Recipe BOM Ingredients */}
                    {item.recipe && item.recipe.ingredients.length > 0 && (
                      <div className="p-2.5 bg-resort-sand/20 rounded border border-resort-sand/80 space-y-1.5 text-[11px]">
                        <div className="font-semibold text-resort-charcoal flex items-center gap-1">
                          <ChefHat className="w-3 h-3 text-resort-forest" /> Recipe Bill of Materials:
                        </div>
                        <div className="space-y-0.5">
                          {item.recipe.ingredients.map((ing) => (
                            <div key={ing.id} className="flex justify-between text-[10px] text-resort-stone">
                              <span>• {ing.inventoryItem.name}</span>
                              <span className="font-mono font-medium">
                                {ing.quantity.toString()} {ing.inventoryItem.baseUnit.code}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
