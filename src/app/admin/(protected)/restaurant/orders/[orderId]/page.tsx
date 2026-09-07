import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { requirePermission } from '@/lib/auth/auth';
import { RestaurantHeader } from '@/components/restaurant/RestaurantHeader';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { generateRestaurantBillAction } from '@/actions/restaurant';
import {
  Utensils,
  Receipt,
  ChefHat,
  ArrowLeft,
  BedDouble,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  await requirePermission('restaurant:order:read');
  const { orderId } = await params;

  const order = await prisma.restaurantOrder.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: { menuItem: true },
      },
      kots: {
        include: {
          items: { include: { menuItem: true } },
          serverUser: true,
        },
        orderBy: { createdAt: 'desc' },
      },
      bills: {
        include: { payments: true },
        orderBy: { createdAt: 'desc' },
      },
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
  });

  if (!order) {
    notFound();
  }

  const subtotal = order.items.reduce(
    (s, i) => s + i.unitPrice.toNumber() * i.quantity,
    0
  );
  const taxTotal = order.items.reduce(
    (s, i) => s + (i.unitPrice.toNumber() * i.quantity * i.taxRate.toNumber()) / 100,
    0
  );
  const grandTotal = subtotal + taxTotal;

  const hasActiveBill = order.bills.some(
    (b) => b.status !== 'CANCELLED' && b.status !== 'SPLIT_CHILDREN'
  );
  const canGenerateBill = !hasActiveBill && order.status !== 'CANCELLED';

  let contextTitle = 'Take-Away';
  if (order.orderType === 'DINE_IN' && order.tableSession) {
    contextTitle = `Dine-In — Table ${order.tableSession.tables.map((t) => t.table.tableNumber).join(', ')}`;
  } else if (order.orderType === 'ROOM_SERVICE' && order.room) {
    contextTitle = `Room Service — Room ${order.room.roomNumber}`;
  }

  return (
    <div className="space-y-6">
      <RestaurantHeader
        title={`Order Details #${order.orderNumber}`}
        subtitle={`${contextTitle} • Created at ${new Date(order.createdAt).toLocaleString()}`}
      />

      <div className="flex items-center justify-between">
        <Link href="/admin/restaurant/orders">
          <Button variant="outline" size="sm" className="text-xs">
            <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to Orders
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          {canGenerateBill && (
            <form action={async (formData: FormData) => { 'use server'; await generateRestaurantBillAction(null, formData); }}>
              <input type="hidden" name="orderId" value={order.id} />
              <Button type="submit" size="sm" className="text-xs">
                <Receipt className="w-3.5 h-3.5 mr-1.5" /> Generate Restaurant Bill
              </Button>
            </form>
          )}

          {hasActiveBill && (
            <Link href={`/admin/restaurant/bills/${order.bills[0].id}`}>
              <Button size="sm" variant="secondary" className="text-xs">
                <Receipt className="w-3.5 h-3.5 mr-1.5" /> View Active Bill ({order.bills[0].billNumber})
              </Button>
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ORDER ITEMS & TOTALS (2 COLS) */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3 border-b border-resort-sand/60">
              <CardTitle className="text-base font-serif">Order Line Items</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-resort-sand bg-resort-sand/20 font-semibold text-resort-charcoal">
                    <th className="p-3">Item</th>
                    <th className="p-3">Qty</th>
                    <th className="p-3 text-right">Unit Price</th>
                    <th className="p-3 text-right">GST Rate</th>
                    <th className="p-3 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-resort-sand/60">
                  {order.items.map((item) => (
                    <tr key={item.id}>
                      <td className="p-3">
                        <span className="font-semibold text-resort-charcoal">
                          {item.menuItem.name}
                        </span>
                        {item.notes && (
                          <p className="text-[11px] text-amber-800 italic">{item.notes}</p>
                        )}
                      </td>
                      <td className="p-3 font-bold font-mono">{item.quantity}</td>
                      <td className="p-3 text-right">{formatCurrency(item.unitPrice.toNumber())}</td>
                      <td className="p-3 text-right">{item.taxRate.toString()}%</td>
                      <td className="p-3 text-right font-bold text-resort-forest">
                        {formatCurrency(item.unitPrice.toNumber() * item.quantity)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="p-4 bg-resort-sand/20 border-t border-resort-sand/60 space-y-2 text-xs">
                <div className="flex justify-between text-resort-stone">
                  <span>Subtotal</span>
                  <span className="font-medium">{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between text-resort-stone">
                  <span>Total Tax (GST)</span>
                  <span className="font-medium">{formatCurrency(taxTotal)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-resort-charcoal pt-2 border-t border-resort-sand">
                  <span>Grand Total</span>
                  <span className="text-resort-forest text-base">{formatCurrency(grandTotal)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* KOT HISTORY */}
          <Card>
            <CardHeader className="pb-3 border-b border-resort-sand/60 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-serif flex items-center gap-2">
                <ChefHat className="w-4 h-4 text-resort-forest" />
                Kitchen Order Tickets ({order.kots.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {order.kots.length === 0 ? (
                <p className="text-xs text-resort-stone text-center py-4">No KOTs generated yet.</p>
              ) : (
                order.kots.map((kot) => (
                  <div
                    key={kot.id}
                    className="p-3 bg-resort-sand/20 rounded border border-resort-sand space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between border-b border-resort-sand/60 pb-1.5">
                      <span className="font-mono font-bold text-resort-forest">
                        #{kot.kotNumber}
                      </span>
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-white border border-resort-sand">
                        {kot.status}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {kot.items.map((ki) => (
                        <div key={ki.id} className="flex justify-between text-[11px]">
                          <span>{ki.menuItem.name}</span>
                          <span className="font-bold">{ki.quantity}x</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* ORDER CONTEXT & BILLING INFO (1 COL) */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3 border-b border-resort-sand/60">
              <CardTitle className="text-base font-serif">Order Metadata</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-resort-sand/40">
                <span className="text-resort-stone">Order Number</span>
                <span className="font-mono font-bold">{order.orderNumber}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-resort-sand/40">
                <span className="text-resort-stone">Order Type</span>
                <span className="font-semibold">{order.orderType.replace('_', ' ')}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-resort-sand/40">
                <span className="text-resort-stone">Status</span>
                <span className="font-bold text-resort-forest">{order.status}</span>
              </div>

              {order.orderType === 'DINE_IN' && order.tableSession && (
                <div className="p-3 bg-resort-sand/30 rounded space-y-1 mt-2">
                  <div className="font-semibold text-resort-charcoal">Dine-In Session</div>
                  <div className="text-[11px] text-resort-stone">
                    Tables: {order.tableSession.tables.map((t) => t.table.tableNumber).join(', ')}
                  </div>
                  <div className="text-[11px] text-resort-stone">
                    Party: {order.tableSession.guestName || 'Walk-In'} ({order.tableSession.paxCount} Pax)
                  </div>
                </div>
              )}

              {order.orderType === 'ROOM_SERVICE' && order.stay && (
                <div className="p-3 bg-indigo-50 rounded border border-indigo-200 space-y-1 mt-2">
                  <div className="font-semibold text-indigo-950 flex items-center gap-1.5">
                    <BedDouble className="w-3.5 h-3.5" /> Room Service PMS Delivery
                  </div>
                  <div className="text-[11px] text-indigo-900">
                    Room: {order.room?.roomNumber}
                  </div>
                  <div className="text-[11px] text-indigo-900">
                    Guest: {order.stay.primaryGuest.firstName} {order.stay.primaryGuest.lastName}
                  </div>
                  <div className="text-[10px] text-indigo-700 font-mono">
                    Stay #{order.stay.stayNumber}
                  </div>
                </div>
              )}

              {order.notes && (
                <div className="p-2 bg-amber-50 rounded border border-amber-200 text-amber-900 text-[11px]">
                  <strong>Notes:</strong> {order.notes}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

