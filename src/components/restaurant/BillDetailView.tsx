'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  recordBillPaymentAction,
  postBillToRoomChargeAction,
  splitRestaurantBillAction,
} from '@/actions/restaurant';
import { formatCurrency } from '@/lib/utils';
import {
  Receipt,
  CreditCard,
  BedDouble,
  Scissors,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BillPaymentItem {
  id: string;
  paymentNumber: string;
  amount: number;
  method: string;
  paymentDate: string;
  status: string;
  transactionReference?: string | null;
}

export interface BillDetailData {
  id: string;
  billNumber: string;
  status: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  createdAt: string;
  order: {
    id: string;
    orderNumber: string;
    orderType: string;
    tableOrRoom: string;
    items: {
      id: string;
      name: string;
      quantity: number;
      unitPrice: number;
      taxRate: number;
      totalPrice: number;
    }[];
    stay?: {
      id: string;
      stayNumber: string;
      guestName: string;
      roomId: string;
      roomNumber: string;
    } | null;
  };
  payments: BillPaymentItem[];
  folioItem?: {
    id: string;
    folioNumber?: string;
  } | null;
  parentBillId?: string | null;
  childBills?: {
    id: string;
    billNumber: string;
    totalAmount: number;
    status: string;
  }[];
}

export function BillDetailView({ bill }: { bill: BillDetailData }) {
  const [activeModal, setActiveModal] = useState<'PAY' | 'ROOM_CHARGE' | 'SPLIT' | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<string>('CASH');
  const [payRef, setPayRef] = useState<string>('');
  const [splitParts, setSplitParts] = useState<number>(2);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const totalPaid = bill.payments
    .filter((p) => p.status === 'SUCCESS')
    .reduce((sum, p) => sum + p.amount, 0);

  const outstanding = Math.max(0, bill.totalAmount - totalPaid);
  const isSettled = bill.status === 'SETTLED';
  const isChargedToRoom = bill.status === 'CHARGED_TO_ROOM';
  const isCancelled = bill.status === 'CANCELLED';
  const isSplitChildren = bill.status === 'SPLIT_CHILDREN';

  const canPayOrCharge = !isSettled && !isChargedToRoom && !isCancelled && !isSplitChildren && outstanding > 0;

  const handleOpenPayModal = () => {
    setPayAmount(outstanding);
    setPayMethod('CASH');
    setPayRef('');
    setErrorMessage(null);
    setActiveModal('PAY');
  };

  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    const formData = new FormData();
    formData.append('billId', bill.id);
    formData.append('amount', String(payAmount));
    formData.append('method', payMethod);
    if (payRef) formData.append('transactionReference', payRef);

    const res = await recordBillPaymentAction(null, formData);
    setIsSubmitting(false);

    if (res.success) {
      setActiveModal(null);
      window.location.reload();
    } else {
      setErrorMessage(res.error || 'Payment failed.');
    }
  };

  const handleRoomChargeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bill.order.stay) {
      alert('No active stay context attached to this order.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const formData = new FormData();
    formData.append('billId', bill.id);
    formData.append('stayId', bill.order.stay.id);
    formData.append('roomId', bill.order.stay.roomId);

    const res = await postBillToRoomChargeAction(null, formData);
    setIsSubmitting(false);

    if (res.success) {
      setActiveModal(null);
      window.location.reload();
    } else {
      setErrorMessage(res.error || 'Failed to charge to room folio.');
    }
  };

  const handleSplitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    const res = await splitRestaurantBillAction({
      parentBillId: bill.id,
      splitType: 'EQUAL',
      equalParts: splitParts,
    });
    setIsSubmitting(false);

    if (res.success) {
      setActiveModal(null);
      window.location.reload();
    } else {
      setErrorMessage(res.error || 'Failed to split bill.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <Link href="/admin/restaurant/bills">
          <Button variant="outline" size="sm" className="text-xs">
            <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to Invoices
          </Button>
        </Link>

        {canPayOrCharge && (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleOpenPayModal} className="text-xs">
              <CreditCard className="w-3.5 h-3.5 mr-1.5" /> Record Payment
            </Button>

            {bill.order.stay && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setErrorMessage(null);
                  setActiveModal('ROOM_CHARGE');
                }}
                className="text-xs"
              >
                <BedDouble className="w-3.5 h-3.5 mr-1.5" /> Charge to Room Folio
              </Button>
            )}

            {bill.payments.length === 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setErrorMessage(null);
                  setActiveModal('SPLIT');
                }}
                className="text-xs"
              >
                <Scissors className="w-3.5 h-3.5 mr-1.5" /> Split Bill
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* BILL DETAILS & LINE ITEMS (2 COLS) */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3 border-b border-resort-sand flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg font-serif">Invoice #{bill.billNumber}</CardTitle>
                <p className="text-xs text-resort-stone mt-0.5">
                  Order #{bill.order.orderNumber} • {bill.order.tableOrRoom}
                </p>
              </div>
              <span
                className={cn(
                  'text-xs font-bold px-2.5 py-1 rounded tracking-wide uppercase',
                  isSettled && 'bg-emerald-100 text-emerald-800',
                  isChargedToRoom && 'bg-indigo-100 text-indigo-800',
                  bill.status === 'ISSUED' && 'bg-amber-100 text-amber-800',
                  isSplitChildren && 'bg-purple-100 text-purple-800',
                  isCancelled && 'bg-red-100 text-red-800'
                )}
              >
                {bill.status.replace(/_/g, ' ')}
              </span>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-resort-sand bg-resort-sand/20 font-semibold text-resort-charcoal">
                    <th className="p-3">Dish / Item</th>
                    <th className="p-3">Qty</th>
                    <th className="p-3 text-right">Unit Price</th>
                    <th className="p-3 text-right">GST Rate</th>
                    <th className="p-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-resort-sand/60">
                  {bill.order.items.map((item) => (
                    <tr key={item.id}>
                      <td className="p-3 font-semibold text-resort-charcoal">{item.name}</td>
                      <td className="p-3 font-bold font-mono">{item.quantity}</td>
                      <td className="p-3 text-right">{formatCurrency(item.unitPrice)}</td>
                      <td className="p-3 text-right">{item.taxRate}%</td>
                      <td className="p-3 text-right font-bold text-resort-forest">
                        {formatCurrency(item.totalPrice)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Financial Calculation breakdown */}
              <div className="p-4 bg-resort-sand/20 border-t border-resort-sand/60 space-y-2 text-xs">
                <div className="flex justify-between text-resort-stone">
                  <span>Subtotal</span>
                  <span className="font-medium">{formatCurrency(bill.subtotal)}</span>
                </div>
                {bill.discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Discount</span>
                    <span className="font-medium">-{formatCurrency(bill.discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-resort-stone">
                  <span>GST Taxes (5%)</span>
                  <span className="font-medium">{formatCurrency(bill.taxAmount)}</span>
                </div>
                <div className="flex justify-between text-base font-bold text-resort-charcoal pt-2 border-t border-resort-sand">
                  <span>Total Amount</span>
                  <span className="text-resort-forest">{formatCurrency(bill.totalAmount)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Child Split Bills if split */}
          {bill.childBills && bill.childBills.length > 0 && (
            <Card>
              <CardHeader className="pb-3 border-b border-resort-sand">
                <CardTitle className="text-base font-serif flex items-center gap-2">
                  <Scissors className="w-4 h-4 text-resort-forest" />
                  Split Child Invoices ({bill.childBills.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-2">
                {bill.childBills.map((child) => (
                  <div
                    key={child.id}
                    className="p-3 bg-resort-sand/20 rounded border border-resort-sand flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-mono font-bold text-resort-charcoal">
                        #{child.billNumber}
                      </span>
                      <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded uppercase bg-white border border-resort-sand">
                        {child.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-resort-forest">
                        {formatCurrency(child.totalAmount)}
                      </span>
                      <Link href={`/admin/restaurant/bills/${child.id}`}>
                        <Button size="sm" variant="outline" className="h-6 text-[11px]">
                          View
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* PAYMENT LEDGER */}
          <Card>
            <CardHeader className="pb-3 border-b border-resort-sand flex flex-row items-center justify-between">
              <CardTitle className="text-base font-serif flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-resort-forest" />
                Payments Recorded ({bill.payments.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {bill.payments.length === 0 ? (
                <p className="text-xs text-resort-stone text-center py-4">
                  No payments recorded for this bill yet.
                </p>
              ) : (
                bill.payments.map((p) => (
                  <div
                    key={p.id}
                    className="p-3 bg-white rounded border border-emerald-200 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-mono font-bold text-resort-charcoal">
                        #{p.paymentNumber}
                      </div>
                      <div className="text-[11px] text-resort-stone">
                        Method: <strong>{p.method}</strong>{' '}
                        {p.transactionReference && `• Ref: ${p.transactionReference}`}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-sm text-emerald-800">
                        {formatCurrency(p.amount)}
                      </span>
                      <div className="text-[10px] text-resort-stone">
                        {new Date(p.paymentDate).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* FINANCIAL SUMMARY & CONTEXT (1 COL) */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3 border-b border-resort-sand">
              <CardTitle className="text-base font-serif">Settlement Summary</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4 text-xs">
              <div className="space-y-2 pb-3 border-b border-resort-sand/60">
                <div className="flex justify-between text-resort-stone">
                  <span>Grand Total</span>
                  <span className="font-semibold text-resort-charcoal">
                    {formatCurrency(bill.totalAmount)}
                  </span>
                </div>
                <div className="flex justify-between text-emerald-700 font-medium">
                  <span>Total Paid</span>
                  <span>{formatCurrency(totalPaid)}</span>
                </div>
                <div className="flex justify-between text-base font-bold text-resort-charcoal pt-1">
                  <span>Outstanding</span>
                  <span
                    className={cn(
                      outstanding === 0 ? 'text-emerald-700' : 'text-amber-700'
                    )}
                  >
                    {formatCurrency(outstanding)}
                  </span>
                </div>
              </div>

              {isChargedToRoom && (
                <div className="p-3 bg-indigo-50 rounded border border-indigo-200 space-y-1">
                  <div className="font-semibold text-indigo-950 flex items-center gap-1.5">
                    <BedDouble className="w-3.5 h-3.5" /> Charged to Room Folio
                  </div>
                  <p className="text-[11px] text-indigo-900 leading-relaxed">
                    This bill has been posted to the guest folio and will be settled at checkout.
                  </p>
                </div>
              )}

              {isSettled && (
                <div className="p-3 bg-emerald-50 rounded border border-emerald-200 space-y-1">
                  <div className="font-semibold text-emerald-950 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Fully Settled & Closed
                  </div>
                  <p className="text-[11px] text-emerald-900 leading-relaxed">
                    All financial balances are fully reconciled with zero remaining balance.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* MODAL: Record Direct Payment */}
      {activeModal === 'PAY' && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-lg border border-resort-sand w-full max-w-md p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-resort-sand pb-3">
              <h3 className="font-serif font-bold text-base text-resort-charcoal">
                Record Payment — Bill #{bill.billNumber}
              </h3>
              <button
                onClick={() => setActiveModal(null)}
                className="text-resort-stone hover:text-resort-charcoal"
              >
                ?
              </button>
            </div>

            {errorMessage && (
              <div className="p-3 bg-red-50 text-red-800 rounded border border-red-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handlePaySubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-resort-charcoal">Outstanding Balance</label>
                <div className="font-bold text-base text-amber-800">
                  {formatCurrency(outstanding)}
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-resort-charcoal">Payment Amount (INR)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={outstanding}
                  value={payAmount}
                  onChange={(e) => setPayAmount(Number(e.target.value))}
                  required
                  className="w-full px-3 py-2 border border-resort-sand rounded text-xs focus:ring-1 focus:ring-resort-forest focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-resort-charcoal">Payment Tender Method</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full px-3 py-2 border border-resort-sand rounded text-xs focus:ring-1 focus:ring-resort-forest focus:outline-none"
                >
                  <option value="CASH">Cash</option>
                  <option value="UPI">UPI (GooglePay / PhonePe / Paytm)</option>
                  <option value="CARD">Credit / Debit Card</option>
                  <option value="BANK_TRANSFER">Bank Transfer (NEFT / IMPS)</option>
                  <option value="ONLINE">Online Payment Gateway</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-resort-charcoal">
                  Transaction Reference / UTR (Optional)
                </label>
                <input
                  type="text"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  placeholder="e.g., UPI Ref 928374829384"
                  className="w-full px-3 py-2 border border-resort-sand rounded text-xs focus:ring-1 focus:ring-resort-forest focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-resort-sand flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveModal(null)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Recording...' : 'Confirm Payment'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Post to Room Charge */}
      {activeModal === 'ROOM_CHARGE' && bill.order.stay && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-lg border border-resort-sand w-full max-w-md p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-resort-sand pb-3">
              <h3 className="font-serif font-bold text-base text-resort-charcoal">
                Post Charge to Room Folio
              </h3>
              <button
                onClick={() => setActiveModal(null)}
                className="text-resort-stone hover:text-resort-charcoal"
              >
                ?
              </button>
            </div>

            {errorMessage && (
              <div className="p-3 bg-red-50 text-red-800 rounded border border-red-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleRoomChargeSubmit} className="space-y-4 text-xs">
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded space-y-2">
                <div className="flex justify-between">
                  <span className="text-resort-stone">Target Room:</span>
                  <span className="font-bold text-indigo-950">Room {bill.order.stay.roomNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-resort-stone">Guest Name:</span>
                  <span className="font-semibold">{bill.order.stay.guestName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-resort-stone">Stay Number:</span>
                  <span className="font-mono">{bill.order.stay.stayNumber}</span>
                </div>
                <div className="flex justify-between border-t border-indigo-200 pt-1.5 font-bold">
                  <span>Charge Amount:</span>
                  <span className="text-indigo-900">{formatCurrency(bill.totalAmount)}</span>
                </div>
              </div>

              <p className="text-[11px] text-resort-stone">
                Note: This operation posts a ledger debit to the guest's active stay folio with atomic duplicate protection. The guest will settle this charge during checkout.
              </p>

              <div className="pt-3 border-t border-resort-sand flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveModal(null)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting} variant="secondary">
                  {isSubmitting ? 'Posting...' : 'Confirm Room Charge'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Split Bill */}
      {activeModal === 'SPLIT' && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-lg border border-resort-sand w-full max-w-md p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-resort-sand pb-3">
              <h3 className="font-serif font-bold text-base text-resort-charcoal">
                Split Restaurant Bill
              </h3>
              <button
                onClick={() => setActiveModal(null)}
                className="text-resort-stone hover:text-resort-charcoal"
              >
                ?
              </button>
            </div>

            {errorMessage && (
              <div className="p-3 bg-red-50 text-red-800 rounded border border-red-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSplitSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-resort-charcoal">Total Amount to Split</label>
                <div className="font-bold text-base text-resort-forest">
                  {formatCurrency(bill.totalAmount)}
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-resort-charcoal">Number of Equal Portions</label>
                <input
                  type="number"
                  min={2}
                  max={10}
                  value={splitParts}
                  onChange={(e) => setSplitParts(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-resort-sand rounded text-xs focus:ring-1 focus:ring-resort-forest focus:outline-none"
                />
                <p className="text-[11px] text-resort-stone">
                  Each guest will pay approx. {formatCurrency(bill.totalAmount / splitParts)} with zero penny drift.
                </p>
              </div>

              <div className="pt-3 border-t border-resort-sand flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveModal(null)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Splitting...' : 'Split into Child Bills'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
