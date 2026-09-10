'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InHouseRoomCard, InHouseFilter } from '@/lib/frontdesk/inhouse';
import { PostChargeModal } from '@/components/frontdesk/PostChargeModal';
import { GuestDetailsModal } from '@/components/frontdesk/GuestDetailsModal';
import { RecordPaymentModal } from '@/components/frontdesk/RecordPaymentModal';
import { StayNotesModal } from '@/components/frontdesk/StayNotesModal';
import { CheckoutConfirmModal } from '@/components/frontdesk/CheckoutConfirmModal';
import {
  BedDouble,
  Phone,
  Clock,
  LogOut,
  AlertTriangle,
  CheckCircle2,
  Plus,
  User,
  CreditCard,
  MessageSquare,
  Receipt,
  FileText,
} from 'lucide-react';

interface InHouseCardGridProps {
  rooms: InHouseRoomCard[];
  searchQuery: string;
  filter: InHouseFilter;
}

function formatINR(amount: string): string {
  const num = parseFloat(amount);
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
  });
}

function formatDateFull(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function InHouseCardGrid({ rooms, searchQuery, filter }: InHouseCardGridProps) {
  const router = useRouter();
  const [chargeRoom, setChargeRoom] = useState<InHouseRoomCard | null>(null);
  const [guestDetailsRoom, setGuestDetailsRoom] = useState<InHouseRoomCard | null>(null);
  const [paymentRoom, setPaymentRoom] = useState<InHouseRoomCard | null>(null);
  const [notesRoom, setNotesRoom] = useState<InHouseRoomCard | null>(null);
  const [checkoutRoom, setCheckoutRoom] = useState<InHouseRoomCard | null>(null);

  if (rooms.length === 0) {
    return (
      <div className="text-center py-12 text-resort-muted">
        <BedDouble className="w-12 h-12 mx-auto mb-3 opacity-40" />
        <p className="font-serif text-lg">No rooms found</p>
        <p className="text-sm mt-1">
          {searchQuery
            ? `No results for "${searchQuery}"`
            : 'No rooms match the current filter'}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {rooms.map((room) => {
          const outstanding = parseFloat(room.outstandingBalance);
          const hasBalance = outstanding > 0.01;

          return (
            <Card
              key={room.stayId}
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
                {/* Room Header */}
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

                {/* Room Type */}
                <div className="text-xs text-resort-muted">{room.roomTypeName}</div>

                {/* Guest Info */}
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

                {/* Stay Details */}
                <div className="border-t border-resort-sand pt-2 space-y-1 text-[11px]">
                  <div className="flex items-center gap-1.5 text-resort-muted">
                    <span className="font-semibold text-resort-charcoal-text">{room.stayNumber}</span>
                    {room.reservationNumber && (
                      <span className="text-resort-muted">({room.reservationNumber})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-resort-muted">
                    <Clock className="w-3 h-3" />
                    <span>
                      Check-in: {formatDate(room.actualCheckIn)} | Expected: {formatDate(room.expectedCheckOut)}
                      {room.nightsElapsed > 0 && (
                        <span className="text-resort-olive ml-1">({room.nightsElapsed} night{room.nightsElapsed !== 1 ? 's' : ''})</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Financial Summary */}
                <div className="border-t border-resort-sand pt-2 space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-resort-muted">Total Bill</span>
                    <span className="font-mono font-semibold text-resort-charcoal-text">{formatINR(room.totalFolioCharges)}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-resort-muted">Total Paid</span>
                    <span className="font-mono font-semibold text-emerald-700">{formatINR(room.paymentsReceived)}</span>
                  </div>
                  <div className="flex justify-between text-xs pt-1 border-t border-resort-sand">
                    <span className="font-bold text-resort-charcoal">Balance Due</span>
                    <span
                      className={
                        'font-mono font-bold ' +
                        (hasBalance ? 'text-rose-600' : 'text-emerald-600')
                      }
                    >
                      {formatINR(room.outstandingBalance)}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-3 gap-1.5 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px] border-resort-sand text-resort-charcoal-text hover:bg-resort-sand-light"
                    onClick={() => setGuestDetailsRoom(room)}
                  >
                    <User className="w-3 h-3 mr-0.5" /> Guest
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px] border-resort-sand text-resort-charcoal-text hover:bg-resort-sand-light"
                    onClick={() => setChargeRoom(room)}
                  >
                    <Plus className="w-3 h-3 mr-0.5" /> Charge
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px] border-resort-sand text-resort-charcoal-text hover:bg-resort-sand-light"
                    onClick={() => setPaymentRoom(room)}
                  >
                    <CreditCard className="w-3 h-3 mr-0.5" /> Payment
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px] border-resort-sand text-resort-charcoal-text hover:bg-resort-sand-light"
                    onClick={() => setNotesRoom(room)}
                  >
                    <MessageSquare className="w-3 h-3 mr-0.5" /> Notes
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px] border-resort-sand text-resort-charcoal-text hover:bg-resort-sand-light"
                    onClick={() => router.push('/admin/frontdesk/inhouse/' + room.stayId + '/bill')}
                  >
                    <Receipt className="w-3 h-3 mr-0.5" /> Invoice
                  </Button>
                  <Button
                    size="sm"
                    className={
                      'h-7 text-[10px] ' +
                      (hasBalance
                        ? 'bg-amber-600 hover:bg-amber-700 text-white'
                        : 'bg-resort-forest hover:bg-resort-forest-light text-white')
                    }
                    onClick={() => setCheckoutRoom(room)}
                  >
                    <LogOut className="w-3 h-3 mr-0.5" />
                    {hasBalance ? 'Settle & Out' : 'Check-Out'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Modals */}
      {chargeRoom && (
        <PostChargeModal
          stayId={chargeRoom.stayId}
          stayNumber={chargeRoom.stayNumber}
          roomNumber={chargeRoom.roomNumber}
          guestName={chargeRoom.guestName}
          onClose={() => setChargeRoom(null)}
        />
      )}

      {guestDetailsRoom && (
        <GuestDetailsModal
          stayId={guestDetailsRoom.stayId}
          guestName={guestDetailsRoom.guestName}
          roomNumber={guestDetailsRoom.roomNumber}
          onClose={() => setGuestDetailsRoom(null)}
        />
      )}

      {paymentRoom && (
        <RecordPaymentModal
          stayId={paymentRoom.stayId}
          stayNumber={paymentRoom.stayNumber}
          roomNumber={paymentRoom.roomNumber}
          guestName={paymentRoom.guestName}
          outstandingBalance={paymentRoom.outstandingBalance}
          onClose={() => setPaymentRoom(null)}
        />
      )}

      {notesRoom && (
        <StayNotesModal
          stayId={notesRoom.stayId}
          stayNumber={notesRoom.stayNumber}
          roomNumber={notesRoom.roomNumber}
          guestName={notesRoom.guestName}
          onClose={() => setNotesRoom(null)}
        />
      )}

      {checkoutRoom && (
        <CheckoutConfirmModal
          stayId={checkoutRoom.stayId}
          stayNumber={checkoutRoom.stayNumber}
          roomNumber={checkoutRoom.roomNumber}
          guestName={checkoutRoom.guestName}
          outstandingBalance={checkoutRoom.outstandingBalance}
          totalCharges={checkoutRoom.totalFolioCharges}
          totalPaid={checkoutRoom.paymentsReceived}
          onClose={() => setCheckoutRoom(null)}
        />
      )}
    </>
  );
}
