import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { requirePermission } from '@/lib/auth/auth';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StayStatus } from '@prisma/client';
import { Users, LogOut, BedDouble } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function InHousePage() {
  await requirePermission('booking:read');

  const activeStays = await prisma.stay.findMany({
    where: { status: StayStatus.ACTIVE },
    include: {
      primaryGuest: true,
      roomAssignments: {
        where: { status: 'ACTIVE' },
        include: {
          room: {
            include: {
              roomType: true,
              floor: { include: { building: true } },
            },
          },
        },
      },
      folio: {
        include: {
          items: true,
          payments: true,
        },
      },
    },
    orderBy: { actualCheckIn: 'desc' },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200 pb-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-resort-charcoal">In-House Guests & Stays</h1>
          <p className="text-xs text-resort-stone mt-1">
            Real-time directory of guests currently staying at the property, room assignments, and live folios.
          </p>
        </div>
        <Link href="/admin/frontdesk">
          <Button variant="outline" size="sm">Back to Front Desk</Button>
        </Link>
      </div>

      <Card>
        <CardHeader className="p-4 border-b border-neutral-100">
          <CardTitle className="text-sm font-semibold flex items-center justify-between">
            <span>Currently Active Stays ({activeStays.length})</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Monitor running folio balances, room assignments, and departure schedules.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {activeStays.length === 0 ? (
            <div className="p-8 text-center text-neutral-400 text-sm">
              No guests are currently checked in.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-neutral-600">
                <thead className="bg-neutral-50 text-neutral-700 uppercase font-semibold text-[10px] tracking-wider border-b border-neutral-200">
                  <tr>
                    <th className="p-3">Stay #</th>
                    <th className="p-3">Room</th>
                    <th className="p-3">Guest Name</th>
                    <th className="p-3">Check-In Time</th>
                    <th className="p-3">Expected Departure</th>
                    <th className="p-3">Folio Charges</th>
                    <th className="p-3">Net Balance</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {activeStays.map((stay) => {
                    const room = stay.roomAssignments[0]?.room;
                    const checkInTime = new Date(stay.actualCheckIn).toLocaleString('en-IN', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    });
                    const checkOutDate = new Date(stay.expectedCheckOut).toLocaleDateString('en-IN');
                    const folioCharges = stay.folio?.totalCharges?.toString() || '0.00';
                    const folioBalance = stay.folio?.totalBalance?.toString() || '0.00';

                    return (
                      <tr key={stay.id} className="hover:bg-neutral-50">
                        <td className="p-3 font-mono font-semibold text-neutral-900">{stay.stayNumber}</td>
                        <td className="p-3">
                          <span className="font-mono font-bold text-neutral-900 bg-neutral-100 px-2 py-0.5 rounded">
                            {room?.roomNumber || 'Unassigned'}
                          </span>
                          <span className="text-[11px] text-neutral-500 block mt-0.5">
                            {room?.roomType?.name}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="font-medium text-neutral-900">
                            {stay.primaryGuest.firstName} {stay.primaryGuest.lastName}
                          </div>
                          <div className="text-[11px] text-neutral-500">{stay.primaryGuest.phone}</div>
                        </td>
                        <td className="p-3 font-mono text-[11px]">{checkInTime}</td>
                        <td className="p-3 font-mono text-[11px]">{checkOutDate}</td>
                        <td className="p-3 font-mono">INR {folioCharges}</td>
                        <td className="p-3 font-mono font-semibold text-neutral-900">
                          INR {folioBalance}
                        </td>
                        <td className="p-3 text-right">
                          <Link href={'/admin/frontdesk/checkout/' + stay.id}>
                            <Button size="sm" variant="outline" className="h-7 text-xs border-neutral-300">
                              <LogOut className="w-3.5 h-3.5 mr-1 text-rose-600" /> Depart / Settle
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
