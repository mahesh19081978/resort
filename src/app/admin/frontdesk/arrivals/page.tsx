import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { requirePermission } from '@/lib/auth/auth';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ReservationStatus } from '@prisma/client';
import { LogIn } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ArrivalsPage() {
  await requirePermission('checkin:perform');

  const pendingReservations = await prisma.reservation.findMany({
    where: {
      status: { in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED] },
      stays: {
        none: { status: 'ACTIVE' },
      },
    },
    include: {
      primaryGuest: true,
      reservedRooms: {
        include: { roomType: true },
      },
    },
    orderBy: { checkInDate: 'asc' },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200 pb-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-resort-charcoal">Expected Arrivals Console</h1>
          <p className="text-xs text-resort-stone mt-1">
            Review confirmed and pending reservations awaiting guest check-in and stay activation.
          </p>
        </div>
        <Link href="/admin/frontdesk">
          <Button variant="outline" size="sm">Back to Front Desk</Button>
        </Link>
      </div>

      <Card>
        <CardHeader className="p-4 border-b border-neutral-100">
          <CardTitle className="text-sm font-semibold flex items-center justify-between">
            <span>Pending & Confirmed Arrivals ({pendingReservations.length})</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Click Check-In on any guest reservation to begin room assignment, identity verification, and key issuance.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {pendingReservations.length === 0 ? (
            <div className="p-8 text-center text-neutral-400 text-sm">
              No pending guest arrivals found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-neutral-600">
                <thead className="bg-neutral-50 text-neutral-700 uppercase font-semibold text-[10px] tracking-wider border-b border-neutral-200">
                  <tr>
                    <th className="p-3">Reservation</th>
                    <th className="p-3">Guest Name</th>
                    <th className="p-3">Dates</th>
                    <th className="p-3">Room Type</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Advance Paid</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {pendingReservations.map((res) => {
                    const roomType = res.reservedRooms[0]?.roomType?.name || 'Standard';
                    const checkInStr = new Date(res.checkInDate).toISOString().slice(0, 10);
                    const checkOutStr = new Date(res.checkOutDate).toISOString().slice(0, 10);
                    return (
                      <tr key={res.id} className="hover:bg-neutral-50">
                        <td className="p-3 font-mono font-medium text-neutral-900">{res.reservationNumber}</td>
                        <td className="p-3">
                          <div className="font-medium text-neutral-900">
                            {res.primaryGuest.firstName} {res.primaryGuest.lastName}
                          </div>
                          <div className="text-[11px] text-neutral-500">{res.primaryGuest.phone || res.primaryGuest.email}</div>
                        </td>
                        <td className="p-3 font-mono text-[11px]">
                          {checkInStr} to {checkOutStr}
                        </td>
                        <td className="p-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-neutral-100 text-neutral-800 font-medium">
                            {roomType}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={'px-2 py-0.5 rounded text-[10px] font-semibold ' + (res.status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800')}>
                            {res.status}
                          </span>
                        </td>
                        <td className="p-3 font-mono">INR {res.advancePaidAmount.toString()}</td>
                        <td className="p-3 text-right">
                          <Link href={'/admin/frontdesk/checkin/' + res.id}>
                            <Button size="sm" className="bg-resort-gold hover:bg-resort-sand text-white h-7 text-xs">
                              <LogIn className="w-3.5 h-3.5 mr-1" /> Check-In
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
