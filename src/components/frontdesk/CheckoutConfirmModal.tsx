'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { checkOutAction } from '@/actions/frontdesk';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { PaymentMethod } from '@prisma/client';
import {
  X,
  LogOut,
  Loader2,
  AlertCircle,
  CheckCircle2,
  CreditCard,
  Receipt,
} from 'lucide-react';

interface CheckoutConfirmModalProps {
  stayId: string;
  stayNumber: string;
  roomNumber: string;
  guestName: string;
  outstandingBalance: string;
  totalCharges: string;
  totalPaid: string;
  onClose: () => void;
}

function formatINR(amount: string): string {
  const num = parseFloat(amount);
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function CheckoutConfirmModal({
  stayId,
  stayNumber,
  roomNumber,
  guestName,
  outstandingBalance,
  totalCharges,
  totalPaid,
  onClose,
}: CheckoutConfirmModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const rawBalance = parseFloat(outstandingBalance);
  const needsSettlement = rawBalance > 0;

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [paymentAmount, setPaymentAmount] = useState<number>(needsSettlement ? rawBalance : 0);
  const [transactionRef, setTransactionRef] = useState('');
  const [notes, setNotes] = useState('');

  const handleCheckout = async () => {
    setError(null);
    setLoading(true);

    const formData = new FormData();
    formData.append('stayId', stayId);
    if (notes) formData.append('notes', notes);

    if (needsSettlement) {
      if (paymentAmount < rawBalance - 0.01) {
        setError('Settlement payment must cover the full outstanding balance of ' + formatINR(outstandingBalance));
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
      router.refresh();
    } else {
      setError(res.error || 'Checkout failed');
    }
  };

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <Card className="w-full max-w-md mx-4 border-emerald-200 bg-emerald-50">
          <CardContent className="p-6 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
            <p className="text-sm font-semibold text-emerald-900">Checkout Complete</p>
            <p className="text-xs text-emerald-700">
              Stay #{stayNumber} has concluded. Room {roomNumber} transitioned to DIRTY.
            </p>
          </CardContent>
          <CardFooter className="p-4 pt-0 flex justify-center gap-2">
            <Button size="sm" variant="outline" onClick={onClose} className="text-xs border-emerald-300">
              Close
            </Button>
            <Button
              size="sm"
              onClick={() => { onClose(); router.push('/admin/frontdesk'); }}
              className="text-xs bg-emerald-700 hover:bg-emerald-800 text-white"
            >
              Return to Front Desk
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <Card
        className="w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="p-4 pb-2 border-b border-resort-sand">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-resort-charcoal flex items-center gap-2">
              <LogOut className="w-4 h-4 text-resort-forest" />
              Confirm Checkout
            </CardTitle>
            <button onClick={onClose} className="text-resort-muted hover:text-resort-charcoal">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-resort-muted">
            Stay: {stayNumber} | Room: {roomNumber} | Guest: {guestName}
          </p>
        </CardHeader>

        <CardContent className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-rose-800 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Final Financial Summary */}
          <div className="p-3 bg-resort-sand-light rounded-lg space-y-1.5">
            <div className="flex items-center gap-1.5 text-[10px] uppercase font-semibold text-resort-muted tracking-wider mb-2">
              <Receipt className="w-3 h-3" /> Final Financial Summary
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-resort-muted">Total Charges</span>
              <span className="font-mono font-medium text-resort-charcoal-text">{formatINR(totalCharges)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-resort-muted">Payments Made</span>
              <span className="font-mono font-semibold text-emerald-700">{formatINR(totalPaid)}</span>
            </div>
            <div className="flex justify-between text-xs pt-1.5 border-t border-resort-sand">
              <span className="font-semibold text-resort-charcoal-text">Balance Due</span>
              <span className={`font-mono font-bold ${needsSettlement ? 'text-rose-600' : 'text-emerald-600'}`}>
                {formatINR(outstandingBalance)}
              </span>
            </div>
          </div>

          {needsSettlement && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-[10px] uppercase font-semibold text-amber-800 tracking-wider mb-2">Settlement Required</p>
              <p className="text-[11px] text-amber-700 mb-3">
                Collect payment to achieve zero balance. Folio cannot be settled with an outstanding balance.
              </p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Payment Method</Label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full h-9 rounded-md border border-amber-300 bg-white px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-amber-600"
                  >
                    <option value={PaymentMethod.CASH}>Cash</option>
                    <option value={PaymentMethod.UPI}>UPI</option>
                    <option value={PaymentMethod.CARD}>Card</option>
                    <option value={PaymentMethod.BANK_TRANSFER}>Bank Transfer</option>
                    <option value={PaymentMethod.ONLINE}>Online Gateway</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Settlement Amount (₹)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={rawBalance}
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                    className="text-xs font-mono font-bold"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Transaction / Auth Reference</Label>
                  <Input
                    placeholder="Optional reference"
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                    className="text-xs font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Checkout Notes</Label>
            <Input
              placeholder="Optional departure notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-xs"
            />
          </div>
        </CardContent>

        <CardFooter className="p-4 pt-0 flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs border-resort-sand"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={loading}
            onClick={handleCheckout}
            className={
              needsSettlement
                ? 'bg-amber-600 hover:bg-amber-700 text-white text-xs'
                : 'bg-resort-forest hover:bg-resort-forest-light text-white text-xs'
            }
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Processing...
              </>
            ) : (
              <>
                <LogOut className="w-3.5 h-3.5 mr-1" />
                {needsSettlement ? 'Settle & Complete Checkout' : 'Complete Checkout'}
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
