'use client';

import React from 'react';
import { formatCurrency } from '@/lib/utils';
import { Info, Loader2, AlertCircle } from 'lucide-react';

export interface PaymentSummaryBreakdownProps {
  roomName: string;
  nights: number;
  roomsCount: number;
  basePricePerNight: number;
  paymentMethod: 'PAY_ONLINE' | 'PAY_AT_HOTEL';
  subtotal: number | null;
  taxAmount: number | null;
  taxRatePercent: number | null;
  totalAmount: number | null;
  requiredAdvanceAmount: number | null;
  balanceAtHotel: number | null;
  isLoading?: boolean;
  pricingError?: string | null;
}

export function PaymentSummaryBreakdown({
  roomName,
  nights,
  roomsCount,
  basePricePerNight,
  paymentMethod,
  subtotal,
  taxAmount,
  taxRatePercent,
  totalAmount,
  requiredAdvanceAmount,
  balanceAtHotel,
  isLoading = false,
  pricingError = null,
}: PaymentSummaryBreakdownProps) {
  const effectiveNights = Math.max(1, nights || 1);
  const effectiveRooms = Math.max(1, roomsCount || 1);

  // In online payment mode, advance deposit is required (from server authority)
  const advancePayableNow =
    paymentMethod === 'PAY_ONLINE'
      ? requiredAdvanceAmount ?? totalAmount ?? 0
      : 0;

  const payableAmountDisplay =
    paymentMethod === 'PAY_ONLINE'
      ? advancePayableNow
      : totalAmount ?? 0;

  return (
    <div className="p-4 rounded-2xl bg-resort-sand/20 border border-resort-sand/80 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-resort-sand/60">
        <div>
          <span className="text-xs font-semibold text-resort-charcoal-text block">
            {roomName || 'Selected Accommodation'}
          </span>
          <span className="text-[11px] text-resort-muted">
            {effectiveRooms} {effectiveRooms > 1 ? 'rooms' : 'room'} • {effectiveNights}{' '}
            {effectiveNights > 1 ? 'nights' : 'night'}
          </span>
        </div>
        {isLoading ? (
          <span className="flex items-center gap-1.5 text-xs text-resort-muted">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-resort-gold" />
            Calculating...
          </span>
        ) : subtotal !== null ? (
          <span className="text-xs font-semibold text-resort-charcoal-text">
            {formatCurrency(subtotal)}
          </span>
        ) : null}
      </div>

      {pricingError ? (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-600" />
          <span>{pricingError}</span>
        </div>
      ) : (
        <div className="space-y-1.5 text-xs text-resort-muted">
          {/* Room Charges */}
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1">
              Room Charges
              <span className="text-[10px] text-resort-muted/80">
                ({formatCurrency(basePricePerNight)}/night)
              </span>
            </span>
            {isLoading ? (
              <span className="h-4 w-16 bg-resort-sand/40 animate-pulse rounded" />
            ) : (
              <span className="text-resort-charcoal-text">
                {subtotal !== null ? formatCurrency(subtotal) : '—'}
              </span>
            )}
          </div>

          {/* Taxes & Fees - Dynamic from Server Authority */}
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1">
              Taxes & Fees {taxRatePercent !== null ? `(GST ${taxRatePercent}%)` : '(GST)'}
              <Info className="w-3 h-3 text-resort-muted" />
            </span>
            {isLoading ? (
              <span className="h-4 w-12 bg-resort-sand/40 animate-pulse rounded" />
            ) : (
              <span className="text-resort-charcoal-text">
                {taxAmount !== null ? formatCurrency(taxAmount) : '—'}
              </span>
            )}
          </div>

          {/* Total Stay Amount */}
          <div className="flex items-center justify-between pt-1 font-medium text-resort-charcoal-text border-t border-resort-sand/40">
            <span>Total Stay Amount</span>
            {isLoading ? (
              <span className="h-4 w-20 bg-resort-sand/40 animate-pulse rounded" />
            ) : (
              <span className="text-sm font-semibold text-resort-charcoal-text">
                {totalAmount !== null ? formatCurrency(totalAmount) : '—'}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Due Now vs At Hotel Callout */}
      <div className="pt-2.5 border-t border-resort-sand/60 flex items-center justify-between">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-resort-forest block">
            {paymentMethod === 'PAY_ONLINE' ? 'Payable Now' : 'Payable at Front Desk'}
          </span>
          <span className="text-[10px] text-resort-muted">
            {paymentMethod === 'PAY_ONLINE'
              ? balanceAtHotel === 0 || balanceAtHotel === null
                ? 'Full stay settled online'
                : `Balance ₹${balanceAtHotel} due on arrival`
              : 'Zero advance payment required today'}
          </span>
        </div>
        {isLoading ? (
          <span className="h-6 w-24 bg-resort-sand/40 animate-pulse rounded" />
        ) : (
          <span className="text-base font-display font-bold text-resort-forest">
            {totalAmount !== null ? formatCurrency(payableAmountDisplay) : '—'}
          </span>
        )}
      </div>
    </div>
  );
}
