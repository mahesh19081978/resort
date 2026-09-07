import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { requirePermission } from '@/lib/auth/auth';
import { RestaurantHeader } from '@/components/restaurant/RestaurantHeader';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Utensils, Eye, Plus, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function RestaurantOrdersPage() {
  await requirePermission('restaurant:order:read');

  const orders = await prisma.restaurantOrder.findMany({
    include: {
      items: {
        include: { menuItem: true },
      },
      kots: true,
      bills: true,
      tableSession: {
        include: {
          tables: { include: { table: true } },
        },
      },
      room: true,
      stay: {
        include: { primaryGuest: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <RestaurantHeader
        title="Restaurant Orders & KOT History"
        subtitle="Track active tickets, preparation status, and generate bills."
      />

      <div className="flex items-center justify-between">
        <div className="text-xs text-resort-stone">
          Showing latest {orders.length} orders across Dine-In, Take-Away, and Room Service
        </div>
        <Link href="/admin/restaurant/pos">
          <Button size="sm">
            <Plus className="w-3.5 h-3.5 mr-1" /> New Order (POS)
          </Button>
        </Link>
      </div>

      <div className="bg-white rounded-lg border border-resort-sand overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-resort-sand bg-resort-sand/20 font-semibold text-resort-charcoal">
              <th className="p-3">Order #</th>
              <th className="p-3">Type & Context</th>
              <th className="p-3">Items Summary</th>
              <th className="p-3">Status</th>
              <th className="p-3">KOTs</th>
              <th className="p-3">Bills</th>
              <th className="p-3">Time</th>
              <th className="p-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-resort-sand/60">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-resort-stone">
                  No restaurant orders recorded yet.
                </td>
              </tr>
            ) : (
              orders.map((order) => {
                const totalQty = order.items.reduce((s, i) => s + i.quantity, 0);
                const orderSub = order.items.reduce(
                  (s, i) => s + i.unitPrice.toNumber() * i.quantity,
                  0
                );

                let contextLabel = 'Take-Away';
                if (order.orderType === 'DINE_IN' && order.tableSession) {
                  contextLabel = `Table ${order.tableSession.tables.map((t) => t.table.tableNumber).join(', ')}`;
                } else if (order.orderType === 'ROOM_SERVICE' && order.room) {
                  contextLabel = `Room ${order.room.roomNumber} (${order.stay?.primaryGuest ? `${order.stay.primaryGuest.firstName} ${order.stay.primaryGuest.lastName}` : ''})`;
                }

                return (
                  <tr key={order.id} className="hover:bg-resort-sand/10 transition-colors">
                    <td className="p-3 font-mono font-bold text-resort-charcoal">
                      {order.orderNumber}
                    </td>
                    <td className="p-3">
                      <div className="font-semibold text-resort-charcoal">
                        {order.orderType.replace('_', ' ')}
                      </div>
                      <div className="text-[11px] text-resort-stone">{contextLabel}</div>
                    </td>
                    <td className="p-3">
                      <span className="font-medium">
                        {totalQty} items ({formatCurrency(orderSub)})
                      </span>
                      <p className="text-[10px] text-resort-stone truncate max-w-xs">
                        {order.items.map((i) => `${i.quantity}x ${i.menuItem.name}`).join(', ')}
                      </p>
                    </td>
                    <td className="p-3">
                      <span
                        className={cn(
                          'text-[10px] font-bold px-2 py-0.5 rounded tracking-wide uppercase',
                          order.status === 'CONFIRMED' && 'bg-amber-100 text-amber-800',
                          order.status === 'PREPARING' && 'bg-blue-100 text-blue-800',
                          order.status === 'SERVED' && 'bg-purple-100 text-purple-800',
                          order.status === 'BILLED' && 'bg-indigo-100 text-indigo-800',
                          order.status === 'COMPLETED' && 'bg-emerald-100 text-emerald-800',
                          order.status === 'CANCELLED' && 'bg-red-100 text-red-800'
                        )}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td className="p-3 font-mono font-semibold text-xs">
                      {order.kots.length > 0 ? (
                        <span className="text-resort-forest">
                          {order.kots.length} KOT{order.kots.length > 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="text-resort-stone">None</span>
                      )}
                    </td>
                    <td className="p-3">
                      {order.bills.length > 0 ? (
                        <span className="text-xs font-semibold text-indigo-700">
                          {order.bills.map((b) => `#${b.billNumber}`).join(', ')}
                        </span>
                      ) : (
                        <span className="text-resort-stone">Unbilled</span>
                      )}
                    </td>
                    <td className="p-3 text-[11px] text-resort-stone">
                      {new Date(order.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="p-3 text-right">
                      <Link href={`/admin/restaurant/orders/${order.id}`}>
                        <Button size="sm" variant="outline" className="h-7 text-xs">
                          <Eye className="w-3.5 h-3.5 mr-1" /> View / Bill
                        </Button>
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
