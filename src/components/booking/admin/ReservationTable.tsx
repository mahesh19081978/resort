'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { SerializedAdminReservations } from '@/lib/booking/admin-reservation-service';
import { ReservationStatusBadge } from './ReservationStatusBadge';
import { PaymentStatusBadge } from './PaymentStatusBadge';
import { CancelReservationModal } from './CancelReservationModal';
import { Button } from '@/components/ui/button';
import {
  Eye,
  LogIn,
  Ban,
  Calendar,
  User,
  Phone,
  BedDouble,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  FileQuestion,
  Home,
} from 'lucide-react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

interface ReservationTableProps {
  data: SerializedAdminReservations;
  canCancel: boolean;
  canCheckIn: boolean;
}

export function ReservationTable({ data, canCancel, canCheckIn }: ReservationTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [selectedForCancel, setSelectedForCancel] = useState<{
    id: string;
    number: string;
    guestName: string;
    hasAdvancePayment: boolean;
  } | null>(null);

  const { reservations, pagination } = data;

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(newPage));
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleLimitChange = (newLimit: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('limit', newLimit);
    params.set('page', '1');
    router.push(`${pathname}?${params.toString()}`);
  };

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  };

  const formatCurrency = (amount: number | string) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(Number(amount));
  };

  if (reservations.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-neutral-200/80 p-12 text-center shadow-sm">
        <div className="w-14 h-14 mx-auto rounded-full bg-neutral-100 flex items-center justify-center text-neutral-400 mb-4">
          <FileQuestion className="w-7 h-7" />
        </div>
        <h3 className="text-base font-semibold text-neutral-800">No reservations found</h3>
        <p className="text-xs text-neutral-500 max-w-md mx-auto mt-1 leading-relaxed">
          No bookings match your current search or filter criteria. Try adjusting the filters or create a new reservation.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link href="/admin/bookings">
            <Button variant="outline" size="sm" className="text-xs">
              Reset Filters
            </Button>
          </Link>
          <Link href="/admin/bookings/new">
            <Button size="sm" className="bg-resort-forest hover:bg-resort-forest-deep text-white text-xs">
              + New Reservation
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Desktop & Tablet Table */}
      <div className="hidden md:block bg-white rounded-xl border border-neutral-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50/80 text-neutral-600 uppercase font-semibold text-[10px] tracking-wider border-b border-neutral-200/80">
              <tr>
                <th className="py-3 px-4">Reservation #</th>
                <th className="py-3 px-4">Guest</th>
                <th className="py-3 px-4">Stay Dates</th>
                <th className="py-3 px-4">Room Type</th>
                <th className="py-3 px-4 text-center">Rooms / Pax</th>
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-4">Payment</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Stay / Physical</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-neutral-700">
              {reservations.map((res) => {
                const isCancellable =
                  canCancel &&
                  (res.status === 'PENDING' || res.status === 'CONFIRMED') &&
                  !res.stayInfo?.hasActiveStay;

                const isCheckInEligible =
                  canCheckIn &&
                  res.status === 'CONFIRMED' &&
                  !res.stayInfo?.hasActiveStay;

                const mainRoom = res.rooms[0]?.roomType?.name || 'Standard Room';
                const totalRoomsCount = res.rooms.reduce((acc, r) => acc + r.roomsCount, 0);

                return (
                  <tr key={res.id} className="hover:bg-neutral-50/70 transition-colors">
                    {/* Reservation # */}
                    <td className="py-3 px-4">
                      <Link
                        href={`/admin/bookings/${res.id}`}
                        className="font-mono font-semibold text-resort-forest hover:text-resort-gold hover:underline"
                      >
                        {res.reservationNumber}
                      </Link>
                      <div className="text-[10px] text-neutral-400 mt-0.5">
                        {new Date(res.createdAt).toLocaleDateString('en-GB')}
                      </div>
                    </td>

                    {/* Guest */}
                    <td className="py-3 px-4">
                      <div className="font-medium text-neutral-900 flex items-center gap-1.5">
                        <span>
                          {res.primaryGuest.firstName} {res.primaryGuest.lastName}
                        </span>
                        {res.primaryGuest.vip && (
                          <span className="px-1 py-0.2 bg-amber-100 text-amber-800 rounded text-[9px] font-bold">
                            VIP
                          </span>
                        )}
                        {res.primaryGuest.blacklisted && (
                          <span className="px-1 py-0.2 bg-rose-100 text-rose-800 rounded text-[9px] font-bold">
                            BLOCKED
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-neutral-500 font-mono">
                        {res.primaryGuest.phone}
                      </div>
                    </td>

                    {/* Stay Dates */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-medium text-neutral-800">
                        {formatDate(res.checkInDate)} → {formatDate(res.checkOutDate)}
                      </div>
                      <div className="text-[10px] text-neutral-500">
                        {Math.round(
                          (new Date(res.checkOutDate).getTime() - new Date(res.checkInDate).getTime()) /
                            (1000 * 60 * 60 * 24)
                        )}{' '}
                        night(s)
                      </div>
                    </td>

                    {/* Room Type */}
                    <td className="py-3 px-4">
                      <div className="font-medium text-neutral-800">{mainRoom}</div>
                      {res.rooms.length > 1 && (
                        <div className="text-[10px] text-neutral-500">
                          +{res.rooms.length - 1} more type
                        </div>
                      )}
                    </td>

                    {/* Rooms / Pax */}
                    <td className="py-3 px-4 text-center">
                      <span className="font-medium text-neutral-800">{totalRoomsCount} room(s)</span>
                      <div className="text-[10px] text-neutral-500">
                        {res.adults}A {res.children > 0 ? `${res.children}C` : ''}
                      </div>
                    </td>

                    {/* Amount */}
                    <td className="py-3 px-4 text-right">
                      <div className="font-semibold text-neutral-900 font-mono">
                        {formatCurrency(res.totalAmount)}
                      </div>
                      {res.financials.hasBalanceDue && (
                        <div className="text-[10px] text-amber-700 font-mono">
                          Due: {formatCurrency(res.financials.balanceDue)}
                        </div>
                      )}
                    </td>

                    {/* Payment Status */}
                    <td className="py-3 px-4">
                      <PaymentStatusBadge status={res.financials.derivedStatus} />
                    </td>

                    {/* Reservation Status */}
                    <td className="py-3 px-4">
                      <ReservationStatusBadge status={res.status} />
                    </td>

                    {/* Stay / Physical Room */}
                    <td className="py-3 px-4">
                      {res.stayInfo?.hasActiveStay ? (
                        <div>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 text-[10px] font-semibold">
                            <Home className="w-3 h-3" />
                            {res.stayInfo.assignedRooms.join(', ') || 'In-House'}
                          </span>
                          <div className="text-[9px] text-neutral-400 font-mono mt-0.5">
                            {res.stayInfo.stayNumber}
                          </div>
                        </div>
                      ) : (
                        <span className="text-neutral-400 text-[11px] italic">Not checked in</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link href={`/admin/bookings/${res.id}`}>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs px-2 text-neutral-700 hover:text-neutral-900 border-neutral-200"
                            title="View Reservation Details"
                          >
                            <Eye className="w-3.5 h-3.5 mr-1" /> View
                          </Button>
                        </Link>

                        {isCheckInEligible && (
                          <Link href={`/admin/frontdesk/checkin/${res.id}`}>
                            <Button
                              size="sm"
                              className="h-7 text-xs px-2.5 bg-resort-gold hover:bg-resort-gold-dark text-white font-medium shadow-xs"
                              title="Proceed to Front Desk Check-in"
                            >
                              <LogIn className="w-3.5 h-3.5 mr-1" /> Check In
                            </Button>
                          </Link>
                        )}

                        {isCancellable && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setSelectedForCancel({
                                id: res.id,
                                number: res.reservationNumber,
                                guestName: `${res.primaryGuest.firstName} ${res.primaryGuest.lastName}`,
                                hasAdvancePayment: res.financials.hasAdvancePayment,
                              })
                            }
                            className="h-7 text-xs px-2 text-rose-600 hover:text-rose-800 hover:bg-rose-50"
                            title="Cancel Reservation"
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {reservations.map((res) => {
          const isCancellable =
            canCancel &&
            (res.status === 'PENDING' || res.status === 'CONFIRMED') &&
            !res.stayInfo?.hasActiveStay;

          const isCheckInEligible =
            canCheckIn &&
            res.status === 'CONFIRMED' &&
            !res.stayInfo?.hasActiveStay;

          return (
            <div
              key={res.id}
              className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm space-y-3"
            >
              <div className="flex items-center justify-between">
                <Link
                  href={`/admin/bookings/${res.id}`}
                  className="font-mono font-bold text-resort-forest text-sm hover:underline"
                >
                  {res.reservationNumber}
                </Link>
                <div className="flex items-center gap-1.5">
                  <PaymentStatusBadge status={res.financials.derivedStatus} />
                  <ReservationStatusBadge status={res.status} />
                </div>
              </div>

              <div className="text-xs text-neutral-800 space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-neutral-400" />
                  {res.primaryGuest.firstName} {res.primaryGuest.lastName}
                  <span className="text-neutral-400 font-mono font-normal">
                    ({res.primaryGuest.phone})
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-neutral-600">
                  <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                  {formatDate(res.checkInDate)} → {formatDate(res.checkOutDate)}
                </div>
                <div className="flex items-center gap-1.5 text-neutral-600">
                  <BedDouble className="w-3.5 h-3.5 text-neutral-400" />
                  {res.rooms[0]?.roomType?.name || 'Standard'} ({res.rooms.length} room(s))
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-neutral-100">
                <div>
                  <div className="text-xs font-bold font-mono text-neutral-900">
                    {formatCurrency(res.totalAmount)}
                  </div>
                  {res.stayInfo?.hasActiveStay ? (
                    <span className="text-[10px] text-blue-700 font-medium">
                      In-House: {res.stayInfo.assignedRooms.join(', ')}
                    </span>
                  ) : (
                    <span className="text-[10px] text-neutral-400">Not checked in</span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <Link href={`/admin/bookings/${res.id}`}>
                    <Button size="sm" variant="outline" className="h-7 text-xs px-2.5">
                      View
                    </Button>
                  </Link>
                  {isCheckInEligible && (
                    <Link href={`/admin/frontdesk/checkin/${res.id}`}>
                      <Button size="sm" className="h-7 text-xs px-2.5 bg-resort-gold text-white">
                        Check In
                      </Button>
                    </Link>
                  )}
                  {isCancellable && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setSelectedForCancel({
                          id: res.id,
                          number: res.reservationNumber,
                          guestName: `${res.primaryGuest.firstName} ${res.primaryGuest.lastName}`,
                          hasAdvancePayment: res.financials.hasAdvancePayment,
                        })
                      }
                      className="h-7 text-xs px-2 text-rose-600"
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-2 pt-2">
        <div className="text-xs text-neutral-500">
          Showing <span className="font-semibold text-neutral-800">{reservations.length}</span> of{' '}
          <span className="font-semibold text-neutral-800">{pagination.totalCount}</span> reservations
          (Page {pagination.page} of {pagination.totalPages})
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-xs text-neutral-600">
            <span>Rows:</span>
            <select
              value={String(pagination.pageSize)}
              onChange={(e) => handleLimitChange(e.target.value)}
              className="text-xs h-7 px-1.5 rounded border border-neutral-200 bg-white"
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => handlePageChange(pagination.page - 1)}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-xs font-semibold px-2">
              {pagination.page} / {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => handlePageChange(pagination.page + 1)}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Cancel Modal */}
      {selectedForCancel && (
        <CancelReservationModal
          reservationId={selectedForCancel.id}
          reservationNumber={selectedForCancel.number}
          guestName={selectedForCancel.guestName}
          hasAdvancePayment={selectedForCancel.hasAdvancePayment}
          isOpen={true}
          onClose={() => setSelectedForCancel(null)}
        />
      )}
    </div>
  );
}
