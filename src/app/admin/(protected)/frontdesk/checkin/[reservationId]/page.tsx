import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { requirePermission } from '@/lib/auth/auth';
import { getEligibleRoomsForCheckIn } from '@/lib/frontdesk/eligibility';
import { CheckInWizard } from '@/components/frontdesk/CheckInWizard';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CheckCircle2, BedDouble, CreditCard } from 'lucide-react';

interface CheckInPageProps {
  params: Promise<{
    reservationId: string;
  }>;
}

export const dynamic = 'force-dynamic';

export default async function CheckInPage({ params }: CheckInPageProps) {
  await requirePermission('checkin:perform');
  const { reservationId } = await params;

  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: {
      primaryGuest: true,
      reservedRooms: {
        include: {
          roomType: true,
        },
      },
      stays: {
        where: { status: 'ACTIVE' },
        include: {
          roomAssignments: {
            where: { status: 'ACTIVE' },
            include: { room: true },
          },
          folio: true,
        },
      },
      payments: {
        where: { context: 'RESERVATION_ADVANCE' },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!reservation) {
    notFound();
  }

  // If the reservation already has an active stay, show "Already Checked-In" instead of 404
  if (reservation.stays.length > 0) {
    const activeStay = reservation.stays[0];
    const assignedRoom = activeStay.roomAssignments[0]?.room;

    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between border-b border-neutral-200 pb-4">
          <div>
            <h1 className="font-serif text-2xl font-bold text-resort-charcoal">Guest Check-In Wizard</h1>
            <p className="text-xs text-resort-stone mt-1">
              Reservation #{reservation.reservationNumber} &bull; Guest: {reservation.primaryGuest.firstName} {reservation.primaryGuest.lastName}
            </p>
          </div>
          <Link href="/admin/frontdesk/arrivals">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to Arrivals
            </Button>
          </Link>
        </div>

        <div className="border border-emerald-200 bg-emerald-50/30 rounded-lg p-6 space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            <div>
              <h2 className="text-lg font-semibold text-emerald-900">Already Checked In</h2>
              <p className="text-xs text-emerald-700 mt-1">
                This reservation has already been checked in and has an active stay.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-white rounded-lg border border-emerald-100 text-xs">
            <div>
              <span className="text-neutral-500 block">Stay Number</span>
              <span className="font-mono font-bold text-neutral-900">{activeStay.stayNumber}</span>
            </div>
            <div>
              <span className="text-neutral-500 block">Assigned Room</span>
              <span className="font-mono font-bold text-neutral-900">{assignedRoom?.roomNumber || 'N/A'}</span>
            </div>
            {activeStay.folio && (
              <div>
                <span className="text-neutral-500 block">Primary Folio</span>
                <span className="font-mono font-bold text-neutral-900">{activeStay.folio.folioNumber}</span>
              </div>
            )}
            <div>
              <span className="text-neutral-500 block">Guest</span>
              <span className="font-medium text-neutral-900">
                {reservation.primaryGuest.firstName} {reservation.primaryGuest.lastName}
              </span>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Link href="/admin/frontdesk/inhouse">
              <Button className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs">
                <BedDouble className="w-4 h-4 mr-2" /> View In-House Stays
              </Button>
            </Link>
            {activeStay.folio && (
              <Link href={`/admin/frontdesk/inhouse/${activeStay.id}/bill`}>
                <Button variant="outline" className="border-emerald-300 text-xs">
                  <CreditCard className="w-4 h-4 mr-2" /> View Folio / Bill
                </Button>
              </Link>
            )}
            <Link href="/admin/frontdesk">
              <Button variant="outline" className="border-emerald-300 text-xs">
                Return to Front Desk
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const reservedRoom = reservation.reservedRooms[0];
  const roomTypeId = reservedRoom?.roomTypeId;

  const eligibleRooms = roomTypeId
    ? await getEligibleRoomsForCheckIn(undefined, roomTypeId, reservation.id, prisma)
    : [];

  const successfulPayments = reservation.payments
    .filter((p) => p.status === 'SUCCESS')
    .map((p) => ({
      id: p.id,
      paymentNumber: p.paymentNumber,
      amount: Number(p.amount),
      method: p.method,
      paymentDate: p.paymentDate.toISOString(),
      transactionReference: p.transactionReference,
    }));

  const paidDuringBooking = successfulPayments.reduce((sum, p) => sum + p.amount, 0);
  const roomRentTotal = Number(reservation.totalAmount);
  const balanceDue = Math.max(0, roomRentTotal - paidDuringBooking);
  const isPaidInFull = balanceDue <= 0;

  const serializedReservation = {
    id: reservation.id,
    reservationNumber: reservation.reservationNumber,
    checkInDate: reservation.checkInDate.toISOString(),
    checkOutDate: reservation.checkOutDate.toISOString(),
    adults: reservation.adults,
    children: reservation.children,
    totalRooms: reservation.totalRooms,
    primaryGuest: {
      id: reservation.primaryGuest.id,
      firstName: reservation.primaryGuest.firstName,
      lastName: reservation.primaryGuest.lastName,
      email: reservation.primaryGuest.email,
      phone: reservation.primaryGuest.phone,
    },
    reservedRooms: reservation.reservedRooms.map((rr) => ({
      roomType: {
        id: rr.roomType.id,
        name: rr.roomType.name,
      },
      ratePerNight: rr.ratePerNight.toString(),
      totalNights: rr.totalNights,
      roomsCount: rr.roomsCount,
      lineTotal: rr.lineTotal.toString(),
      taxAmount: rr.taxAmount.toString(),
    })),
    paymentSummary: {
      roomRentTotal,
      totalNights: reservedRoom?.totalNights || 1,
      roomsCount: reservation.totalRooms || 1,
      paidDuringBooking,
      balanceDue,
      isPaidInFull,
      successfulPayments,
    },
  };

  const serializedRooms = eligibleRooms.map((r) => ({
    id: r.id,
    roomNumber: r.roomNumber,
    status: r.status,
    floor: {
      name: r.floor.name,
      building: {
        name: r.floor.building.name,
      },
    },
  }));

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between border-b border-neutral-200 pb-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-resort-charcoal">Guest Check-In Wizard</h1>
          <p className="text-xs text-resort-stone mt-1">
            Reservation #{reservation.reservationNumber} &bull; Guest: {reservation.primaryGuest.firstName} {reservation.primaryGuest.lastName}
          </p>
        </div>
        <Link href="/admin/frontdesk/arrivals">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to Arrivals
          </Button>
        </Link>
      </div>

      <CheckInWizard
        reservation={serializedReservation}
        eligibleRooms={serializedRooms}
      />
    </div>
  );
}
