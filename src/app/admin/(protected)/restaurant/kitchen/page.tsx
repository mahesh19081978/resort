import { prisma } from '@/lib/db/prisma';
import { requirePermission } from '@/lib/auth/auth';
import { RestaurantHeader } from '@/components/restaurant/RestaurantHeader';
import { KitchenDisplay, KitchenKOT } from '@/components/restaurant/KitchenDisplay';

export const dynamic = 'force-dynamic';

export default async function KitchenPage() {
  await requirePermission('kitchen:view');

  const activeKOTs = await prisma.kOT.findMany({
    where: {
      status: { in: ['SENT', 'PREPARING', 'READY'] },
    },
    include: {
      order: {
        include: {
          tableSession: {
            include: {
              tables: { include: { table: true } },
            },
          },
          room: true,
        },
      },
      items: {
        include: {
          menuItem: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const formattedKots: KitchenKOT[] = activeKOTs.map((kot) => {
    let tableOrRoom = 'Take-Away';
    if (kot.order.orderType === 'DINE_IN' && kot.order.tableSession) {
      tableOrRoom = `Table ${kot.order.tableSession.tables.map((t) => t.table.tableNumber).join(', ')}`;
    } else if (kot.order.orderType === 'ROOM_SERVICE' && kot.order.room) {
      tableOrRoom = `Room ${kot.order.room.roomNumber}`;
    }

    return {
      id: kot.id,
      kotNumber: kot.kotNumber,
      orderNumber: kot.order.orderNumber,
      orderType: kot.order.orderType as KitchenKOT['orderType'],
      status: kot.status as KitchenKOT['status'],
      kitchenNote: kot.kitchenNote,
      tableOrRoom,
      createdAt: kot.createdAt.toISOString(),
      items: kot.items.map((i) => ({
        id: i.id,
        name: i.menuItem.name,
        quantity: i.quantity,
        notes: i.notes,
        kitchenStation: i.menuItem.kitchenStation,
      })),
    };
  });

  return (
    <div>
      <RestaurantHeader
        title="Kitchen Display System (KDS)"
        subtitle="Real-time live kitchen tickets, order prep SLAs, and food station dispatch."
      />
      <KitchenDisplay kots={formattedKots} />
    </div>
  );
}
