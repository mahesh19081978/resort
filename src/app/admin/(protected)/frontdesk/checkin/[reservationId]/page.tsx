import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { requirePermission } from '@/lib/auth/auth';
import { getEligibleRoomsForCheckIn } from '@/lib/frontdesk/eligibility';
import { CheckInWizard } from '@/components/frontdesk/CheckInWizard';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

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
      },
      payments: {
        where: { context: 'RESERVATION_ADVANCE' },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!reservation || reservation.stays.length > 0) {
    notFound();
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
