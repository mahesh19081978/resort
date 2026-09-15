'use client';

import React, { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { cancelReservationAction } from '@/actions/booking/admin';
import { AlertCircle, Loader2, X, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface CancelReservationModalProps {
  reservationId: string;
  reservationNumber: string;
  guestName: string;
  hasAdvancePayment: boolean;
  isOpen: boolean;
  onClose: () => void;
}

export function CancelReservationModal({
  reservationId,
  reservationNumber,
  guestName,
  hasAdvancePayment,
  isOpen,
  onClose,
}: CancelReservationModalProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 3) {
      setError('Please provide a cancellation reason (minimum 3 characters).');
      return;
    }

    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.append('reservationId', reservationId);
      formData.append('reason', reason.trim());

      const res = await cancelReservationAction(null, formData);
      if (!res.success) {
        setError(res.error || 'Failed to cancel reservation.');
      } else {
        onClose();
        router.refresh();
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl border border-neutral-200 overflow-hidden">
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 bg-neutral-50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center text-rose-700">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-neutral-900">Cancel Reservation</h2>
              <p className="text-xs text-neutral-500 font-mono">{reservationNumber}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="text-neutral-400 hover:text-neutral-600 p-1 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2.5 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <div className="text-xs text-neutral-600 space-y-2">
            <p>
              Are you sure you want to cancel the reservation for{' '}
              <strong className="text-neutral-900">{guestName}</strong>?
            </p>
            {hasAdvancePayment && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs">
                <strong>Financial Note:</strong> An advance payment exists for this reservation.
                Cancelling will automatically record a queued refund in status{' '}
                <span className="font-semibold">PENDING</span> according to resort policy.
              </div>
            )}
          </div>

          <div>
            <label htmlFor="cancellationReason" className="block text-xs font-semibold text-neutral-700 mb-1">
              Cancellation Reason <span className="text-rose-600">*</span>
            </label>
            <textarea
              id="cancellationReason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Guest requested cancellation due to travel delay..."
              disabled={isPending}
              className="w-full text-xs p-3 rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-resort-forest focus:border-transparent transition-all"
              required
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isPending}
              className="text-xs"
            >
              Keep Reservation
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isPending}
              className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium min-w-[130px]"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Cancelling...
                </>
              ) : (
                'Confirm Cancellation'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
