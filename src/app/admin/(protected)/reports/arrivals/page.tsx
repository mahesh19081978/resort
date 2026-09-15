import { requireAuth } from '@/lib/auth/auth';
import { fetchArrivalsReport } from '@/actions/report/index';
import { formatCurrency } from '@/lib/utils';
import { ReportSection } from '../components/report-section';
import { Badge } from '@/components/ui/badge';
import { getBusinessDateNow } from '@/lib/frontdesk/arrivals';
import { CalendarCheck, Plane, CreditCard, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ start?: string }>;
}

export default async function ArrivalsReportPage({ searchParams }: PageProps) {
  await requireAuth();
  const params = await searchParams;
  const businessDate = params.start || getBusinessDateNow();

  let arrivals: Awaited<ReturnType<typeof fetchArrivalsReport>> = [];
  let arrivalsError: string | null = null;

  try {
    arrivals = await fetchArrivalsReport({ start: businessDate });
  } catch (e: any) {
    arrivalsError = e?.message || 'Failed to load arrivals data.';
  }

  const formattedDate = new Date(businessDate + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="border-b border-neutral-200 pb-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-resort-charcoal">
              Expected Arrivals
            </h1>
            <p className="text-xs text-resort-stone mt-1.5">
              Reservations checking in on <span className="font-semibold text-resort-charcoal">{formattedDate}</span>
            </p>
          </div>
          <form className="inline-flex items-center gap-2">
            <label className="text-xs font-semibold text-resort-muted">Business Date:</label>
            <input
              type="date"
              name="start"
              defaultValue={businessDate}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-md border border-neutral-300 bg-white hover:bg-neutral-50 shadow-sm text-resort-charcoal transition-colors"
            />
          </form>
        </div>
      </div>

      {arrivalsError ? (
        <div className="p-6 bg-rose-50 text-rose-700 text-sm rounded-lg border border-rose-200">
          <p className="font-semibold">Error loading arrivals</p>
          <p className="mt-1 text-xs">{arrivalsError}</p>
        </div>
      ) : arrivals.length === 0 ? (
        <div className="p-8 text-center">
          <Plane className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
          <p className="text-sm text-resort-stone font-medium">No arrivals expected for this date</p>
          <p className="text-xs text-neutral-400 mt-1">No reservations are scheduled to check in on {formattedDate}.</p>
        </div>
      ) : (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 bg-white rounded-lg border border-resort-sand shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-resort-muted">Total Arrivals</p>
              <p className="mt-2 text-2xl font-bold text-resort-charcoal font-display">{arrivals.length}</p>
            </div>
            <div className="p-4 bg-white rounded-lg border border-resort-sand shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-resort-muted">Confirmed</p>
              <p className="mt-2 text-2xl font-bold text-emerald-700 font-display">
                {arrivals.filter((a) => a.status === 'CONFIRMED').length}
              </p>
            </div>
            <div className="p-4 bg-white rounded-lg border border-resort-sand shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-resort-muted">Pending</p>
              <p className="mt-2 text-2xl font-bold text-amber-700 font-display">
                {arrivals.filter((a) => a.status === 'PENDING').length}
              </p>
            </div>
            <div className="p-4 bg-white rounded-lg border border-resort-sand shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-resort-muted">Total Advance Paid</p>
              <p className="mt-2 text-2xl font-bold text-resort-forest font-display">
                {formatCurrency(
                  arrivals.reduce(
                    (sum, a) => sum + (a.calculatedAdvancePaid?.toNumber?.() ?? Number(a.calculatedAdvancePaid) ?? 0),
                    0
                  )
                )}
              </p>
            </div>
          </div>

          {/* Arrivals Table */}
          <ReportSection title="Arrivals List" description={`${arrivals.length} reservation(s) expected`}>
            <div className="border border-resort-sand rounded-lg bg-white shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-resort-sand bg-resort-ivory/50">
                      <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-resort-muted">
                        Res. #
                      </th>
                      <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-resort-muted">
                        Guest
                      </th>
                      <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-resort-muted">
                        Room Type
                      </th>
                      <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-resort-muted">
                        Rooms
                      </th>
                      <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-resort-muted">
                        Check-in
                      </th>
                      <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-resort-muted">
                        Expected Checkout
                      </th>
                      <th className="px-4 py-3 text-right font-semibold uppercase tracking-wider text-resort-muted">
                        Advance Paid
                      </th>
                      <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-resort-muted">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {arrivals.map((arrival) => {
                      const advancePaid = arrival.calculatedAdvancePaid?.toNumber?.() ?? Number(arrival.calculatedAdvancePaid) ?? 0;
                      const roomCount = arrival.reservedRooms?.length ?? 1;
                      const roomType = arrival.reservedRooms?.[0]?.roomType?.name ?? '—';
                      const guestName =
                        `${arrival.primaryGuest?.firstName || ''} ${arrival.primaryGuest?.lastName || ''}`.trim() ||
                        '—';

                      return (
                        <tr
                          key={arrival.id}
                          className="border-b border-resort-sand last:border-0 hover:bg-resort-ivory/30 transition-colors"
                        >
                          <td className="px-4 py-3 font-mono font-semibold text-resort-charcoal">
                            {arrival.reservationNumber || '—'}
                          </td>
                          <td className="px-4 py-3 text-resort-charcoal">{guestName}</td>
                          <td className="px-4 py-3 text-resort-charcoal">{roomType}</td>
                          <td className="px-4 py-3 text-center font-mono text-resort-charcoal">{roomCount}</td>
                          <td className="px-4 py-3 text-resort-charcoal-text">
                            {new Date(arrival.checkInDate).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </td>
                          <td className="px-4 py-3 text-resort-charcoal-text">
                            {new Date(arrival.checkOutDate).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-resort-forest">
                            {advancePaid > 0 ? formatCurrency(advancePaid) : (
                              <span className="text-resort-muted">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge
                              variant={
                                arrival.status === 'CONFIRMED'
                                  ? 'success'
                                  : arrival.status === 'PENDING'
                                    ? 'warning'
                                    : 'secondary'
                              }
                            >
                              {arrival.status === 'CONFIRMED' ? 'Confirmed' : arrival.status === 'PENDING' ? 'Pending' : arrival.status}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </ReportSection>
        </>
      )}
    </div>
  );
}
