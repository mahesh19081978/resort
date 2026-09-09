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
    <Card
      className={
        'relative overflow-hidden transition-shadow hover:shadow-luxury ' +
        (room.isOverdue
          ? 'border-l-4 border-l-red-500'
          : room.isCheckoutToday
            ? 'border-l-4 border-l-amber-500'
            : hasBalance
              ? 'border-l-4 border-l-rose-400'
              : 'border-l-4 border-l-emerald-500')
      }
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <BedDouble className="w-4 h-4 text-resort-forest" />
            <span className="font-mono font-bold text-base text-resort-charcoal">
              {room.roomNumber}
            </span>
            {room.buildingName && (
              <span className="text-[10px] text-resort-muted bg-resort-sand-light px-1.5 py-0.5 rounded">
                {room.buildingName}
                {room.floorName ? ` / ${room.floorName}` : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {room.isOverdue ? (
              <Badge variant="danger" className="text-[10px] px-1.5 py-0">
                <AlertTriangle className="w-2.5 h-2.5 mr-0.5" /> OVERDUE
              </Badge>
            ) : room.isCheckoutToday ? (
              <Badge variant="warning" className="text-[10px] px-1.5 py-0">
                <Clock className="w-2.5 h-2.5 mr-0.5" /> DEPARTURE TODAY
              </Badge>
            ) : hasBalance ? (
              <Badge variant="danger" className="text-[10px] px-1.5 py-0">
                BALANCE DUE
              </Badge>
            ) : (
              <Badge variant="success" className="text-[10px] px-1.5 py-0">
                <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" /> PAID
              </Badge>
            )}
            <Badge variant="default" className="text-[10px] px-1.5 py-0">
              OCCUPIED
            </Badge>
          </div>
        </div>

        <div className="text-xs text-resort-muted">{room.roomTypeName}</div>

        <div className="border-t border-resort-sand pt-2 space-y-1">
          <div className="flex items-center gap-1.5 text-xs">
            <User className="w-3 h-3 text-resort-olive" />
            <span className="font-medium text-resort-charcoal">{room.guestName}</span>
          </div>
          {room.guestPhone && (
            <div className="flex items-center gap-1.5 text-[11px] text-resort-muted">
              <Phone className="w-3 h-3" />
              {room.guestPhone}
              <span className="text-resort-sand mx-0.5">|</span>
              <span>{room.guestCount} guest{room.guestCount !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>

        <div className="border-t border-resort-sand pt-2 space-y-1 text-[11px]">
          <div className="flex items-center gap-1.5 text-resort-muted">
            <span className="font-semibold text-resort-charcoal-text">{room.stayNumber}</span>
            {room.reservationNumber && (
              <span className="text-resort-muted">({room.reservationNumber})</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-resort-muted">
            <Calendar className="w-3 h-3" />
            <span>Check-in: {formatDateTime(room.actualCheckIn)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-resort-muted">
            <Clock className="w-3 h-3" />
            <span>
              Expected: {formatDate(room.expectedCheckOut)}
              {room.nightsElapsed > 0 && (
                <span className="text-resort-olive ml-1">({room.nightsElapsed} night{room.nightsElapsed !== 1 ? 's' : ''})</span>
              )}
            </span>
          </div>
        </div>

        <div className="border-t border-resort-sand pt-2 space-y-1">
          {parseFloat(room.roomBaseCharges) > 0 && (
            <div className="flex justify-between text-[11px]">
              <span className="text-resort-muted">Base Room Charges</span>
              <span className="font-mono font-medium text-resort-charcoal-text">{formatINRFull(room.roomBaseCharges)}</span>
            </div>
          )}
          {parseFloat(room.roomTax) > 0 && (
            <div className="flex justify-between text-[11px]">
              <span className="text-resort-muted">GST</span>
              <span className="font-mono text-resort-muted">{formatINRFull(room.roomTax)}</span>
            </div>
          )}
          {parseFloat(room.roomCharges) > 0 && (
            <div className="flex justify-between text-[11px] pt-0.5">
              <span className="font-semibold text-resort-charcoal-text">Accommodation Total</span>
              <span className="font-mono font-semibold text-resort-charcoal-text">{formatINRFull(room.roomCharges)}</span>
            </div>
          )}
          {parseFloat(room.additionalCharges) > 0 && (
            <div className="flex justify-between text-[11px]">
              <span className="text-resort-muted">Additional</span>
              <span className="font-mono font-medium text-resort-charcoal-text">{formatINRFull(room.additionalCharges)}</span>
            </div>
          )}
          {parseFloat(room.restaurantCharges) > 0 && (
            <div className="flex justify-between text-[11px]">
              <span className="text-resort-muted">Restaurant</span>
              <span className="font-mono font-medium text-resort-charcoal-text">{formatINRFull(room.restaurantCharges)}</span>
            </div>
          )}
          {parseFloat(room.taxCharges) > 0 && (
            <div className="flex justify-between text-[11px]">
              <span className="text-resort-muted">Other Tax</span>
              <span className="font-mono text-resort-muted">{formatINRFull(room.taxCharges)}</span>
            </div>
          )}
          <div className="flex justify-between text-[11px] pt-1 border-t border-resort-sand">
            <span className="font-semibold text-resort-charcoal-text">Payments</span>
            <span className="font-mono font-semibold text-emerald-700">-{formatINRFull(room.paymentsReceived)}</span>
          </div>
          <div className="flex justify-between text-xs pt-1 border-t border-resort-sand">
            <span className="font-bold text-resort-charcoal">Outstanding</span>
            <span
              className={
                'font-mono font-bold ' +
                (hasBalance ? 'text-rose-600' : 'text-emerald-600')
              }
            >
              {formatINRFull(room.outstandingBalance)}
            </span>
          </div>
        </div>

        <div className="flex gap-1.5 pt-1">
          <Link
            href={'/admin/frontdesk/inhouse/' + room.stayId + '/bill'}
            className="flex-1"
          >
            <Button
              size="sm"
              variant="outline"
              className="w-full h-7 text-[10px] border-resort-sand text-resort-charcoal-text hover:bg-resort-sand-light"
            >
              <Receipt className="w-3 h-3 mr-1" /> View Bill
            </Button>
          </Link>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-7 text-[10px] border-resort-sand text-resort-charcoal-text hover:bg-resort-sand-light"
            onClick={onPostCharge}
          >
            <Plus className="w-3 h-3 mr-1" /> Post Charges
          </Button>
          <Link href={'/admin/frontdesk/checkout/' + room.stayId} className="flex-1">
            <Button
              size="sm"
              className={
                'w-full h-7 text-[10px] ' +
                (hasBalance
                  ? 'bg-amber-600 hover:bg-amber-700 text-white'
                  : 'bg-resort-forest hover:bg-resort-forest-light text-white')
              }
            >
              <LogOut className="w-3 h-3 mr-1" />
              {hasBalance ? 'Settle & Checkout' : 'Checkout'}
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
