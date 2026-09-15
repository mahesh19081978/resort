'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { BillSummary } from '@/lib/frontdesk/bill';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Printer,
  Download,
  LogOut,
  Receipt,
  BedDouble,
  UtensilsCrossed,
  Wrench,
  CreditCard,
} from 'lucide-react';

interface BillViewProps {
  bill: BillSummary;
  stayId: string;
}

type BillTab = 'full' | 'room' | 'other';

function formatINR(amount: string): string {
  const num = parseFloat(amount);
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateFull(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function BillTable({ items, showTax = true }: { items: BillSummary['roomBillItems']; showTax?: boolean }) {
  if (items.length === 0) {
    return <p className="text-xs text-resort-muted text-center py-4">No items</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="bg-resort-sand-light text-resort-charcoal-text uppercase font-semibold text-[10px] tracking-wider">
          <tr>
            <th className="p-2.5">Date</th>
            <th className="p-2.5">Description</th>
            <th className="p-2.5 text-center">Qty</th>
            <th className="p-2.5 text-right">Rate</th>
            {showTax && <th className="p-2.5 text-right">Tax</th>}
            <th className="p-2.5 text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-resort-sand">
          {items.map((item, i) => (
            <tr key={i} className="hover:bg-resort-sand-light/50">
              <td className="p-2.5 text-resort-muted whitespace-nowrap">
                {formatDate(item.date)}
              </td>
              <td className="p-2.5 font-medium text-resort-charcoal-text">
                {item.description}
              </td>
              <td className="p-2.5 text-center font-mono">{item.quantity}</td>
              <td className="p-2.5 text-right font-mono">{formatINR(item.rate)}</td>
              {showTax && (
                <td className="p-2.5 text-right font-mono text-resort-muted">
                  {formatINR(item.tax)}
                </td>
              )}
              <td className="p-2.5 text-right font-mono font-semibold text-resort-charcoal-text">
                {formatINR(item.total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SummaryRow({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <div className={`flex justify-between items-center py-1.5 ${bold ? 'border-t-2 border-resort-forest pt-2 mt-1' : ''}`}>
      <span className={`text-xs ${bold ? 'font-bold text-resort-charcoal' : 'text-resort-muted'}`}>{label}</span>
      <span className={`font-mono text-xs ${bold ? 'font-bold text-resort-charcoal text-sm' : ''} ${color || ''}`}>
        {value}
      </span>
    </div>
  );
}

export function BillView({ bill, stayId }: BillViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<BillTab>('full');
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useCallback(() => {
    const content = printRef.current;
    if (!content) return;

    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Bill - ${bill.folioNumber}</title>
        <style>
          @page { margin: 15mm; size: A4; }
          body { font-family: 'Segoe UI', Arial, sans-serif; color: #333; margin: 0; padding: 20px; font-size: 12px; }
          .header { text-align: center; margin-bottom: 24px; border-bottom: 3px solid #173B2F; padding-bottom: 16px; }
          .header h1 { font-family: Georgia, serif; font-size: 22px; color: #173B2F; margin: 0; }
          .header p { font-size: 11px; color: #666; margin: 4px 0 0; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 20px; padding: 12px; background: #f9f9f9; border-radius: 6px; font-size: 11px; }
          .info-item label { font-weight: 600; color: #555; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 16px; }
          thead { background: #f5f5f5; }
          th { text-align: left; padding: 6px 8px; font-weight: 600; border-bottom: 1px solid #ddd; }
          td { padding: 5px 8px; border-bottom: 1px solid #eee; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .summary { padding: 12px; border: 1px solid #ddd; border-radius: 6px; margin: 12px 0; }
          .summary-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 11px; }
          .summary-row.total { font-weight: 700; font-size: 13px; border-top: 2px solid #173B2F; padding-top: 8px; margin-top: 4px; }
          .summary-row.balance { font-weight: 700; font-size: 14px; color: #173B2F; }
          .footer { text-align: center; margin-top: 30px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 10px; color: #888; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        ${content.innerHTML}
      </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  }, [bill.folioNumber]);

  const handleDownloadPDF = useCallback(async () => {
    const billType = activeTab;
    window.open(
      `/api/frontdesk/bill-pdf?stayId=${stayId}&type=${billType}`,
      '_blank'
    );
  }, [stayId, activeTab]);

  const tabs: Array<{ key: BillTab; label: string; icon: React.ReactNode }> = [
    { key: 'full', label: 'Full Folio', icon: <Receipt className="w-3.5 h-3.5" /> },
    { key: 'room', label: 'Room Bill', icon: <BedDouble className="w-3.5 h-3.5" /> },
    { key: 'other', label: 'Other Charges', icon: <UtensilsCrossed className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((tab) => (
          <Button
            key={tab.key}
            size="sm"
            variant={activeTab === tab.key ? 'primary' : 'outline'}
            className={
              activeTab === tab.key
                ? 'bg-resort-forest text-white text-xs'
                : 'text-xs border-resort-sand text-resort-charcoal-text'
            }
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.icon}
            <span className="ml-1">{tab.label}</span>
          </Button>
        ))}

        <div className="flex-1" />

        <Button
          size="sm"
          variant="outline"
          className="text-xs border-resort-sand"
          onClick={handlePrint}
        >
          <Printer className="w-3.5 h-3.5 mr-1" /> Print Bill
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-xs border-resort-sand"
          onClick={handleDownloadPDF}
        >
          <Download className="w-3.5 h-3.5 mr-1" /> Download PDF
        </Button>
        <Button
          size="sm"
          className="text-xs bg-resort-forest hover:bg-resort-forest-light text-white"
          onClick={() => router.push('/admin/frontdesk/checkout/' + stayId)}
        >
          <LogOut className="w-3.5 h-3.5 mr-1" /> Checkout
        </Button>
      </div>

      <div ref={printRef}>
        <div className="text-center mb-6 border-b-2 border-resort-forest pb-4">
          <h2 className="font-serif text-xl font-bold text-resort-charcoal">Infinity Resort & Restaurant</h2>
          <p className="text-xs text-resort-muted mt-1">
            {activeTab === 'room' ? 'Room Bill' : activeTab === 'other' ? 'Other Charges Bill' : 'Guest Folio'} &bull; Folio: {bill.folioNumber}
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 p-3 bg-resort-sand-light rounded-lg text-xs">
          <div>
            <span className="font-semibold text-resort-charcoal-text">Guest:</span>
            <span className="ml-1 text-resort-muted">{bill.guestName}</span>
          </div>
          <div>
            <span className="font-semibold text-resort-charcoal-text">Room:</span>
            <span className="ml-1 text-resort-muted">{bill.roomNumber} ({bill.roomTypeName})</span>
          </div>
          <div>
            <span className="font-semibold text-resort-charcoal-text">Stay:</span>
            <span className="ml-1 text-resort-muted">{bill.stayNumber}</span>
          </div>
          <div>
            <span className="font-semibold text-resort-charcoal-text">Reservation:</span>
            <span className="ml-1 text-resort-muted">{bill.reservationNumber || 'N/A'}</span>
          </div>
          <div>
            <span className="font-semibold text-resort-charcoal-text">Check-in:</span>
            <span className="ml-1 text-resort-muted">{formatDateFull(bill.actualCheckIn)}</span>
          </div>
          <div>
            <span className="font-semibold text-resort-charcoal-text">Expected Checkout:</span>
            <span className="ml-1 text-resort-muted">{formatDate(bill.expectedCheckOut)}</span>
          </div>
          <div>
            <span className="font-semibold text-resort-charcoal-text">Bill Date:</span>
            <span className="ml-1 text-resort-muted">{formatDate(bill.billDate)}</span>
          </div>
          {bill.actualCheckOut && (
            <div>
              <span className="font-semibold text-resort-charcoal-text">Actual Checkout:</span>
              <span className="ml-1 text-resort-muted">{formatDate(bill.actualCheckOut)}</span>
            </div>
          )}
        </div>

        {activeTab === 'full' && (
          <div className="space-y-6">
            <Card>
              <CardHeader className="p-3 border-b border-resort-sand">
                <CardTitle className="text-xs font-semibold flex items-center text-resort-forest">
                  <BedDouble className="w-3.5 h-3.5 mr-1.5" /> Room & Accommodation
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <BillTable items={bill.roomBillItems} />
                <div className="p-2.5 text-right border-t border-resort-sand text-xs">
                  <span className="text-resort-muted">Room Total: </span>
                  <span className="font-mono font-bold text-resort-charcoal">{formatINR(bill.roomTotal)}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-3 border-b border-resort-sand">
                <CardTitle className="text-xs font-semibold flex items-center text-resort-forest">
                  <Wrench className="w-3.5 h-3.5 mr-1.5" /> Additional / Extra Charges
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <BillTable items={bill.additionalBillItems} />
                <div className="p-2.5 text-right border-t border-resort-sand text-xs">
                  <span className="text-resort-muted">Additional Total: </span>
                  <span className="font-mono font-bold text-resort-charcoal">{formatINR(bill.additionalTotal)}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-3 border-b border-resort-sand">
                <CardTitle className="text-xs font-semibold flex items-center text-resort-forest">
                  <UtensilsCrossed className="w-3.5 h-3.5 mr-1.5" /> Restaurant / F&B
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <BillTable items={bill.restaurantBillItems} />
                <div className="p-2.5 text-right border-t border-resort-sand text-xs">
                  <span className="text-resort-muted">Restaurant Total: </span>
                  <span className="font-mono font-bold text-resort-charcoal">{formatINR(bill.restaurantTotal)}</span>
                </div>
              </CardContent>
            </Card>

            {bill.discountItems.length > 0 && (
              <Card>
                <CardHeader className="p-3 border-b border-resort-sand">
                  <CardTitle className="text-xs font-semibold flex items-center text-resort-forest">
                    Discounts
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <BillTable items={bill.discountItems} showTax={false} />
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {activeTab === 'room' && (
          <Card>
            <CardHeader className="p-3 border-b border-resort-sand">
              <CardTitle className="text-xs font-semibold flex items-center text-resort-forest">
                <BedDouble className="w-3.5 h-3.5 mr-1.5" /> Room & Accommodation
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <BillTable items={bill.roomBillItems} />
            </CardContent>
          </Card>
        )}

        {activeTab === 'other' && (
          <Card>
            <CardHeader className="p-3 border-b border-resort-sand">
              <CardTitle className="text-xs font-semibold flex items-center text-resort-forest">
                Other Charges
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <BillTable items={[...bill.additionalBillItems, ...bill.restaurantBillItems, ...bill.otherBillItems]} />
            </CardContent>
          </Card>
        )}

        <Card className="mt-6">
          <CardContent className="p-4 space-y-1">
            <SummaryRow label="Gross Charges" value={formatINR(bill.grossCharges)} bold />
            <SummaryRow label="Total Tax" value={formatINR(bill.totalTax)} />
            {parseFloat(bill.totalDiscounts) > 0 && (
              <SummaryRow label="Discounts" value={`-${formatINR(bill.totalDiscounts)}`} color="text-emerald-600" />
            )}
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader className="p-3 border-b border-resort-sand">
            <CardTitle className="text-xs font-semibold flex items-center text-resort-forest">
              <CreditCard className="w-3.5 h-3.5 mr-1.5" /> Payments
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {bill.allPayments.length === 0 ? (
              <p className="text-xs text-resort-muted text-center py-4">No payments recorded</p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-resort-sand-light text-resort-charcoal-text uppercase font-semibold text-[10px] tracking-wider">
                  <tr>
                    <th className="p-2.5">Date</th>
                    <th className="p-2.5">Method</th>
                    <th className="p-2.5 text-right">Amount</th>
                    <th className="p-2.5">Reference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-resort-sand">
                  {bill.allPayments.map((p, i) => (
                    <tr key={i}>
                      <td className="p-2.5 text-resort-muted">{formatDate(p.date)}</td>
                      <td className="p-2.5">{p.method}</td>
                      <td className="p-2.5 text-right font-mono font-semibold text-emerald-700">
                        {formatINR(p.amount)}
                      </td>
                      <td className="p-2.5 text-resort-muted">{p.reference || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardContent className="p-4 space-y-1">
            {parseFloat(bill.advancePaid) > 0 && (
              <SummaryRow label="Advance Paid (Reservation)" value={formatINR(bill.advancePaid)} />
            )}
            {parseFloat(bill.stayPayments) > 0 && (
              <SummaryRow label="Payments During Stay" value={formatINR(bill.stayPayments)} />
            )}
            <SummaryRow label="Total Payments Received" value={formatINR(bill.totalPayments)} bold />
            <SummaryRow
              label="Outstanding Balance"
              value={formatINR(bill.outstandingBalance)}
              bold
              color={parseFloat(bill.outstandingBalance) > 0.01 ? 'text-rose-600' : 'text-emerald-600'}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
