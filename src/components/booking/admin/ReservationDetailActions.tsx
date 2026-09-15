'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { LogIn, Ban } from 'lucide-react';
import { CancelReservationModal } from './CancelReservationModal';

interface ReservationDetailActionsProps {
  reservationId: string;
  reservationNumber: string;
  guestName: string;
  isCancellable: boolean;
  isCheckInEligible: boolean;
  hasAdvancePayment: boolean;
}

export function ReservationDetailActions({
  reservationId,
  reservationNumber,
  guestName,
  isCancellable,
  isCheckInEligible,
  hasAdvancePayment,
}: ReservationDetailActionsProps) {
  const [showCancelModal, setShowCancelModal] = useState(false);

  return (
    <div className="flex items-center gap-2">
      {isCheckInEligible && (
        <Link href={`/admin/frontdesk/checkin/${reservationId}`}>
          <Button
            size="sm"
            className="bg-resort-gold hover:bg-resort-gold-dark text-white text-xs font-semibold shadow-xs"
          >
            <LogIn className="w-3.5 h-3.5 mr-1.5" /> Check In Guest
          </Button>
        </Link>
      )}

      {isCancellable && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowCancelModal(true)}
          className="border-rose-200 text-rose-700 hover:bg-rose-50 text-xs"
        >
          <Ban className="w-3.5 h-3.5 mr-1.5" /> Cancel Reservation
        </Button>
      )}

      {showCancelModal && (
        <CancelReservationModal
          reservationId={reservationId}
          reservationNumber={reservationNumber}
          guestName={guestName}
          hasAdvancePayment={hasAdvancePayment}
          isOpen={true}
          onClose={() => setShowCancelModal(false)}
        />
      )}
    </div>
  );
}
