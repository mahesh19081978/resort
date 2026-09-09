import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { requirePermission } from '@/lib/auth/auth';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StayStatus } from '@prisma/client';
import { LogOut, ArrowRight, CheckCircle2, Calendar, Users } from 'lucide-react';
import { getExpectedDepartures, getExpectedDeparturesCount } from '@/lib/frontdesk/departures';
import { getBusinessDateNow } from '@/lib/dashboard/date';

export const dynamic = 'force-dynamic';

interface DeparturesPageProps {
  searchParams: Promise<{
    filter?: string;
  }>;
}

export default async function DeparturesPage({ searchParams }: DeparturesPageProps) {
  await requirePermission('checkout:perform');

  const params = await searchParams;
  const isTodayOnly = params.filter === 'today';
  const businessDate = getBusinessDateNow();

  const [todayDeparturesCount, totalActiveCount] = await Promise.all([
    getExpectedDeparturesCount(businessDate),
    prisma.stay.count({ where: { status: StayStatus.ACTIVE } }),
  ]);

  const activeStays = isTodayOnly
    ? await getExpectedDepartures(businessDate)
    : await prisma.stay.findMany({
        where: { status: StayStatus.ACTIVE },
        include: {
          primaryGuest: true,
          roomAssignments: {
            where: { status: 'ACTIVE' },
            include: { room: true },
          },
          folio: {
            include: {
              items: true,
              payments: true,
            },
          },
        },
        orderBy: { expectedCheckOut: 'asc' },
      });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200 pb-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-resort-charcoal">Departures & Checkout Console</h1>
          <p className="text-xs text-resort-stone mt-1">
            Review guest folios, settle balances, and process formal checkouts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/frontdesk/departures?filter=today">
            <Button
              size="sm"
              variant={isTodayOnly ? 'primary' : 'outline'}
              className={isTodayOnly ? 'bg-resort-charcoal text-white text-xs' : 'text-xs'}
            >
              <Calendar className="w-3.5 h-3.5 mr-1.5" /> Today ({todayDeparturesCount})
            </Button>
          </Link>
          <Link href="/admin/frontdesk/departures">
            <Button
              size="sm"
              variant={!isTodayOnly ? 'primary' : 'outline'}
              className={!isTodayOnly ? 'bg-resort-charcoal text-white text-xs' : 'text-xs'}
            >
              <Users className="w-3.5 h-3.5 mr-1.5" /> All Active ({totalActiveCount})
            </Button>
          </Link>
          <Link href="/admin/frontdesk">
            <Button variant="outline" size="sm" className="text-xs">Back to Front Desk</Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader className="p-4 border-b border-neutral-100">
          <CardTitle className="text-sm font-semibold flex items-center justify-between">
            <span>
              {isTodayOnly
                ? `Today's Expected Departures (${activeStays.length})`
                : `Stays Pending Checkout (${activeStays.length})`}
            </span>
          </CardTitle>
          <CardDescription className="text-xs">
            {isTodayOnly
              ? `Showing guests scheduled to depart on today's business date (${businessDate}).`
              : 'Releasing a room automatically marks its physical status as DIRTY for housekeeping turnover.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {activeStays.length === 0 ? (
            <div className="p-8 text-center text-neutral-400 text-sm">
              {isTodayOnly
                ? 'No guest departures scheduled for today.'
                : 'No active stays pending departure.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-neutral-600">
                <thead className="bg-neutral-50 text-neutral-700 uppercase font-semibold text-[10px] tracking-wider border-b border-neutral-200">
                  <tr>
                    <th className="p-3">Stay #</th>
                    <th className="p-3">Room</th>
                    <th className="p-3">Guest Name</th>
                    <th className="p-3">Expected Departure</th>
                    <th className="p-3">Total Charges</th>
                    <th className="p-3">Current Balance</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {activeStays.map((stay) => {
                    const room = stay.roomAssignments[0]?.room;
                    const checkOutDate = new Date(stay.expectedCheckOut).toLocaleDateString('en-IN');
                    const totalCharges = stay.folio?.totalCharges?.toString() || '0.00';
                    const balance = stay.folio?.totalBalance?.toString() || '0.00';
                    const isZeroBalance = stay.folio?.totalBalance?.equals(0);

                    return (
                      <tr key={stay.id} className="hover:bg-neutral-50">
                        <td className="p-3 font-mono font-medium text-neutral-900">{stay.stayNumber}</td>
                        <td className="p-3">
                          <span className="font-mono font-bold text-neutral-900 bg-neutral-100 px-2 py-0.5 rounded">
                            {room?.roomNumber || 'None'}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="font-medium text-neutral-900">
                            {stay.primaryGuest.firstName} {stay.primaryGuest.lastName}
                          </div>
                          <div className="text-[11px] text-neutral-500">{stay.primaryGuest.phone}</div>
                        </td>
                        <td className="p-3 font-mono text-[11px]">{checkOutDate}</td>
                        <td className="p-3 font-mono">INR {totalCharges}</td>
                        <td className="p-3">
                          <span
                            className={
                              'font-mono font-bold px-2 py-0.5 rounded text-[11px] ' +
                              (isZeroBalance
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800')
                            }
                          >
                            INR {balance}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <Link href={'/admin/frontdesk/checkout/' + stay.id}>
                            <Button
                              size="sm"
                              className={
                                isZeroBalance
                                  ? 'bg-neutral-900 hover:bg-neutral-800 text-white h-7 text-xs'
                                  : 'bg-rose-600 hover:bg-rose-700 text-white h-7 text-xs'
                              }
                            >
                              <LogOut className="w-3.5 h-3.5 mr-1" />
                              {isZeroBalance ? 'Checkout' : 'Settle & Checkout'}
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
