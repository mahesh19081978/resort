import { prisma } from '@/lib/db/prisma';
import { requirePermission } from '@/lib/auth/auth';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Boxes, Warehouse, ArrowLeftRight, ClipboardCheck, AlertTriangle, TrendingDown } from 'lucide-react';
import Link from 'next/link';
import { getInventoryMetrics } from '@/lib/dashboard/inventory';

export const dynamic = 'force-dynamic';

export default async function InventoryDashboardPage() {
  await requirePermission('inventory:read');

  const [invMetrics, stores, movementsCount, recentMovements] = await Promise.all([
    getInventoryMetrics(),
    prisma.store.findMany({
      where: { isActive: true },
      include: {
        stocks: {
          include: {
            item: {
              include: { baseUnit: true },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.stockMovement.count(),
    prisma.stockMovement.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        item: { include: { baseUnit: true } },
        store: true,
      },
    }),
  ]);

  const itemsCount = invMetrics.totalItems;
  const lowStockCount = invMetrics.lowStockCount;
  const pendingTransfers = invMetrics.pendingTransfers;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-serif text-2xl font-bold text-resort-charcoal">Inventory & Store Ledger</h1>
          <p className="text-xs text-resort-stone mt-1">
            Authoritative transactional stock ledger, physical transfers, KOT consumption, and store balances.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-resort-stone">Physical Stores</p>
              <p className="text-2xl font-serif font-bold text-resort-charcoal mt-1">{stores.length}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
              <Warehouse className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-resort-stone">Catalog Items</p>
              <p className="text-2xl font-serif font-bold text-resort-charcoal mt-1">{itemsCount}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
              <Boxes className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-resort-stone">Pending Transfers</p>
              <p className="text-2xl font-serif font-bold text-amber-600 mt-1">{pendingTransfers}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-resort-stone">Ledger Movements</p>
              <p className="text-2xl font-serif font-bold text-resort-forest mt-1">{movementsCount}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-resort-sand/40 flex items-center justify-center text-resort-forest">
              <ClipboardCheck className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stores Overview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {stores.map((store) => {
          const totalStockUnits = store.stocks.reduce((sum, s) => sum + s.quantityOnHand.toNumber(), 0);
          return (
            <Card key={store.id} className="border-border hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-base font-serif font-bold text-resort-charcoal">
                      {store.name}
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      Code: <span className="font-mono">{store.code}</span> • Dept: {store.department}
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 text-[10px]">
                    Active
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-xs border-b border-border/40 pb-2">
                  <span className="text-resort-stone">Tracked Stock Items:</span>
                  <span className="font-semibold text-resort-charcoal">{store.stocks.length}</span>
                </div>
                <div className="flex justify-between text-xs border-b border-border/40 pb-2">
                  <span className="text-resort-stone">Total Units on Hand:</span>
                  <span className="font-semibold text-resort-charcoal">{totalStockUnits.toFixed(2)}</span>
                </div>
                <div className="pt-1">
                  <p className="text-[11px] font-semibold text-resort-stone uppercase tracking-wider mb-1.5">
                    Stock Sample
                  </p>
                  <div className="space-y-1">
                    {store.stocks.slice(0, 3).map((s) => (
                      <div key={s.id} className="flex justify-between text-xs text-resort-stone">
                        <span className="truncate pr-2">{s.item.name}</span>
                        <span className="font-mono text-resort-charcoal shrink-0">
                          {s.quantityOnHand.toFixed(2)} {s.item.baseUnit.code}
                        </span>
                      </div>
                    ))}
                    {store.stocks.length === 0 && (
                      <p className="text-xs text-resort-stone italic">No stock records yet.</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent Authoritative Stock Movements Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-serif font-bold text-resort-charcoal">
            Authoritative Stock Movements Ledger
          </CardTitle>
          <CardDescription className="text-xs">
            Latest append-only stock movement records with before/after balance tracking.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border text-resort-stone uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 px-3">Movement #</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Store</th>
                  <th className="py-2.5 px-3">Item</th>
                  <th className="py-2.5 px-3 text-right">Quantity</th>
                  <th className="py-2.5 px-3 text-right">Before</th>
                  <th className="py-2.5 px-3 text-right">After</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {recentMovements.map((m) => {
                  const isInbound = [
                    'OPENING_BALANCE',
                    'PURCHASE_RECEIPT',
                    'TRANSFER_IN',
                    'ADJUSTMENT_IN',
                    'RETURN_FROM_DEPARTMENT',
                  ].includes(m.movementType);

                  return (
                    <tr key={m.id} className="hover:bg-resort-sand/20">
                      <td className="py-2.5 px-3 font-mono font-medium text-resort-charcoal">
                        {m.movementNumber}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge
                          variant="outline"
                          className={
                            isInbound
                              ? 'bg-emerald-50 text-emerald-700 text-[10px]'
                              : 'bg-amber-50 text-amber-700 text-[10px]'
                          }
                        >
                          {m.movementType}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-resort-stone">{m.store?.name || '—'}</td>
                      <td className="py-2.5 px-3 font-medium text-resort-charcoal">{m.item.name}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold">
                        {isInbound ? '+' : '-'}
                        {m.quantity.toFixed(4)} {m.item.baseUnit.code}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-resort-stone">
                        {m.balanceBefore.toFixed(4)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-medium text-resort-charcoal">
                        {m.balanceAfter.toFixed(4)}
                      </td>
                      <td className="py-2.5 px-3 text-resort-stone">
                        {new Date(m.createdAt).toLocaleDateString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-2.5 px-3 text-resort-stone truncate max-w-[200px]" title={m.remarks || ''}>
                        {m.remarks || '—'}
                      </td>
                    </tr>
                  );
                })}
                {recentMovements.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-6 text-center text-resort-stone italic">
                      No stock movements recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}