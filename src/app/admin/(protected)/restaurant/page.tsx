import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { requirePermission } from '@/lib/auth/auth';
import { RestaurantHeader } from '@/components/restaurant/RestaurantHeader';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import {
  LayoutGrid,
  Laptop,
  ChefHat,
  Receipt,
  ClipboardList,
  Utensils,
  TrendingUp,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { TableSessionStatus, OrderStatus, BillStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export default async function RestaurantDashboardPage() {
  await requirePermission('restaurant:order:read');

  // Aggregate live operational restaurant metrics
  const [
    totalTables,
    activeSessionsCount,
    pendingKOTsCount,
    activeOrdersCount,
    todayBills,
  ] = await Promise.all([
    prisma.restaurantTable.count({ where: { isActive: true } }),
    prisma.tableSession.count({ where: { status: TableSessionStatus.ACTIVE } }),
    prisma.kOT.count({ where: { status: { in: ['SENT', 'PREPARING'] } } }),
    prisma.restaurantOrder.count({
      where: { status: { in: [OrderStatus.CONFIRMED, OrderStatus.PREPARING, OrderStatus.SERVED] } },
    }),
    prisma.restaurantBill.findMany({
      where: {
        createdAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
        status: { in: [BillStatus.SETTLED, BillStatus.CHARGED_TO_ROOM] },
      },
      select: { totalAmount: true },
    }),
  ]);

  const todayRevenue = todayBills.reduce((s, b) => s + b.totalAmount.toNumber(), 0);

  return (
    <div className="space-y-6">
      <RestaurantHeader
        title="Restaurant POS & Operational Overview"
        subtitle="Live floor occupancy, Kitchen Display System (KDS), orders, and billing metrics."
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-resort-sand">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-resort-stone font-medium">Table Occupancy</p>
              <h3 className="font-serif text-2xl font-bold text-resort-charcoal mt-1">
                {activeSessionsCount} / {totalTables}
              </h3>
              <p className="text-[11px] text-emerald-700 mt-1">Active Dining Sessions</p>
            </div>
            <div className="p-3 rounded-full bg-emerald-50 text-emerald-700">
              <LayoutGrid className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-resort-sand">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-resort-stone font-medium">Pending KOTs</p>
              <h3 className="font-serif text-2xl font-bold text-amber-700 mt-1">
                {pendingKOTsCount}
              </h3>
              <p className="text-[11px] text-amber-800 mt-1">In Kitchen Preparation</p>
            </div>
            <div className="p-3 rounded-full bg-amber-50 text-amber-700">
              <ChefHat className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-resort-sand">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-resort-stone font-medium">Active Orders</p>
              <h3 className="font-serif text-2xl font-bold text-resort-forest mt-1">
                {activeOrdersCount}
              </h3>
              <p className="text-[11px] text-resort-stone mt-1">Dine-In, Takeaway, Room Service</p>
            </div>
            <div className="p-3 rounded-full bg-forest-50 text-resort-forest">
              <ClipboardList className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-resort-sand">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-resort-stone font-medium">Today's F&B Revenue</p>
              <h3 className="font-serif text-2xl font-bold text-emerald-800 mt-1">
                {formatCurrency(todayRevenue)}
              </h3>
              <p className="text-[11px] text-emerald-700 mt-1">{todayBills.length} Settled / Charged Bills</p>
            </div>
            <div className="p-3 rounded-full bg-emerald-50 text-emerald-700">
              <Receipt className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Launchpad */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="hover:shadow-md transition-all border-resort-sand">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-serif flex items-center gap-2 text-resort-charcoal">
              <Laptop className="w-4 h-4 text-resort-forest" />
              High-Speed POS Terminal
            </CardTitle>
            <CardDescription className="text-xs text-resort-stone">
              Punch Dine-In, Take-Away, or Room Service orders with live cart & instant KOT firing.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <Link href="/admin/restaurant/pos">
              <Button size="sm" className="w-full text-xs">
                Launch POS Terminal
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-all border-resort-sand">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-serif flex items-center gap-2 text-resort-charcoal">
              <LayoutGrid className="w-4 h-4 text-resort-forest" />
              Tables & Floor Management
            </CardTitle>
            <CardDescription className="text-xs text-resort-stone">
              Open dining sessions, join tables logically, manage seating capacity and turn-times.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <Link href="/admin/restaurant/tables">
              <Button size="sm" variant="outline" className="w-full text-xs">
                View Tables Floor Plan
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-all border-resort-sand">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-serif flex items-center gap-2 text-resort-charcoal">
              <ChefHat className="w-4 h-4 text-resort-forest" />
              Kitchen Display System (KDS)
            </CardTitle>
            <CardDescription className="text-xs text-resort-stone">
              Station routing (Tandoor, Curry, Pantry), order elapsed times, and one-click dispatch.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <Link href="/admin/restaurant/kitchen">
              <Button size="sm" variant="outline" className="w-full text-xs">
                Open Kitchen Screen
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
