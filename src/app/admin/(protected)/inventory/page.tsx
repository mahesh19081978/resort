import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/auth';
import { hasPermission } from '@/lib/permissions/rbac';
import InventoryOperationsConsoleClient from '@/components/inventory/InventoryOperationsConsoleClient';

export const dynamic = 'force-dynamic';

export default async function InventoryDashboardPage() {
  const user = await getCurrentUser();

  // Determine user permissions for quick actions
  const permissions = {
    canRequest: hasPermission(user, 'inventory:request:create'),
    canIssue: hasPermission(user, 'inventory:stock:issue'),
    canTransfer: hasPermission(user, 'inventory:stock:transfer'),
    canCount: hasPermission(user, 'inventory:count:create'),
    canAdjust: hasPermission(user, 'inventory:stock:adjust'),
    canManageStores: hasPermission(user, 'inventory:item:manage'),
  };

  // Parallel database fetch for authoritative data
  const [
    allStoresWithCounts,
    activeStoresWithStock,
    catalogItemsCount,
    pendingRequests,
    recentMovements,
    activeStocksForValuation,
    reorderConfiguredItems,
  ] = await Promise.all([
    // 1. All stores for the store management modal
    prisma.store.findMany({
      select: {
        id: true,
        name: true,
        code: true,
        department: true,
        isActive: true,
        stocks: {
          where: { quantityOnHand: { gt: 0 } },
          select: { id: true },
        },
        _count: {
          select: {
            movements: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    }),

    // 2. Active stores with on-hand items for store cards
    prisma.store.findMany({
      where: { isActive: true },
      include: {
        stocks: {
          where: { quantityOnHand: { gt: 0 } },
          include: {
            item: {
              include: { baseUnit: true },
            },
          },
          orderBy: { quantityOnHand: 'desc' },
        },
      },
      orderBy: { name: 'asc' },
    }),

    // 3. Catalog items in stock
    prisma.stock.groupBy({
      by: ['itemId'],
      where: { quantityOnHand: { gt: 0 } },
    }),

    // 4. Pending Stock Requests (SUBMITTED, APPROVED, PARTIALLY_APPROVED)
    prisma.stockRequest.findMany({
      where: {
        status: { in: ['SUBMITTED', 'APPROVED', 'PARTIALLY_APPROVED'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        destinationStore: true,
        sourceStore: true,
        requestedBy: { select: { name: true } },
        items: true,
      },
    }),

    // 5. Recent Authoritative Stock Movements
    prisma.stockMovement.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: {
        item: { include: { baseUnit: true } },
        store: true,
      },
    }),

    // 6. Stocks for valuation using moving WAC standardCost
    prisma.stock.findMany({
      where: { quantityOnHand: { gt: 0 } },
      select: {
        quantityOnHand: true,
        item: {
          select: { standardCost: true },
        },
      },
    }),

    // 7. Reorder Level Check (Items with reorderLevel > 0)
    prisma.inventoryItem.findMany({
      where: { isActive: true, reorderLevel: { gt: 0 } },
      select: {
        id: true,
        name: true,
        code: true,
        reorderLevel: true,
        baseUnit: { select: { code: true } },
        stocks: {
          include: { store: true },
        },
      },
    }),
  ]);

  // Calculate Total Stock Valuation (quantityOnHand * standardCost)
  let totalStockValuation = 0;
  for (const s of activeStocksForValuation) {
    const qty = s.quantityOnHand.toNumber();
    const cost = s.item.standardCost.toNumber();
    totalStockValuation += qty * cost;
  }

  // Calculate Low Stock Items based strictly on reorderLevel > 0
  const stockHealthList: Array<{
    id: string;
    name: string;
    code: string;
    storeName: string;
    currentStock: number;
    reorderLevel: number;
    unitCode: string;
    isLowStock: boolean;
  }> = [];

  let lowStockCount = 0;
  for (const item of reorderConfiguredItems) {
    const reorderLevelNum = item.reorderLevel.toNumber();
    if (item.stocks.length === 0) {
      lowStockCount++;
      stockHealthList.push({
        id: `${item.id}-nostock`,
        name: item.name,
        code: item.code,
        storeName: 'None (Out of Stock)',
        currentStock: 0,
        reorderLevel: reorderLevelNum,
        unitCode: item.baseUnit.code,
        isLowStock: true,
      });
    } else {
      for (const st of item.stocks) {
        const qtyNum = st.quantityOnHand.toNumber();
        const isLow = qtyNum <= reorderLevelNum;
        if (isLow) lowStockCount++;
        stockHealthList.push({
          id: `${item.id}-${st.storeId}`,
          name: item.name,
          code: item.code,
          storeName: st.store.name,
          currentStock: qtyNum,
          reorderLevel: reorderLevelNum,
          unitCode: item.baseUnit.code,
          isLowStock: isLow,
        });
      }
    }
  }

  // Format Store Cards
  const storeCards = activeStoresWithStock.map((store) => {
    const totalUnits = store.stocks.reduce((acc, s) => acc + s.quantityOnHand.toNumber(), 0);
    return {
      id: store.id,
      name: store.name,
      code: store.code,
      department: store.department,
      isActive: store.isActive,
      itemCount: store.stocks.length,
      totalUnits,
      stocks: store.stocks.map((s) => ({
        id: s.id,
        itemId: s.itemId,
        itemName: s.item.name,
        itemCode: s.item.code,
        quantityOnHand: s.quantityOnHand.toNumber(),
        unitCode: s.item.baseUnit.code,
        standardCost: s.item.standardCost.toNumber(),
      })),
    };
  });

  // Store options for ledger dropdown
  const storeOptions = allStoresWithCounts.map((s) => ({
    id: s.id,
    name: s.name,
    code: s.code,
  }));

  // Store summaries for StoreManagementModal
  const storeSummaries = allStoresWithCounts.map((s) => ({
    id: s.id,
    name: s.name,
    code: s.code,
    department: s.department,
    isActive: s.isActive,
    activeStockCount: s.stocks.length,
    totalMovements: s._count.movements,
  }));

  // Format pending requests
  const formattedPendingRequests = pendingRequests.map((r) => ({
    id: r.id,
    requestNumber: r.requestNumber,
    department: r.department,
    status: r.status,
    itemCount: r.items.length,
    createdAt: r.createdAt.toISOString(),
    requestedByName: r.requestedBy?.name,
    destinationStoreName: r.destinationStore.name,
  }));

  // Format movements for AuthoritativeStockLedgerTable
  const formattedMovements = recentMovements.map((m) => ({
    id: m.id,
    movementNumber: m.movementNumber,
    movementType: m.movementType,
    quantity: m.quantity.toNumber(),
    balanceBefore: m.balanceBefore.toNumber(),
    balanceAfter: m.balanceAfter.toNumber(),
    unitCost: m.unitCost.toNumber(),
    totalCost: m.totalCost.toNumber(),
    remarks: m.remarks,
    createdAt: m.createdAt.toISOString(),
    item: {
      id: m.item.id,
      name: m.item.name,
      code: m.item.code,
      baseUnit: {
        code: m.item.baseUnit.code,
        name: m.item.baseUnit.name,
      },
    },
    store: m.store
      ? {
          id: m.store.id,
          name: m.store.name,
          code: m.store.code,
        }
      : null,
  }));

  return (
    <InventoryOperationsConsoleClient
      currentUserRole={user?.role || 'STAFF'}
      permissions={permissions}
      kpiData={{
        totalStockValue: totalStockValuation,
        itemsInStock: catalogItemsCount.length,
        pendingRequestsCount: pendingRequests.length,
        lowStockCount,
        activeStoresCount: activeStoresWithStock.length,
      }}
      storesData={{
        cards: storeCards,
        summaries: storeSummaries,
        options: storeOptions,
      }}
      pendingRequests={formattedPendingRequests}
      stockHealthItems={stockHealthList}
      recentMovements={formattedMovements}
    />
  );
}