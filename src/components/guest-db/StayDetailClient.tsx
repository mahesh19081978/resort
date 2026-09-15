'use client';

import { useState, useTransition, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getStayDetailAction } from '@/actions/guest-db';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Bed, User, CreditCard, Receipt, Clock, ArrowLeft,
  Download, Printer, ChevronRight, Utensils, Wrench,
  DoorOpen, DoorClosed, FileText,
} from 'lucide-react';

interface StayDetailData {
  stayId: string;
  stayNumber: string;
  status: string;
  actualCheckIn: string;
  expectedCheckOut: string;
  actualCheckOut: string | null;
  notes: string | null;
  primaryGuest: { id: string; firstName: string; lastName: string; phone: string; email: string | null };
  reservation: { id: string; reservationNumber: string; source: string } | null;
  roomAssignments: Array<{
    id: string; roomNumber: string; roomTypeName: string;
    assignedAt: string; releasedAt: string | null; status: string;
  }>;
  accompanyingGuests: Array<{
    id: string; guestId: string; firstName: string; lastName: string; phone: string; isPrimary: boolean;
  }>;
  financialSummary: {
    accommodationCharges: string; additionalCharges: string; restaurantCharges: string;
    serviceCharges: string; taxCharges: string; discountCredits: string;
    grossCharges: string; totalPaid: string; totalRefunds: string; outstandingBalance: string;
    lineItems: Array<{
      date: string; description: string; quantity: number; unitPrice: string;
      taxAmount: string; amount: string; itemType: string; category: string;
    }>;
    payments: Array<{
      date: string; method: string; amount: string; reference: string | null; context: string;
    }>;
  };
  restaurantOrders: Array<{
    orderId: string; orderNumber: string; date: string; orderType: string;
    status: string; totalAmount: string; isPaid: boolean; isChargedToRoom: boolean;
    tableNumber: string | null; roomNumber: string | null;
    items: Array<{ name: string; quantity: number; unitPrice: string; amount: string }>;
  }>;
  serviceRequests: Array<{
    id: string; requestNo: string; serviceName: string; date: string;
    quantity: number; status: string; chargedToRoom: boolean; amount: string;
  }>;
  timeline: Array<{
    date: string; type: string; description: string; amount: string | null; icon: string;
  }>;
}

function formatINR(amount: string): string {
  const num = parseFloat(amount);
  return '\u20B9' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    ACTIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    CHECKED_OUT: 'bg-neutral-50 text-neutral-600 ring-neutral-500/20',
    EARLY_CHECKOUT: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${variants[status] || 'bg-neutral-50 text-neutral-600'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

const TIMELINE_ICONS: Record<string, typeof DoorOpen> = {
  'door-open': DoorOpen,
  'door-closed': DoorClosed,
  'bed': Bed,
  'receipt': Receipt,
  'utensils': Utensils,
  'wrench': Wrench,
  'credit-card': CreditCard,
};

export function StayDetailClient() {
  const router = useRouter();
  const params = useParams();
  const guestId = params.guestId as string;
  const stayId = params.stayId as string;
  const [isPending, startTransition] = useTransition();
  const [detail, setDetail] = useState<StayDetailData | null>(null);
  const [activeTab, setActiveTab] = useState<'financial' | 'restaurant' | 'services' | 'timeline'>('financial');

  useEffect(() => {
    startTransition(async () => {
      const result = await getStayDetailAction({ stayId });
      setDetail(result);
    });
  }, [stayId]);

  if (isPending && !detail) {
    return <div className="text-center py-12 text-neutral-500 text-sm">Loading stay details...</div>;
  }

  if (!detail) {
    return <div className="text-center py-12 text-neutral-500 text-sm">Stay not found</div>;
  }

  const { financialSummary } = detail;
  const accomItems = financialSummary.lineItems.filter((i) => i.category === 'accommodation');
  const addItems = financialSummary.lineItems.filter((i) => i.category === 'additional');
  const restItems = financialSummary.lineItems.filter((i) => i.category === 'restaurant');

  return (
    <div>
      <button
        onClick={() => router.push(`/admin/guests/${guestId}`)}
        className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-resort-forest mb-4"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to Guest Profile
      </button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif text-2xl font-bold text-resort-charcoal flex items-center gap-2">
            <Bed className="h-6 w-6 text-resort-forest" />
            Stay {detail.stayNumber}
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Guest: {detail.primaryGuest.firstName} {detail.primaryGuest.lastName} | Room: {detail.roomAssignments[0]?.roomNumber ?? 'Unassigned'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => {
              const printWindow = window.open('', '_blank');
              if (!printWindow) return;
              printWindow.document.write(`
                <html><head><title>Folio ${detail.stayNumber}</title>
                <style>
                  body { font-family: system-ui, sans-serif; padding: 2rem; font-size: 12px; }
                  table { width: 100%; border-collapse: collapse; }
                  th, td { padding: 6px 8px; border-bottom: 1px solid #e5e5e5; text-align: left; }
                  th { background: #f5f5f5; font-weight: 600; }
                  .total { font-weight: bold; border-top: 2px solid #333; }
                  .header { margin-bottom: 1.5rem; }
                  .header h1 { font-size: 18px; margin: 0; }
                  .header p { margin: 2px 0; color: #666; }
                </style></head><body>
                <div class="header">
                  <h1>Infinity Resort &amp; Restaurant</h1>
                  <p>Folio: ${detail.stayNumber} | Guest: ${detail.primaryGuest.firstName} ${detail.primaryGuest.lastName}</p>
                  <p>Check-in: ${formatDate(detail.actualCheckIn)} | Room: ${detail.roomAssignments[0]?.roomNumber ?? 'N/A'}</p>
                </div>
                <table>
                  <thead><tr><th>Description</th><th>Tax</th><th style="text-align:right">Amount</th></tr></thead>
                  <tbody>
                    ${financialSummary.lineItems.map(item => `<tr><td>${item.description}</td><td>${formatINR(item.taxAmount)}</td><td style="text-align:right">${formatINR(item.amount)}</td></tr>`).join('')}
                  </tbody>
                </table>
                <p style="margin-top:1rem">Outstanding Balance: <strong>${formatINR(financialSummary.outstandingBalance)}</strong></p>
                <p style="color:#999;margin-top:2rem;font-size:10px">Infinity Resort &amp; Restaurant | Computer-generated document</p>
                </body></html>
              `);
              printWindow.document.close();
              printWindow.print();
            }}
          >
            <Printer className="h-3.5 w-3.5 mr-1" />
            Print Bill
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => window.print()}
          >
            <Download className="h-3.5 w-3.5 mr-1" />
            Download Report
          </Button>
        </div>
      </div>

      <div className="border-b border-resort-sand/60 mb-6" />

      {/* Stay Header */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-neutral-500 block mb-0.5">Stay #</span>
              <span className="font-mono font-semibold text-resort-forest">{detail.stayNumber}</span>
            </div>
            <div>
              <span className="text-neutral-500 block mb-0.5">Status</span>
              <StatusBadge status={detail.status} />
            </div>
            <div>
              <span className="text-neutral-500 block mb-0.5">Check-in</span>
              <span className="font-medium">{formatDateTime(detail.actualCheckIn)}</span>
            </div>
            <div>
              <span className="text-neutral-500 block mb-0.5">Expected Checkout</span>
              <span className="font-medium">{formatDate(detail.expectedCheckOut)}</span>
            </div>
            {detail.actualCheckOut && (
              <div>
                <span className="text-neutral-500 block mb-0.5">Actual Checkout</span>
                <span className="font-medium">{formatDateTime(detail.actualCheckOut)}</span>
              </div>
            )}
            {detail.reservation && (
              <div>
                <span className="text-neutral-500 block mb-0.5">Reservation</span>
                <span className="font-mono text-[10px]">{detail.reservation.reservationNumber}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Accompanying Guests */}
      {detail.accompanyingGuests.length > 0 && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <h3 className="text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-3">Accompanying Guests</h3>
            <div className="flex gap-3">
              {detail.accompanyingGuests.map((g) => (
                <div
                  key={g.id}
                  className="border border-neutral-200 rounded-lg px-3 py-2 text-xs cursor-pointer hover:border-resort-forest/30"
                  onClick={() => router.push(`/admin/guests/${g.guestId}`)}
                >
                  <div className="font-medium">{g.firstName} {g.lastName}</div>
                  <div className="text-[10px] text-neutral-500">{g.phone}</div>
                  <div className="text-[10px] text-neutral-400">{g.isPrimary ? 'Primary' : 'Accompanying'}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Room Assignment History */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <h3 className="text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-3">Room Assignment History</h3>
          <div className="space-y-2">
            {detail.roomAssignments.map((ra) => (
              <div key={ra.id} className="flex items-center gap-3 text-xs border border-neutral-100 rounded px-3 py-2">
                <span className="font-mono font-semibold text-resort-forest">{ra.roomNumber}</span>
                <span className="text-neutral-400">|</span>
                <span className="text-neutral-600">{ra.roomTypeName}</span>
                <span className="text-neutral-400">|</span>
                <span>{formatDateTime(ra.assignedAt)}</span>
                <span className="text-neutral-400">&rarr;</span>
                <span>{ra.releasedAt ? formatDateTime(ra.releasedAt) : 'Current'}</span>
                <StatusBadge status={ra.status} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Financial Summary Tabs */}
      <div className="flex gap-1 mb-4 border-b border-neutral-200 pb-1">
        {(['financial', 'restaurant', 'services', 'timeline'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-xs font-medium rounded-t transition-colors ${
              activeTab === tab
                ? 'bg-white border border-neutral-200 border-b-white text-resort-forest -mb-px'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            {tab === 'financial' && 'Financial Summary'}
            {tab === 'restaurant' && `Restaurant (${detail.restaurantOrders.length})`}
            {tab === 'services' && `Services (${detail.serviceRequests.length})`}
            {tab === 'timeline' && 'Timeline'}
          </button>
        ))}
      </div>

      {/* Financial Tab */}
      {activeTab === 'financial' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            {accomItems.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <h4 className="text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-3">Accommodation</h4>
                  <div className="space-y-1">
                    {accomItems.map((item, i) => (
                      <div key={i} className="flex justify-between text-xs py-1 border-b border-neutral-50">
                        <span>{item.description}</span>
                        <span className="font-medium">{formatINR(item.amount)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-xs font-semibold mt-2 pt-2 border-t border-neutral-200">
                    <span>Accommodation Total</span>
                    <span className="text-resort-forest">{formatINR(financialSummary.accommodationCharges)}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {addItems.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <h4 className="text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-3">Additional Services</h4>
                  <div className="space-y-1">
                    {addItems.map((item, i) => (
                      <div key={i} className="flex justify-between text-xs py-1 border-b border-neutral-50">
                        <span>{item.description}</span>
                        <span className="font-medium">{formatINR(item.amount)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-xs font-semibold mt-2 pt-2 border-t border-neutral-200">
                    <span>Additional Total</span>
                    <span className="text-resort-forest">{formatINR(financialSummary.additionalCharges)}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {restItems.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <h4 className="text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-3">Restaurant / F&B</h4>
                  <div className="space-y-1">
                    {restItems.map((item, i) => (
                      <div key={i} className="flex justify-between text-xs py-1 border-b border-neutral-50">
                        <span>{item.description}</span>
                        <span className="font-medium">{formatINR(item.amount)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-xs font-semibold mt-2 pt-2 border-t border-neutral-200">
                    <span>Restaurant Total</span>
                    <span className="text-resort-forest">{formatINR(financialSummary.restaurantCharges)}</span>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <Card>
              <CardContent className="p-4">
                <h4 className="text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-3">Payments</h4>
                {financialSummary.payments.length > 0 ? (
                  <div className="space-y-1">
                    {financialSummary.payments.map((p, i) => (
                      <div key={i} className="flex justify-between text-xs py-1 border-b border-neutral-50">
                        <div>
                          <span className="text-neutral-500">{formatDate(p.date)}</span>
                          <span className="mx-1 text-neutral-300">|</span>
                          <span>{p.method}</span>
                        </div>
                        <span className="font-medium text-emerald-600">{formatINR(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-neutral-400">No payments recorded</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-resort-forest/30">
              <CardContent className="p-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-neutral-500">Gross Charges</span>
                    <span className="font-medium">{formatINR(financialSummary.grossCharges)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-neutral-500">Total Paid</span>
                    <span className="font-medium text-emerald-600">{formatINR(financialSummary.totalPaid)}</span>
                  </div>
                  {parseFloat(financialSummary.totalRefunds) > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-neutral-500">Refunds</span>
                      <span className="font-medium text-red-600">{formatINR(financialSummary.totalRefunds)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-bold border-t border-neutral-200 pt-2">
                    <span>Outstanding Balance</span>
                    <span className={parseFloat(financialSummary.outstandingBalance) > 0 ? 'text-red-600' : 'text-emerald-600'}>
                      {formatINR(financialSummary.outstandingBalance)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Restaurant Tab */}
      {activeTab === 'restaurant' && (
        <div>
          {detail.restaurantOrders.length === 0 ? (
            <div className="text-center py-8 text-neutral-500 text-xs">No restaurant orders</div>
          ) : (
            <div className="space-y-3">
              {detail.restaurantOrders.map((order) => (
                <Card key={order.orderId}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <span className="font-mono text-xs font-semibold text-resort-forest">{order.orderNumber}</span>
                        <span className="text-neutral-400 mx-2">|</span>
                        <span className="text-xs">{order.orderType}</span>
                        {order.tableNumber && (
                          <span className="text-neutral-400 mx-2">|</span>
                        )}
                        {order.tableNumber && <span className="text-xs">Table {order.tableNumber}</span>}
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-medium">{formatINR(order.totalAmount)}</span>
                        <div className="flex gap-1 mt-0.5">
                          {order.isPaid && (
                            <span className="text-[10px] text-emerald-600 font-medium">Paid</span>
                          )}
                          {order.isChargedToRoom && (
                            <span className="text-[10px] text-amber-600 font-medium">Room Charge</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-[10px] text-neutral-400 mb-2">{formatDateTime(order.date)}</div>
                    <div className="space-y-0.5">
                      {order.items.map((item, i) => (
                        <div key={i} className="flex justify-between text-[10px] py-0.5">
                          <span>{item.name} x{item.quantity}</span>
                          <span>{formatINR(item.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Services Tab */}
      {activeTab === 'services' && (
        <div>
          {detail.serviceRequests.length === 0 ? (
            <div className="text-center py-8 text-neutral-500 text-xs">No service requests</div>
          ) : (
            <div className="space-y-2">
              {detail.serviceRequests.map((sr) => (
                <div key={sr.id} className="flex items-center justify-between border border-neutral-200 rounded px-4 py-3 text-xs">
                  <div>
                    <span className="font-medium">{sr.serviceName}</span>
                    <span className="text-neutral-400 mx-2">|</span>
                    <span className="text-neutral-500">{sr.requestNo}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-neutral-500">{formatDate(sr.date)}</span>
                    <span className="text-neutral-500">Qty: {sr.quantity}</span>
                    <span className="font-medium">{formatINR(sr.amount)}</span>
                    {sr.chargedToRoom && (
                      <span className="text-[10px] text-amber-600 font-medium">Posted to Folio</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Timeline Tab */}
      {activeTab === 'timeline' && (
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-px bg-neutral-200" />
          <div className="space-y-0">
            {detail.timeline.map((event, i) => {
              const IconComp = TIMELINE_ICONS[event.icon] || Clock;
              return (
                <div key={i} className="flex items-start gap-4 py-3 relative">
                  <div className="h-8 w-8 rounded-full bg-white border-2 border-neutral-200 flex items-center justify-center z-10 shrink-0">
                    <IconComp className="h-3.5 w-3.5 text-neutral-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-neutral-400">{formatDateTime(event.date)}</span>
                      <span className="text-[10px] font-semibold text-neutral-600 uppercase">{event.type.replace(/_/g, ' ')}</span>
                    </div>
                    <div className="text-xs text-resort-charcoal mt-0.5">{event.description}</div>
                    {event.amount && (
                      <div className="text-xs font-medium text-resort-forest mt-0.5">{formatINR(event.amount)}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
