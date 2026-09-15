'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { recordFolioPaymentAction } from '@/actions/frontdesk';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { PaymentMethod } from '@prisma/client';
import crypto from 'crypto';
import {
  X,
  CreditCard,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

interface RecordPaymentModalProps {
  stayId: string;
  stayNumber: string;
  roomNumber: string;
  guestName: string;
  outstandingBalance: string;
  onClose: () => void;
}

function formatINR(amount: string): string {
  const num = parseFloat(amount);
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function RecordPaymentModal({
  stayId,
  stayNumber,
  roomNumber,
  guestName,
  outstandingBalance,
  onClose,
}: RecordPaymentModalProps) {
  const router = useRouter();
  const [paymentAmount, setPaymentAmount] = useState(outstandingBalance);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [transactionRef, setTransactionRef] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [resultData, setResultData] = useState<{
    paymentNumber: string;
    amount: string;
    newBalance: string;
  } | null>(null);

  const balance = parseFloat(outstandingBalance);

  const handleSubmit = async () => {
    setError(null);
    const amount = parseFloat(paymentAmount);

    if (isNaN(amount) || amount <= 0) {
      setError('Payment amount must be greater than zero.');
      return;
    }
    if (amount > balance + 0.01) {
      setError(`Payment amount (${formatINR(paymentAmount)}) exceeds outstanding balance (${formatINR(outstandingBalance)}).`);
      return;
    }

    setSubmitting(true);

    const idempotencyKey = `pay-${stayId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    const result = await recordFolioPaymentAction({
      stayId,
      amount,
      method: paymentMethod,
      transactionReference: transactionRef || undefined,
      notes: notes || undefined,
      idempotencyKey,
    });

    if (result.success && result.data) {
      setSuccess(true);
      setResultData(result.data);
      router.refresh();
    } else {
      setError(result.error || 'Payment recording failed');
    }
    setSubmitting(false);
  };

  if (success && resultData) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <Card className="w-full max-w-md mx-4 border-emerald-200 bg-emerald-50">
          <CardContent className="p-6 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
            <p className="text-sm font-semibold text-emerald-900">Payment Recorded Successfully</p>
            <div className="text-xs text-emerald-700 space-y-1">
              <p>Payment #{resultData.paymentNumber}</p>
              <p className="font-mono font-semibold">{formatINR(resultData.amount)}</p>
              <p>New Balance: <span className="font-mono font-semibold">{formatINR(resultData.newBalance)}</span></p>
            </div>
          </CardContent>
          <CardFooter className="p-4 pt-0 flex justify-center">
            <Button size="sm" variant="outline" onClick={onClose} className="text-xs border-emerald-300">
              Close
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
            <CardTitle className="text-sm font-semibold text-resort-charcoal">
              Record Payment — Room {roomNumber}
            </CardTitle>
            <button onClick={onClose} className="text-resort-muted hover:text-resort-charcoal">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-resort-muted">
            Stay: {stayNumber} | Guest: {guestName}
          </p>
        </CardHeader>

        <CardContent className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-rose-800 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Outstanding Balance Display */}
          <div className={`p-3 rounded-lg text-center ${balance > 0.01 ? 'bg-amber-50 border border-amber-200' : 'bg-emerald-50 border border-emerald-200'}`}>
            <p className="text-[10px] uppercase font-semibold text-resort-muted tracking-wider">Outstanding Balance</p>
            <p className={`text-xl font-mono font-bold mt-1 ${balance > 0.01 ? 'text-amber-800' : 'text-emerald-700'}`}>
              {formatINR(outstandingBalance)}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Payment Amount (₹) *</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              max={balance}
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              className="text-xs font-mono"
            />
            <p className="text-[10px] text-resort-muted">
              Partial payments allowed. Cannot exceed outstanding balance.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Payment Method *</Label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              className="w-full h-9 rounded-md border border-resort-sand bg-white px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-resort-forest"
            >
              <option value={PaymentMethod.CASH}>Cash</option>
              <option value={PaymentMethod.UPI}>UPI</option>
              <option value={PaymentMethod.CARD}>Card</option>
              <option value={PaymentMethod.BANK_TRANSFER}>Bank Transfer</option>
              <option value={PaymentMethod.ONLINE}>Online Gateway</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Transaction / Reference ID</Label>
            <Input
              placeholder="Optional reference number"
              value={transactionRef}
              onChange={(e) => setTransactionRef(e.target.value)}
              className="text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Input
              placeholder="Optional payment notes"
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
            disabled={submitting}
            onClick={handleSubmit}
            className="bg-resort-forest hover:bg-resort-forest-light text-white text-xs"
          >
            {submitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Recording...
              </>
            ) : (
              <>
                <CreditCard className="w-3.5 h-3.5 mr-1" /> Record Payment
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
