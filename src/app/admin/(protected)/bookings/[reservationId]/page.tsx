import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/auth';
import { hasPermission } from '@/lib/permissions/rbac';
import { getAdminReservationDetail } from '@/lib/booking/admin-reservation-service';
import { ReservationStatusBadge } from '@/components/booking/admin/ReservationStatusBadge';
import { PaymentStatusBadge } from '@/components/booking/admin/PaymentStatusBadge';
import { ReservationDetailActions } from '@/components/booking/admin/ReservationDetailActions';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Calendar,
  User,
  Phone,
  Mail,
  MapPin,
  BedDouble,
  CreditCard,
  History,
  ShieldAlert,
  ShieldCheck,
  Home,
  Receipt,
  Clock,
  LogIn,
  CheckCircle2,
  FileText,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

interface ReservationDetailPageProps {
  params: Promise<{
    reservationId: string;
  }>;
}

export default async function AdminReservationDetailPage({ params }: ReservationDetailPageProps) {
  const user = await requirePermission('booking:read');
  const { reservationId } = await params;

  const reservation = await getAdminReservationDetail(reservationId, user);

  if (!reservation) {
    notFound();
  }

  const canCancel = hasPermission(user, 'booking:cancel');
  const canCheckIn = hasPermission(user, 'checkin:perform');
  const canViewSensitive = hasPermission(user, 'guest:view_sensitive');
  const canViewAudit = hasPermission(user, 'audit:read');

  const activeStay = reservation.stays.find((s) => s.status === 'ACTIVE') || reservation.stays[0];
  const isCancellable =
    canCancel &&
    (reservation.status === 'PENDING' || reservation.status === 'CONFIRMED') &&
    !activeStay;

  const isCheckInEligible =
    canCheckIn &&
    reservation.status === 'CONFIRMED' &&
    !activeStay;

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  };

  const formatDateTime = (date: Date | string) => {
    return new Date(date).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatCurrency = (val: unknown) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(Number(val));
  };

  const nights = Math.round(
    (new Date(reservation.checkOutDate).getTime() - new Date(reservation.checkInDate).getTime()) /
      (1000 * 60 * 60 * 24)
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Top Bar with Back button and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200/80 pb-4">
        <div className="flex items-center gap-3">
          <Link href="/admin/bookings">
            <Button variant="outline" size="sm" className="h-8 w-8 p-0 text-neutral-600">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-mono text-xl font-bold text-resort-charcoal">
                {reservation.reservationNumber}
              </h1>
              <ReservationStatusBadge status={reservation.status} />
              <PaymentStatusBadge status={reservation.financials.derivedStatus} />
            </div>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              Source: <span className="font-semibold text-neutral-700">{reservation.source}</span> •
              Created on {formatDateTime(reservation.createdAt)}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <ReservationDetailActions
          reservationId={reservation.id}
          reservationNumber={reservation.reservationNumber}
          guestName={`${reservation.primaryGuest.firstName} ${reservation.primaryGuest.lastName}`}
          isCancellable={isCancellable}
          isCheckInEligible={isCheckInEligible}
          hasAdvancePayment={reservation.financials.totalPaid.gt(0)}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Stay Details, Commercial Rooms, Physical Stay, Payments */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stay Dates & Commercial Inventory Card */}
          <Card className="shadow-xs border-neutral-200/80">
            <CardHeader className="p-4 border-b border-neutral-100 bg-neutral-50/50">
              <CardTitle className="text-xs uppercase tracking-wider font-semibold text-neutral-600 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-resort-forest" />
                Stay Schedule & Booked Rooms
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-5">
              {/* Dates grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-neutral-50 border border-neutral-100 text-xs">
                <div>
                  <div className="text-[10px] uppercase font-medium text-neutral-500">Check-in</div>
                  <div className="font-semibold text-neutral-900 text-sm mt-0.5">
                    {formatDate(reservation.checkInDate)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-medium text-neutral-500">Check-out</div>
                  <div className="font-semibold text-neutral-900 text-sm mt-0.5">
                    {formatDate(reservation.checkOutDate)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-medium text-neutral-500">Duration</div>
                  <div className="font-semibold text-neutral-900 text-sm mt-0.5">
                    {nights} Night{nights > 1 ? 's' : ''}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-medium text-neutral-500">Guests</div>
                  <div className="font-semibold text-neutral-900 text-sm mt-0.5">
                    {reservation.adults} Adult{reservation.adults > 1 ? 's' : ''}
                    {reservation.children > 0 ? `, ${reservation.children} Child` : ''}
                  </div>
                </div>
              </div>

              {/* Reserved Rooms Table (Commercial Inventory) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-neutral-800">
                    Booked Inventory ({reservation.totalRooms} Room{reservation.totalRooms > 1 ? 's' : ''})
                  </h4>
                  <span className="text-[10px] text-neutral-400">
                    RoomType commercial allocation
                  </span>
                </div>

                <div className="rounded-lg border border-neutral-200 overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-neutral-50 text-neutral-600 font-semibold text-[10px] uppercase border-b border-neutral-200">
                      <tr>
                        <th className="p-3">Room Type</th>
                        <th className="p-3 text-center">Rooms</th>
                        <th className="p-3 text-right">Nightly Rate</th>
                        <th className="p-3 text-right">Tax</th>
                        <th className="p-3 text-right">Line Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {reservation.reservedRooms.map((room) => (
                        <tr key={room.id} className="hover:bg-neutral-50/50">
                          <td className="p-3 font-medium text-neutral-900">
                            <div>{room.roomType.name}</div>
                            <div className="text-[10px] text-neutral-400 font-mono">
                              Code: {room.roomType.code} • Max {room.roomType.maxOccupancy} pax
                            </div>
                          </td>
                          <td className="p-3 text-center font-medium text-neutral-800">
                            {room.roomsCount}
                          </td>
                          <td className="p-3 text-right font-mono text-neutral-700">
                            {formatCurrency(room.ratePerNight.toString())}
                          </td>
                          <td className="p-3 text-right font-mono text-neutral-700">
                            {formatCurrency(room.taxAmount.toString())}
                          </td>
                          <td className="p-3 text-right font-mono font-semibold text-neutral-900">
                            {formatCurrency(room.lineTotal.toString())}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {reservation.specialRequests && (
                <div className="p-3 bg-amber-50/60 border border-amber-200/70 rounded-lg text-xs">
                  <span className="font-semibold text-amber-900">Special Requests: </span>
                  <span className="text-amber-800">{reservation.specialRequests}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* PMS Physical Stay & Room Assignment Distinction Card */}
          <Card className="shadow-xs border-neutral-200/80">
            <CardHeader className="p-4 border-b border-neutral-100 bg-neutral-50/50">
              <CardTitle className="text-xs uppercase tracking-wider font-semibold text-neutral-600 flex items-center gap-2">
                <Home className="w-4 h-4 text-resort-forest" />
                Physical Stay & Room Assignment (Front Desk PMS)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              {activeStay ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50/60 border border-blue-200/70">
                    <div>
                      <div className="text-xs font-semibold text-blue-950 flex items-center gap-2">
                        <span>Stay #{activeStay.stayNumber}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                          {activeStay.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-blue-800 mt-1">
                        Checked In: {formatDateTime(activeStay.actualCheckIn)} • Expected Checkout:{' '}
                        {formatDateTime(activeStay.expectedCheckOut)}
                      </div>
                    </div>
                    <Link href="/admin/frontdesk/inhouse">
                      <Button size="sm" variant="outline" className="text-xs h-7 border-blue-300 text-blue-900">
                        View In Front Desk
                      </Button>
                    </Link>
                  </div>

                  {activeStay.roomAssignments.length > 0 && (
                    <div className="p-3 rounded-lg border border-neutral-200 text-xs">
                      <div className="text-[11px] font-medium text-neutral-500 mb-1">
                        Assigned Physical Room(s):
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {activeStay.roomAssignments.map((ra) => (
                          <span
                            key={ra.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-neutral-100 border border-neutral-200 font-mono font-bold text-neutral-800"
                          >
                            Room {ra.room.roomNumber} ({ra.room.roomType.name})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 rounded-lg bg-neutral-50 border border-neutral-200/70 text-xs">
                  <div>
                    <div className="font-semibold text-neutral-800">Not Checked In</div>
                    <p className="text-neutral-500 text-[11px] mt-0.5">
                      Physical room assignment occurs at Front Desk check-in.
                    </p>
                  </div>
                  {isCheckInEligible && (
                    <Link href={`/admin/frontdesk/checkin/${reservation.id}`}>
                      <Button
                        size="sm"
                        className="bg-resort-gold hover:bg-resort-gold-dark text-white text-xs font-semibold shadow-xs"
                      >
                        <LogIn className="w-3.5 h-3.5 mr-1" /> Check In Guest
                      </Button>
                    </Link>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment & Refund Timeline Card */}
          <Card className="shadow-xs border-neutral-200/80">
            <CardHeader className="p-4 border-b border-neutral-100 bg-neutral-50/50">
              <CardTitle className="text-xs uppercase tracking-wider font-semibold text-neutral-600 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-resort-forest" />
                Payments & Refunds Ledger
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              {reservation.payments.length === 0 ? (
                <div className="p-4 text-center text-xs text-neutral-400 bg-neutral-50 rounded-lg border border-neutral-100">
                  No payment records registered for this reservation.
                </div>
              ) : (
                <div className="space-y-3">
                  {reservation.payments.map((p) => (
                    <div
                      key={p.id}
                      className="p-3.5 rounded-lg border border-neutral-200 bg-white shadow-xs space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-neutral-900">
                            {p.paymentNumber}
                          </span>
                          <span className="px-2 py-0.2 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                            {p.status}
                          </span>
                          <span className="text-[10px] text-neutral-400 font-mono">
                            {p.method}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-neutral-900 text-sm">
                          {formatCurrency(p.amount.toString())}
                        </span>
                      </div>

                      <div className="text-[11px] text-neutral-500 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-2">
                        <div>
                          Context: <span className="font-medium text-neutral-700">{p.context}</span>
                          {p.transactionReference && (
                            <span className="ml-2 font-mono text-[10px]">
                              Ref: {p.transactionReference.slice(-8)}
                            </span>
                          )}
                        </div>
                        <div>{formatDateTime(p.paymentDate)}</div>
                      </div>

                      {/* Refunds on this payment */}
                      {p.refunds.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-dashed border-neutral-200 space-y-1.5">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-rose-700">
                            Refund Activity:
                          </div>
                          {p.refunds.map((rf) => (
                            <div
                              key={rf.id}
                              className="flex items-center justify-between text-xs p-2 rounded bg-rose-50/70 border border-rose-100"
                            >
                              <div>
                                <span className="font-mono font-bold text-rose-900">
                                  {rf.refundNumber}
                                </span>
                                <span className="ml-2 text-[10px] text-rose-700">
                                  Status: {rf.status}
                                </span>
                                <div className="text-[10px] text-rose-600 italic mt-0.5">
                                  {rf.reason}
                                </div>
                              </div>
                              <span className="font-mono font-bold text-rose-800">
                                -{formatCurrency(rf.amount.toString())}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column (1 Col): Guest Card, Financial Summary, Audits */}
        <div className="space-y-6">
          {/* Guest Information Card */}
          <Card className="shadow-xs border-neutral-200/80">
            <CardHeader className="p-4 border-b border-neutral-100 bg-neutral-50/50">
              <CardTitle className="text-xs uppercase tracking-wider font-semibold text-neutral-600 flex items-center gap-2">
                <User className="w-4 h-4 text-resort-forest" />
                Guest Details
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3 text-xs">
              <div>
                <div className="text-base font-bold text-neutral-900 flex items-center gap-2">
                  <span>
                    {reservation.primaryGuest.firstName} {reservation.primaryGuest.lastName}
                  </span>
                  {reservation.primaryGuest.vip && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                      VIP
                    </span>
                  )}
                  {reservation.primaryGuest.blacklisted && (
                    <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">
                      BLOCKED
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-1.5 text-neutral-600 pt-2 border-t border-neutral-100">
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" />
                  <span className="font-mono">{reservation.primaryGuest.phone}</span>
                </div>
                {reservation.primaryGuest.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" />
                    <span>{reservation.primaryGuest.email}</span>
                  </div>
                )}
                {reservation.primaryGuest.address && (
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0 mt-0.5" />
                    <span>
                      {[
                        reservation.primaryGuest.address,
                        reservation.primaryGuest.city,
                        reservation.primaryGuest.state,
                        reservation.primaryGuest.country,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                  </div>
                )}
              </div>

              {/* Sensitive ID Documents (RBAC protected on server) */}
              <div className="pt-3 border-t border-neutral-100">
                <div className="text-[11px] font-semibold text-neutral-700 mb-1.5 flex items-center justify-between">
                  <span>ID Verification</span>
                  {canViewSensitive ? (
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <ShieldAlert className="w-3.5 h-3.5 text-neutral-400" />
                  )}
                </div>

                {canViewSensitive ? (
                  reservation.primaryGuest.documents.length > 0 ? (
                    <div className="space-y-1.5">
                      {reservation.primaryGuest.documents.map((doc) => (
                        <div
                          key={doc.id}
                          className="p-2 rounded bg-neutral-50 border border-neutral-200/80 text-[11px]"
                        >
                          <div className="font-semibold text-neutral-800">
                            {doc.documentType}: {doc.documentNumber}
                          </div>
                          <div className="text-[10px] text-neutral-500 mt-0.5 flex items-center justify-between">
                            <span>Status: {doc.verificationStatus}</span>
                            <span>{doc.fileName}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] text-neutral-400 italic">
                      No documents uploaded yet.
                    </div>
                  )
                ) : (
                  <div className="text-[10px] text-neutral-400 italic bg-neutral-50 p-2 rounded border border-neutral-100">
                    Sensitive ID documents hidden (requires guest:view_sensitive).
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Financial Breakdown Card */}
          <Card className="shadow-xs border-neutral-200/80">
            <CardHeader className="p-4 border-b border-neutral-100 bg-neutral-50/50">
              <CardTitle className="text-xs uppercase tracking-wider font-semibold text-neutral-600 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-resort-forest" />
                Financial Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between text-neutral-600">
                <span>Room Subtotal</span>
                <span className="font-mono">{formatCurrency(reservation.subtotal.toString())}</span>
              </div>
              {reservation.discountAmount.gt(0) && (
                <div className="flex items-center justify-between text-emerald-700">
                  <span>Discount</span>
                  <span className="font-mono">
                    -{formatCurrency(reservation.discountAmount.toString())}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-neutral-600">
                <span>Taxes (GST)</span>
                <span className="font-mono">{formatCurrency(reservation.taxAmount.toString())}</span>
              </div>

              <div className="pt-2 border-t border-neutral-200 flex items-center justify-between font-bold text-neutral-900 text-sm">
                <span>Total Amount</span>
                <span className="font-mono">
                  {formatCurrency(reservation.totalAmount.toString())}
                </span>
              </div>

              <div className="pt-2 border-t border-neutral-100 space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between text-emerald-800">
                  <span>Advances Paid</span>
                  <span className="font-mono font-semibold">
                    {formatCurrency(reservation.financials.totalPaid.toString())}
                  </span>
                </div>

                {reservation.financials.totalRefunded.gt(0) && (
                  <div className="flex items-center justify-between text-rose-700">
                    <span>Processed Refunds</span>
                    <span className="font-mono font-semibold">
                      -{formatCurrency(reservation.financials.totalRefunded.toString())}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between text-neutral-900 font-semibold pt-1 border-t border-neutral-100">
                  <span>Balance Due</span>
                  <span
                    className={`font-mono text-xs ${
                      reservation.financials.balanceDue.gt(0) ? 'text-amber-700' : 'text-emerald-700'
                    }`}
                  >
                    {formatCurrency(reservation.financials.balanceDue.toString())}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Audit Trail Card */}
          {canViewAudit && (
            <Card className="shadow-xs border-neutral-200/80">
              <CardHeader className="p-4 border-b border-neutral-100 bg-neutral-50/50">
                <CardTitle className="text-xs uppercase tracking-wider font-semibold text-neutral-600 flex items-center gap-2">
                  <History className="w-4 h-4 text-resort-forest" />
                  Audit History
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                {reservation.audits.length === 0 ? (
                  <div className="text-[11px] text-neutral-400 italic">
                    No audit records logged.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {reservation.audits.map((a) => (
                      <div
                        key={a.id}
                        className="text-[11px] p-2.5 rounded bg-neutral-50 border border-neutral-200/70 space-y-1"
                      >
                        <div className="font-semibold text-neutral-800 flex items-center justify-between">
                          <span>{a.action}</span>
                          <span className="text-[10px] text-neutral-400 font-normal">
                            {formatDateTime(a.createdAt)}
                          </span>
                        </div>
                        {a.user && (
                          <div className="text-[10px] text-neutral-500">
                            By: {a.user.name} ({a.user.role})
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
