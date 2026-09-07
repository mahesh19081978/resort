import { prisma } from '@/lib/db/prisma';
import { requirePermission } from '@/lib/auth/auth';
import { RestaurantHeader } from '@/components/restaurant/RestaurantHeader';
import { POSTerminal, POSCategory, POSTableSession, POSActiveStay } from '@/components/restaurant/POSTerminal';
import { TableSessionStatus, StayStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export default async function POSPage({
  searchParams,
}: {
  searchParams: Promise<{ tableSessionId?: string; tableNumber?: string }>;
}) {
  await requirePermission('restaurant:order:create');
  const params = await searchParams;

  const restaurant = await prisma.restaurant.findFirst({
    where: { isActive: true },
    include: {
      menus: {
        where: { isActive: true },
        include: {
          items: {
            where: { isAvailable: true },
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

  // Active table sessions for Dine-In
  const activeSessions = await prisma.tableSession.findMany({
    where: {
      status: TableSessionStatus.ACTIVE,
    },
    include: {
      tables: {
        include: {
          table: true,
        },
      },
    },
    orderBy: { openedAt: 'desc' },
  });

  // Active in-house stays for Room Service
  const inhouseStays = await prisma.stay.findMany({
    where: {
      status: StayStatus.ACTIVE,
    },
    include: {
      primaryGuest: true,
      roomAssignments: {
        where: { status: 'ACTIVE' },
        include: { room: true },
      },
    },
    orderBy: { actualCheckIn: 'desc' },
  });

  const formattedCategories: POSCategory[] = restaurant.menus.map((m) => ({
    id: m.id,
    name: m.name,
    items: m.items.map((i) => ({
      id: i.id,
      name: i.name,
      code: i.code,
      price: i.price.toNumber(),
      taxRate: i.taxRate.toNumber(),
      isVegetarian: i.isVegetarian,
      isAvailable: i.isAvailable,
      kitchenStation: i.kitchenStation,
      description: i.description,
    })),
  }));

  const formattedSessions: POSTableSession[] = activeSessions.map((s) => ({
    id: s.id,
    sessionCode: s.sessionCode,
    guestName: s.guestName,
    paxCount: s.paxCount,
    tableNumbers: s.tables.map((st) => st.table.tableNumber),
  }));

  const formattedStays: POSActiveStay[] = inhouseStays
    .filter((st) => st.roomAssignments.length > 0)
    .map((st) => ({
      id: st.id,
      stayNumber: st.stayNumber,
      guestName: `${st.primaryGuest.firstName} ${st.primaryGuest.lastName}`,
      roomNumber: st.roomAssignments[0].room.roomNumber,
      roomId: st.roomAssignments[0].room.id,
    }));

  return (
    <div>
      <RestaurantHeader
        title="Restaurant Point of Sale (POS)"
        subtitle="Take Dine-In, Take-Away, and In-House Room Service orders with immediate KOT firing."
      />
      <POSTerminal
        restaurantId={restaurant.id}
        categories={formattedCategories}
        activeSessions={formattedSessions}
        activeStays={formattedStays}
        initialTableSessionId={params.tableSessionId}
      />
    </div>
  );
}
