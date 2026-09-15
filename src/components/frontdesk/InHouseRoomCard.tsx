'use client';

import Link from 'next/link';
import { InHouseRoomCard } from '@/lib/frontdesk/inhouse';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  BedDouble,
  LogOut,
  Receipt,
  Plus,
  User,
  Phone,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';

interface InHouseRoomCardProps {
  room: InHouseRoomCard;
  onPostCharge: () => void;
}

function formatINR(amount: string): string {
  const num = parseFloat(amount);
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatINRFull(amount: string): string {
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

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function InHouseRoomCardComponent({ room, onPostCharge }: InHouseRoomCardProps) {
  const outstanding = parseFloat(room.outstandingBalance);
  const hasBalance = outstanding > 0.01;

  return (
    <div
      className={
        'group relative rounded-xl border bg-white shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col justify-between ' +
        (room.isOverdue
          ? 'border-rose-300'
          : room.isCheckoutToday
            ? 'border-amber-300'
            : hasBalance
              ? 'border-resort-gold/40'
              : 'border-emerald-200/80')
      }
    >
      {/* Top Accent Strip */}
      <div
        className={
          'h-1.5 w-full ' +
          (room.isOverdue
            ? 'bg-rose-500'
            : room.isCheckoutToday
              ? 'bg-amber-500'
              : hasBalance
                ? 'bg-resort-gold'
                : 'bg-resort-forest')
        }
      />

      <div className="p-4 space-y-3.5">
        {/* Header: Room Number, Building, Status Badges */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-resort-forest/10 text-resort-forest">
                <BedDouble className="w-4 h-4" />
              </div>
              <span className="font-serif font-bold text-lg text-resort-charcoal tracking-tight">
                {room.roomNumber}
              </span>
              {room.buildingName && (
                <span className="text-[10px] font-semibold text-stone-600 bg-resort-sand/60 px-2 py-0.5 rounded border border-resort-sand">
                  {room.buildingName}{room.floorName ? ` · ${room.floorName}` : ''}
                </span>
              )}
            </div>
            <p className="text-xs text-resort-muted font-medium mt-1">
              {room.roomTypeName}
            </p>
          </div>

          {/* Status Pills */}
          <div className="flex flex-col items-end gap-1">
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase bg-resort-forest text-white shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              OCCUPIED
            </span>
            {room.isOverdue ? (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase bg-rose-50 text-rose-800 border border-rose-200">
                <AlertTriangle className="w-2.5 h-2.5" /> OVERDUE
              </span>
            ) : room.isCheckoutToday ? (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase bg-amber-50 text-amber-800 border border-amber-200">
                <Clock className="w-2.5 h-2.5" /> DEPARTURE TODAY
              </span>
            ) : hasBalance ? (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase bg-amber-50 text-amber-900 border border-amber-300">
                BALANCE DUE
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase bg-emerald-50 text-emerald-800 border border-emerald-200">
                <CheckCircle2 className="w-2.5 h-2.5" /> SETTLED
              </span>
            )}
          </div>
        </div>

        {/* Guest & Stay Context Block */}
        <div className="p-2.5 rounded-lg bg-resort-ivory/50 border border-resort-sand/60 space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-semibold text-resort-charcoal">
              <User className="w-3.5 h-3.5 text-resort-forest" />
              <span>{room.guestName}</span>
            </div>
            {room.guestCount && (
              <span className="text-[10px] text-resort-muted">
                {room.guestCount} {room.guestCount === 1 ? 'Guest' : 'Guests'}
              </span>
            )}
          </div>

          {room.guestPhone && (
            <div className="flex items-center gap-1.5 text-[11px] text-resort-muted pl-5">
              <Phone className="w-3 h-3 text-stone-400" />
              <span>{room.guestPhone}</span>
            </div>
          )}

          <div className="pt-1 mt-1 border-t border-resort-sand/40 flex items-center justify-between text-[11px] text-stone-600">
            <span className="font-mono text-[10px] text-resort-forest font-semibold">{room.stayNumber}</span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3 text-resort-gold" />
              <span>In: {formatDate(room.actualCheckIn)}</span>
              <span className="text-stone-300">|</span>
              <span>Out: {formatDate(room.expectedCheckOut)}</span>
              {room.nightsElapsed > 0 && (
                <span className="font-semibold text-resort-forest">({room.nightsElapsed}n)</span>
              )}
            </span>
          </div>
        </div>

        {/* Financial Ledger Mini-Panel */}
        <div className="p-3 rounded-lg bg-stone-50/80 border border-stone-200/80 space-y-1.5">
          <div className="flex justify-between items-center text-[11px] text-stone-600">
            <span>Total Accommodation Charges</span>
            <span className="font-mono font-semibold text-stone-900">{formatINRFull(room.roomCharges)}</span>
          </div>
          {parseFloat(room.restaurantCharges) > 0 && (
            <div className="flex justify-between items-center text-[11px] text-stone-600">
              <span>Restaurant & Room Service</span>
              <span className="font-mono font-semibold text-stone-900">{formatINRFull(room.restaurantCharges)}</span>
            </div>
          )}
          <div className="flex justify-between items-center text-[11px] text-stone-600">
            <span>Payments Received</span>
            <span className="font-mono font-semibold text-emerald-700">-{formatINRFull(room.paymentsReceived)}</span>
          </div>
          <div className="pt-1.5 border-t border-stone-200 flex justify-between items-center">
            <span className="text-xs font-bold text-resort-charcoal">Outstanding Balance</span>
            <span
              className={
                'font-mono text-sm font-bold ' +
                (hasBalance ? 'text-rose-600' : 'text-emerald-700')
              }
            >
              {formatINRFull(room.outstandingBalance)}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-1">
          <Link
            href={'/admin/frontdesk/inhouse/' + room.stayId + '/bill'}
            className="flex-1"
          >
            <Button
              size="sm"
              variant="outline"
              className="w-full h-8 text-xs border-resort-sand text-resort-charcoal hover:bg-resort-sand/40"
            >
              <Receipt className="w-3.5 h-3.5 mr-1 text-stone-600" /> View Bill
            </Button>
          </Link>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-8 text-xs border-resort-sand text-resort-charcoal hover:bg-resort-sand/40"
            onClick={onPostCharge}
          >
            <Plus className="w-3.5 h-3.5 mr-1 text-resort-gold" /> Post Charge
          </Button>
          <Link href={'/admin/frontdesk/checkout/' + room.stayId} className="flex-1">
            <Button
              size="sm"
              className={
                'w-full h-8 text-xs font-semibold shadow-2xs ' +
                (hasBalance
                  ? 'bg-resort-gold-dark hover:bg-resort-gold text-white'
                  : 'bg-resort-forest hover:bg-resort-forest-light text-white')
              }
            >
              <LogOut className="w-3.5 h-3.5 mr-1" />
              {hasBalance ? 'Settle & Out' : 'Check-Out'}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
