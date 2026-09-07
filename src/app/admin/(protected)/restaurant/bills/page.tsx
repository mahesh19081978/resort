import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { requirePermission } from '@/lib/auth/auth';
import { RestaurantHeader } from '@/components/restaurant/RestaurantHeader';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Receipt, Eye, CreditCard, CheckCircle2, BedDouble } from 'lucide-react';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function RestaurantBillsPage() {
  await requirePermission('restaurant:bill:create');

  const bills = await prisma.restaurantBill.findMany({
    include: {
      order: {
        include: {
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
      },
      payments: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <RestaurantHeader
        title="Restaurant Billing & Settlements"
        subtitle="Manage guest invoices, multi-tender payments, room charges, and split bills."
      />

      <div className="bg-white rounded-lg border border-resort-sand overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-resort-sand bg-resort-sand/20 font-semibold text-resort-charcoal">
              <th className="p-3">Bill #</th>
              <th className="p-3">Order #</th>
              <th className="p-3">Table / Room Context</th>
              <th className="p-3 text-right">Subtotal</th>
              <th className="p-3 text-right">Tax (GST)</th>
              <th className="p-3 text-right">Grand Total</th>
              <th className="p-3 text-right">Paid</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-resort-sand/60">
            {bills.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-resort-stone">
                  No restaurant bills generated yet.
                </td>
              </tr>
            ) : (
              bills.map((bill) => {
                const totalPaid = bill.payments
                  .filter((p) => p.status === 'SUCCESS')
                  .reduce((sum, p) => sum + p.amount.toNumber(), 0);

                let contextLabel = 'Take-Away';
                if (bill.order.orderType === 'DINE_IN' && bill.order.tableSession) {
                  contextLabel = `Table ${bill.order.tableSession.tables.map((t) => t.table.tableNumber).join(', ')}`;
                } else if (bill.order.orderType === 'ROOM_SERVICE' && bill.order.room) {
                  contextLabel = `Room ${bill.order.room.roomNumber} (${bill.order.stay?.primaryGuest ? `${bill.order.stay.primaryGuest.firstName} ${bill.order.stay.primaryGuest.lastName}` : ''})`;
                }

                return (
                  <tr key={bill.id} className="hover:bg-resort-sand/10 transition-colors">
                    <td className="p-3 font-mono font-bold text-resort-charcoal">
                      #{bill.billNumber}
                    </td>
                    <td className="p-3 font-mono text-resort-forest">
                      {bill.order.orderNumber}
                    </td>
                    <td className="p-3">
                      <div className="font-semibold text-resort-charcoal">{contextLabel}</div>
                      <div className="text-[11px] text-resort-stone">
                        {bill.order.orderType.replace('_', ' ')}
                      </div>
                    </td>
                    <td className="p-3 text-right font-medium">
                      {formatCurrency(bill.subtotal.toNumber())}
                    </td>
                    <td className="p-3 text-right text-resort-stone">
                      {formatCurrency(bill.taxAmount.toNumber())}
                    </td>
                    <td className="p-3 text-right font-bold text-resort-charcoal">
                      {formatCurrency(bill.totalAmount.toNumber())}
                    </td>
                    <td className="p-3 text-right font-bold text-emerald-700">
                      {formatCurrency(totalPaid)}
                    </td>
                    <td className="p-3">
                      <span
                        className={cn(
                          'text-[10px] font-bold px-2 py-0.5 rounded tracking-wide uppercase',
                          bill.status === 'ISSUED' && 'bg-amber-100 text-amber-800',
                          bill.status === 'SETTLED' && 'bg-emerald-100 text-emerald-800',
                          bill.status === 'CHARGED_TO_ROOM' && 'bg-indigo-100 text-indigo-800',
                          bill.status === 'SPLIT_CHILDREN' && 'bg-purple-100 text-purple-800',
                          bill.status === 'CANCELLED' && 'bg-red-100 text-red-800'
                        )}
                      >
                        {bill.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <Link href={`/admin/restaurant/bills/${bill.id}`}>
                        <Button size="sm" variant="outline" className="h-7 text-xs">
                          <Eye className="w-3.5 h-3.5 mr-1" /> Settle / View
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
