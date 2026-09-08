'use client';

import React from 'react';
import { formatCurrency } from '@/lib/utils';
import { Info } from 'lucide-react';

interface PaymentSummaryBreakdownProps {
  roomName: string;
  nights: number;
  roomsCount: number;
  basePricePerNight: number;
  paymentMethod: 'PAY_ONLINE' | 'PAY_AT_HOTEL';
}

export function PaymentSummaryBreakdown({
  roomName,
  nights,
  roomsCount,
  basePricePerNight,
  paymentMethod,
}: PaymentSummaryBreakdownProps) {
  const effectiveNights = Math.max(1, nights || 1);
  const effectiveRooms = Math.max(1, roomsCount || 1);
  const roomCharges = effectiveNights * effectiveRooms * (basePricePerNight || 0);
  
  // Informational taxes (18% GST standard in luxury hospitality)
  const estimatedTax = Math.round(roomCharges * 0.18);
  const totalStayAmount = roomCharges + estimatedTax;

  // In online payment mode, advance deposit is required (100% or configured percentage; default full hold)
  const advancePayableNow = paymentMethod === 'PAY_ONLINE' ? totalStayAmount : 0;
  const balanceAtHotel = totalStayAmount - advancePayableNow;

  return (
    <div className="p-4 rounded-2xl bg-resort-sand/20 border border-resort-sand/80 space-y-3">
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
        <span className="text-xs font-semibold text-resort-charcoal-text">
          {formatCurrency(roomCharges)}
        </span>
      </div>

      <div className="space-y-1.5 text-xs text-resort-muted">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1">
            Room Charges
            <span className="text-[10px] text-resort-muted/80">
              ({formatCurrency(basePricePerNight)}/night)
            </span>
          </span>
          <span className="text-resort-charcoal-text">{formatCurrency(roomCharges)}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1">
            Taxes & Fees (GST 18%)
            <Info className="w-3 h-3 text-resort-muted" />
          </span>
          <span className="text-resort-charcoal-text">{formatCurrency(estimatedTax)}</span>
        </div>

        <div className="flex items-center justify-between pt-1 font-medium text-resort-charcoal-text border-t border-resort-sand/40">
          <span>Total Stay Amount</span>
          <span className="text-sm font-semibold text-resort-charcoal-text">
            {formatCurrency(totalStayAmount)}
          </span>
        </div>
      </div>

      {/* Due Now vs At Hotel Callout */}
      <div className="pt-2.5 border-t border-resort-sand/60 flex items-center justify-between">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-resort-forest block">
            {paymentMethod === 'PAY_ONLINE' ? 'Payable Now' : 'Payable at Front Desk'}
          </span>
          <span className="text-[10px] text-resort-muted">
            {paymentMethod === 'PAY_ONLINE'
              ? balanceAtHotel === 0
                ? 'Full stay settled online'
                : `Balance ₹${balanceAtHotel} due on arrival`
              : 'Zero advance payment required today'}
          </span>
        </div>
        <span className="text-base font-display font-bold text-resort-forest">
          {formatCurrency(paymentMethod === 'PAY_ONLINE' ? advancePayableNow : totalStayAmount)}
        </span>
      </div>
    </div>
  );
}
