import { prisma } from '@/lib/db/prisma';
import { requirePermission } from '@/lib/auth/auth';
import { RestaurantHeader } from '@/components/restaurant/RestaurantHeader';
import { TablesView, TableItem } from '@/components/restaurant/TablesView';
import { TableSessionStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export default async function RestaurantTablesPage() {
  await requirePermission('restaurant:table:manage');

  const restaurant = await prisma.restaurant.findFirst({
    where: { isActive: true },
    include: {
      tables: {
        where: { isActive: true },
        include: {
          sessionTables: {
            where: {
              session: {
                status: { in: [TableSessionStatus.ACTIVE, TableSessionStatus.BILLED] },
              },
            },
            include: {
              session: {
                include: {
                  tables: { include: { table: true } },
                  orders: true,
                },
              },
            },
          },
        },
        orderBy: { tableNumber: 'asc' },
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

  const formattedTables: TableItem[] = restaurant.tables.map((t) => {
    const activeST = t.sessionTables[0];
    const session = activeST?.session;

    return {
      id: t.id,
      tableNumber: t.tableNumber,
      capacity: t.capacity,
      section: t.section,
      status: t.status as TableItem['status'],
      currentSession: session
        ? {
            id: session.id,
            sessionCode: session.sessionCode,
            paxCount: session.paxCount,
            guestName: session.guestName,
            openedAt: session.openedAt.toISOString(),
            orderCount: session.orders.length,
            tables: session.tables.map((st) => ({
              id: st.table.id,
              tableNumber: st.table.tableNumber,
            })),
          }
        : null,
    };
  });

  return (
    <div>
      <RestaurantHeader
        title="Restaurant Tables & Floor Plan"
        subtitle="Manage live dining table sessions, table joining, and dining occupancy."
      />
      <TablesView restaurantId={restaurant.id} tables={formattedTables} />
    </div>
  );
}
