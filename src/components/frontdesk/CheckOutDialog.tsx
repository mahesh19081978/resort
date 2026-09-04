'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { checkOutAction } from '@/actions/frontdesk';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from '@/components/ui/card';
import { PaymentMethod } from '@prisma/client';
import {
  LogOut,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  Banknote,
  QrCode,
  Loader2,
  BedDouble,
  Receipt,
} from 'lucide-react';

interface CheckOutDialogProps {
  stay: {
    id: string;
    stayNumber: string;
    actualCheckIn: string;
    expectedCheckOut: string;
    primaryGuest: {
      firstName: string;
      lastName: string;
      phone?: string | null;
      email?: string | null;
    };
    roomAssignments: Array<{
      room: {
        id: string;
        roomNumber: string;
        roomType: { name: string };
      };
    }>;
    folio: {
      id: string;
      folioNumber: string;
      totalCharges: string;
      totalCredits: string;
      totalBalance: string;
      items: Array<{
        id: string;
        itemType: string;
        description: string;
        amount: string;
        taxAmount: string;
        quantity: number;
        postedAt: string;
      }>;
      payments: Array<{
        id: string;
        paymentNumber: string;
        amount: string;
        method: string;
        status: string;
      }>;
    } | null;
  };
}

export function CheckOutDialog({ stay }: CheckOutDialogProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const rawBalance = parseFloat(stay.folio?.totalBalance || '0.00');
  const needsSettlement = rawBalance > 0;

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CARD);
  const [paymentAmount, setPaymentAmount] = useState<number>(needsSettlement ? rawBalance : 0);
  const [transactionRef, setTransactionRef] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const currentRoom = stay.roomAssignments[0]?.room;

  const handleCheckout = async () => {
    setError(null);
    setLoading(true);

    const formData = new FormData();
    formData.append('stayId', stay.id);
    if (notes) formData.append('notes', notes);

    if (needsSettlement) {
      if (paymentAmount < rawBalance) {
        setError('Settlement payment must cover the full outstanding balance of INR ' + rawBalance.toFixed(2));
        setLoading(false);
        return;
      }
      formData.append('settlementPaymentMethod', paymentMethod);
      formData.append('settlementPaymentAmount', paymentAmount.toString());
      if (transactionRef) formData.append('transactionReference', transactionRef);
    }

    const res = await checkOutAction(null, formData);
    setLoading(false);

    if (res.success) {
      setSuccess(true);
    } else {
      setError(res.error || 'Checkout failed');
    }
  };

  if (success) {
    return (
      <Card className="border-emerald-200 bg-emerald-50/40">
        <CardHeader>
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            <div>
              <CardTitle className="text-xl text-emerald-900">Checkout Complete</CardTitle>
              <CardDescription className="text-emerald-700">
                Stay #{stay.stayNumber} has concluded. Room {currentRoom?.roomNumber} transitioned to DIRTY.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-neutral-600">
            The stay folio has been settled, room assignment released, and housekeeping notified for turnover.
          </p>
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => router.push('/admin/frontdesk')}
            className="border-emerald-300 text-xs"
          >
            Return to Front Desk
          </Button>
          <Button
            onClick={() => router.push('/admin/frontdesk/departures')}
            className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs"
          >
            View Departures
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-3 text-rose-800 text-xs">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Stay & Guest Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs uppercase text-neutral-500 font-semibold">Guest & Stay</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs space-y-1">
            <div className="font-bold text-neutral-900 text-sm">
              {stay.primaryGuest.firstName} {stay.primaryGuest.lastName}
            </div>
            <div className="text-neutral-500">{stay.primaryGuest.phone || stay.primaryGuest.email}</div>
            <div className="font-mono text-neutral-700 pt-1">Stay: {stay.stayNumber}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs uppercase text-neutral-500 font-semibold">Room & Category</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs space-y-1">
            <div className="font-mono font-bold text-base text-neutral-900">
              Room {currentRoom?.roomNumber}
            </div>
            <div className="text-neutral-600">{currentRoom?.roomType.name}</div>
            <div className="text-[11px] text-amber-700 font-medium pt-1">
              Turnover: Will switch to DIRTY upon checkout
            </div>
          </CardContent>
        </Card>

        <Card className={needsSettlement ? 'border-l-4 border-l-rose-500' : 'border-l-4 border-l-emerald-500'}>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs uppercase text-neutral-500 font-semibold">Folio Balance</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs space-y-1">
            <div className="font-mono font-bold text-xl text-neutral-900">
              INR {stay.folio?.totalBalance || '0.00'}
            </div>
            <div className="text-neutral-500">
              Charges: INR {stay.folio?.totalCharges || '0.00'} | Credits: INR {stay.folio?.totalCredits || '0.00'}
            </div>
            <div className="text-[11px] font-semibold pt-1">
              {needsSettlement ? (
                <span className="text-rose-600">Settlement Required Before Departure</span>
              ) : (
                <span className="text-emerald-600">Zero Balance — Ready for Departure</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Folio Itemized Ledger */}
      <Card>
        <CardHeader className="p-4 border-b border-neutral-100">
          <CardTitle className="text-sm font-semibold flex items-center">
            <Receipt className="w-4 h-4 mr-2 text-resort-gold" /> Folio Ledger Breakdown ({stay.folio?.folioNumber})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-left text-xs text-neutral-600">
            <thead className="bg-neutral-50 text-neutral-700 uppercase font-semibold text-[10px] tracking-wider border-b border-neutral-200">
              <tr>
                <th className="p-3">Type</th>
                <th className="p-3">Description</th>
                <th className="p-3">Qty</th>
                <th className="p-3">Posted Date</th>
                <th className="p-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {stay.folio?.items.map((item) => (
                <tr key={item.id}>
                  <td className="p-3">
                    <span className="px-1.5 py-0.5 rounded bg-neutral-100 font-mono text-[10px] font-medium text-neutral-800">
                      {item.itemType}
                    </span>
                  </td>
                  <td className="p-3 font-medium text-neutral-900">{item.description}</td>
                  <td className="p-3 font-mono">{item.quantity}</td>
                  <td className="p-3 font-mono text-[11px]">
                    {new Date(item.postedAt).toLocaleDateString('en-IN')}
                  </td>
                  <td className="p-3 font-mono text-right font-semibold">INR {item.amount}</td>
                </tr>
              ))}
              {stay.folio?.payments.map((p) => (
                <tr key={p.id} className="bg-emerald-50/50">
                  <td className="p-3">
                    <span className="px-1.5 py-0.5 rounded bg-emerald-100 font-mono text-[10px] font-semibold text-emerald-800">
                      PAYMENT
                    </span>
                  </td>
                  <td className="p-3 font-medium text-emerald-900">
                    Settlement Payment #{p.paymentNumber} ({p.method})
                  </td>
                  <td className="p-3 font-mono">1</td>
                  <td className="p-3 font-mono text-[11px] text-emerald-700">PAID</td>
                  <td className="p-3 font-mono text-right font-bold text-emerald-700">
                    - INR {p.amount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Settlement Section (if balance > 0) */}
      {needsSettlement && (
        <Card className="border-amber-200 bg-amber-50/20">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-bold flex items-center text-amber-900">
              <CreditCard className="w-4 h-4 mr-2 text-amber-600" /> Settle Outstanding Folio Balance
            </CardTitle>
            <CardDescription className="text-xs text-amber-800">
              Collect payment to achieve zero balance. Folio settlement cannot leave an outstanding balance.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="paymentMethod" className="text-xs">Payment Method</Label>
                <select
                  id="paymentMethod"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full h-9 rounded-md border border-neutral-300 bg-white px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-neutral-900"
                >
                  <option value={PaymentMethod.CARD}>Credit / Debit Card</option>
                  <option value={PaymentMethod.UPI}>UPI / QR</option>
                  <option value={PaymentMethod.CASH}>Cash</option>
                  <option value={PaymentMethod.BANK_TRANSFER}>Bank Transfer</option>
                  <option value={PaymentMethod.ONLINE}>Online Gateway</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="paymentAmount" className="text-xs">Settlement Amount (INR)</Label>
                <Input
                  id="paymentAmount"
                  type="number"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                  className="text-xs font-mono font-bold"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="transactionRef" className="text-xs">Transaction / Auth Reference</Label>
                <Input
                  id="transactionRef"
                  placeholder="e.g. TXN987654321"
                  value={transactionRef}
                  onChange={(e) => setTransactionRef(e.target.value)}
                  className="text-xs font-mono"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Departure Notes & Final Submission */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="checkoutNotes" className="text-xs">Checkout Notes / Departure Feedback</Label>
            <Input
              id="checkoutNotes"
              placeholder="e.g. Keys returned, mini-bar checked, guest satisfied"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-xs"
            />
          </div>
        </CardContent>
        <CardFooter className="flex justify-between p-4 border-t border-neutral-100">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/admin/frontdesk/departures')}
            className="text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={loading}
            onClick={handleCheckout}
            className={
              needsSettlement
                ? 'bg-amber-600 hover:bg-amber-700 text-white text-xs'
                : 'bg-resort-charcoal hover:bg-neutral-800 text-white text-xs'
            }
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing Checkout...
              </>
            ) : (
              <>
                <LogOut className="w-4 h-4 mr-2" />
                {needsSettlement ? 'Collect Settlement & Complete Checkout' : 'Complete Checkout'}
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
