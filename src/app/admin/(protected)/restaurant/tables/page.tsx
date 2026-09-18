import { prisma } from '@/lib/db/prisma';
import { requirePermission } from '@/lib/auth/auth';
import { RestaurantHeader } from '@/components/restaurant/RestaurantHeader';
import { TablesView, TableItem, TableSessionItem, TableSessionBill } from '@/components/restaurant/TablesView';
import {
  TableConfigurationView,
  SittingAreaData,
  TableConfigData,
} from '@/components/restaurant/TableConfigurationView';
import { TableSessionStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export default async function RestaurantTablesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requirePermission('restaurant:table:manage');
  const params = await searchParams;
  const currentTab = params.tab === 'config' ? 'config' : 'floor';

  const restaurant = await prisma.restaurant.findFirst({
    where: { isActive: true },
    include: {
      sittingAreas: {
        include: {
          tables: { where: { isArchived: false } },
        },
        orderBy: { displayOrder: 'asc' },
      },
      tables: {
        where: { isArchived: false },
        include: {
          sittingArea: true,
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
                  orders: {
                    include: {
                      items: {
                        include: { menuItem: true },
                      },
                      kots: {
                        include: {
                          items: {
                            include: { menuItem: true },
                          },
                        },
                      },
                      bills: {
                        include: {
                          payments: true,
                        },
                      },
                    },
                    orderBy: { createdAt: 'desc' },
                  },
                },
              },
            },
          },
        },
        orderBy: { tableNumber: 'asc' },
      },
    },
  });

  // Fetch active in-house stays to enable room charge transfers
  const activeStays = await prisma.stay.findMany({
    where: {
      status: 'ACTIVE',
    },
    include: {
      primaryGuest: true,
      roomAssignments: {
        where: { status: 'ACTIVE' },
        include: { room: true },
      },
      folio: true,
    },
    orderBy: { actualCheckIn: 'desc' },
  });

  if (!restaurant) {
    return (
      <div className="p-8 text-center text-resort-stone">
        No active restaurant found. Please configure the restaurant in seed data.
      </div>
    );
  }

  // 1. Format Live Floor Plan tables
  // SittingArea is authoritative: fallback to area.name or legacy section
  const formattedFloorTables: TableItem[] = restaurant.tables.map((t) => {
    const activeST = t.sessionTables[0];
    const session = activeST?.session;

    let totalSubtotal = 0;
    let totalTax = 0;
    let totalGrand = 0;
    const allItems: TableSessionItem[] = [];
    const billsList: TableSessionBill[] = [];

    if (session) {
      for (const ord of session.orders) {
        // Collect bills
        for (const b of ord.bills) {
          const totalPaid = b.payments
            .filter((p) => p.status === 'SUCCESS')
            .reduce((sum, p) => sum + p.amount.toNumber(), 0);
          billsList.push({
            id: b.id,
            billNumber: b.billNumber,
            status: b.status,
            totalAmount: b.totalAmount.toNumber(),
            totalPaid,
            outstanding: Math.max(0, b.totalAmount.toNumber() - totalPaid),
          });
        }

        // Collect items and find item status from KOTs
        for (const item of ord.items) {
          const unitPrice = item.unitPrice.toNumber();
          const lineTotal = unitPrice * item.quantity;
          const tax = (lineTotal * item.taxRate.toNumber()) / 100;
          totalSubtotal += lineTotal;
          totalTax += tax;

          // Determine item status from KOT items
          let itemStatus = 'PENDING';
          const kotItemStatuses: string[] = [];
          for (const k of ord.kots) {
            const matched = k.items.find((ki) => ki.menuItemId === item.menuItemId);
            if (matched) {
              kotItemStatuses.push(k.status);
            }
          }
          if (kotItemStatuses.includes('SERVED')) {
            itemStatus = 'SERVED';
          } else if (kotItemStatuses.includes('READY')) {
            itemStatus = 'READY';
          } else if (kotItemStatuses.includes('PREPARING')) {
            itemStatus = 'PREPARING';
          } else if (kotItemStatuses.includes('SENT')) {
            itemStatus = 'SENT';
          }

          allItems.push({
            id: item.id,
            name: item.menuItem.name,
            quantity: item.quantity,
            unitPrice,
            lineTotal,
            status: itemStatus,
            notes: item.notes,
          });
        }
      }
      totalGrand = totalSubtotal + totalTax;
    }

    return {
      id: t.id,
      tableNumber: t.tableNumber,
      capacity: t.capacity,
      section: t.sittingArea ? t.sittingArea.name : t.section,
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
            orders: session.orders.map((o) => ({
              id: o.id,
              orderNumber: o.orderNumber,
              status: o.status,
            })),
            items: allItems,
            bills: billsList,
            totals: {
              subtotal: totalSubtotal,
              taxTotal: totalTax,
              grandTotal: totalGrand,
            },
          }
        : null,
    };
  });

  const formattedInhouseStays = activeStays.map((s) => {
    const activeRoom = s.roomAssignments[0]?.room;
    return {
      id: s.id,
      stayNumber: s.stayNumber,
      guestName: `${s.primaryGuest.firstName} ${s.primaryGuest.lastName}`,
      roomId: activeRoom?.id || '',
      roomNumber: activeRoom?.roomNumber || 'N/A',
    };
  });

  // 2. Format Configuration Sitting Areas
  const formattedAreas: SittingAreaData[] = restaurant.sittingAreas.map((a) => ({
    id: a.id,
    name: a.name,
    code: a.code,
    description: a.description,
    displayOrder: a.displayOrder,
    isActive: a.isActive,
    tableCount: a.tables.length,
  }));

  // 3. Format Configuration Tables
  const formattedConfigTables: TableConfigData[] = restaurant.tables.map((t) => ({
    id: t.id,
    tableNumber: t.tableNumber,
    capacity: t.capacity,
    sittingAreaId: t.sittingAreaId || '',
    sittingAreaName: t.sittingArea ? t.sittingArea.name : 'Unassigned',
    isActive: t.isActive,
    status: t.status as TableConfigData['status'],
    activeSessionId: t.sessionTables[0]?.sessionId || null,
  }));

  return (
    <div className="space-y-6">
      <RestaurantHeader
        title="Restaurant Tables & Floor Management"
        subtitle="Manage live dining floor sessions, table joining, sitting areas, and physical table configurations."
      />

      {/* Main Mode Toggle: Live Floor vs Table & Area Configuration */}
      <div className="flex items-center gap-2 border-b border-resort-sand pb-3">
        <a
          href="/admin/restaurant/tables"
          className={`px-4 py-2 rounded-md text-xs font-bold transition-colors ${
            currentTab === 'floor'
              ? 'bg-resort-forest text-white shadow-xs'
              : 'bg-white text-resort-charcoal border border-resort-sand hover:bg-resort-sand/20'
          }`}
        >
          Live Dining Floor Plan
        </a>
        <a
          href="/admin/restaurant/tables?tab=config"
          className={`px-4 py-2 rounded-md text-xs font-bold transition-colors ${
            currentTab === 'config'
              ? 'bg-resort-forest text-white shadow-xs'
              : 'bg-white text-resort-charcoal border border-resort-sand hover:bg-resort-sand/20'
          }`}
        >
          Sitting Areas & Table Setup
        </a>
      </div>

      {currentTab === 'floor' ? (
        <TablesView
          restaurantId={restaurant.id}
          tables={formattedFloorTables}
          inhouseStays={formattedInhouseStays}
        />
      ) : (
        <TableConfigurationView
          restaurantId={restaurant.id}
          sittingAreas={formattedAreas}
          tables={formattedConfigTables}
        />
      )}
    </div>
  );
}
