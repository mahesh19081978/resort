'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InHouseRoomCard, InHouseFilter } from '@/lib/frontdesk/inhouse';
import { PostChargeModal } from '@/components/frontdesk/PostChargeModal';
import { GuestDetailsModal } from '@/components/frontdesk/GuestDetailsModal';
import { RecordPaymentModal } from '@/components/frontdesk/RecordPaymentModal';
import { StayNotesModal } from '@/components/frontdesk/StayNotesModal';
import { CheckoutConfirmModal } from '@/components/frontdesk/CheckoutConfirmModal';
import { ExtendStayModal } from '@/components/frontdesk/ExtendStayModal';
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
  Calendar,
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
  const [extendStayRoom, setExtendStayRoom] = useState<InHouseRoomCard | null>(null);

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
            <div
              key={room.stayId}
              className={cn(
                'group relative rounded-xl border bg-white shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col justify-between',
                room.isOverdue
                  ? 'border-rose-300'
                  : room.isCheckoutToday
                    ? 'border-amber-300'
                    : hasBalance
                      ? 'border-resort-gold/40'
                      : 'border-emerald-200/80'
              )}
            >
              {/* Top Accent Strip */}
              <div
                className={cn(
                  'h-1.5 w-full',
                  room.isOverdue
                    ? 'bg-rose-500'
                    : room.isCheckoutToday
                      ? 'bg-amber-500'
                      : hasBalance
                        ? 'bg-resort-gold'
                        : 'bg-resort-forest'
                )}
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
                    <span>Total Billed Charges</span>
                    <span className="font-mono font-semibold text-stone-900">{formatINR(room.totalFolioCharges)}</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] text-stone-600">
                    <span>Total Payments Received</span>
                    <span className="font-mono font-semibold text-emerald-700">-{formatINR(room.paymentsReceived)}</span>
                  </div>
                  <div className="pt-1.5 border-t border-stone-200 flex justify-between items-center">
                    <span className="text-xs font-bold text-resort-charcoal">Balance Due</span>
                    <span
                      className={cn(
                        'font-mono text-sm font-bold',
                        hasBalance ? 'text-rose-600' : 'text-emerald-700'
                      )}
                    >
                      {formatINR(room.outstandingBalance)}
                    </span>
                  </div>
                </div>

                {/* Operational Quick Actions (Structured Grid) */}
                <div className="space-y-1.5 pt-1">
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setGuestDetailsRoom(room)}
                      className="inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[11px] font-medium border border-resort-sand bg-white text-resort-charcoal hover:bg-resort-sand/40 transition-colors"
                    >
                      <User className="w-3 h-3 text-resort-forest" />
                      <span>Guest</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setChargeRoom(room)}
                      className="inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[11px] font-medium border border-resort-sand bg-white text-resort-charcoal hover:bg-resort-sand/40 transition-colors"
                    >
                      <Plus className="w-3 h-3 text-resort-gold" />
                      <span>Charge</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentRoom(room)}
                      className="inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[11px] font-medium border border-resort-sand bg-white text-resort-charcoal hover:bg-resort-sand/40 transition-colors"
                    >
                      <CreditCard className="w-3 h-3 text-emerald-600" />
                      <span>Payment</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setNotesRoom(room)}
                      className="inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[11px] font-medium border border-resort-sand bg-white text-resort-charcoal hover:bg-resort-sand/40 transition-colors"
                    >
                      <MessageSquare className="w-3 h-3 text-stone-500" />
                      <span>Notes</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setExtendStayRoom(room)}
                      className="inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[11px] font-medium border border-resort-sand bg-white text-resort-charcoal hover:bg-resort-sand/40 transition-colors"
                    >
                      <Calendar className="w-3 h-3 text-resort-forest" />
                      <span>Extend</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => router.push('/admin/frontdesk/inhouse/' + room.stayId + '/bill')}
                      className="inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[11px] font-medium border border-resort-sand bg-white text-resort-charcoal hover:bg-resort-sand/40 transition-colors"
                    >
                      <Receipt className="w-3 h-3 text-stone-600" />
                      <span>Invoice</span>
                    </button>
                  </div>

                  {/* Primary Checkout Action */}
                  <button
                    type="button"
                    onClick={() => setCheckoutRoom(room)}
                    className={cn(
                      'w-full mt-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-semibold shadow-2xs transition-all duration-150',
                      hasBalance
                        ? 'bg-resort-gold-dark hover:bg-resort-gold text-white'
                        : 'bg-resort-forest hover:bg-resort-forest-light text-white'
                    )}
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>{hasBalance ? 'Settle Balance & Check-Out' : 'Express Check-Out'}</span>
                  </button>
                </div>
              </div>
            </div>
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

      {extendStayRoom && (
        <ExtendStayModal
          stayId={extendStayRoom.stayId}
          stayNumber={extendStayRoom.stayNumber}
          currentRoomNumber={extendStayRoom.roomNumber}
          currentRoomTypeName={extendStayRoom.roomTypeName}
          currentExpectedCheckout={extendStayRoom.expectedCheckOut}
          guestName={extendStayRoom.guestName}
          isOpen={true}
          onClose={() => setExtendStayRoom(null)}
          onSuccess={() => {
            setExtendStayRoom(null);
            router.refresh();
          }}
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
