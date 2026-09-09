import { requireAuth } from '@/lib/auth/auth';
import { fetchReservationReport, fetchReservationDetails } from '@/actions/report/index';
import { formatCurrency } from '@/lib/utils';
import { ReportFilter } from '../components/report-filter';
import { ReportKpi } from '../components/report-kpi';
import { ReportChart } from '../components/report-chart';
import { ReportSection } from '../components/report-section';
import { ReportTable } from '../components/report-table';
import {
  CalendarCheck,
  CheckCircle,
  Clock,
  XCircle,
  Timer,
  UserX,
  BadgeCheck,
  TrendingUp,
  BedDouble,
  Users,
  Banknote,
  LayoutList,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ period?: string; start?: string; end?: string }>;
}

export default async function ReservationsReportPage({ searchParams }: PageProps) {
  await requireAuth();
  const params = await searchParams;
  const period = params.period || 'this-month';

  let report: Awaited<ReturnType<typeof fetchReservationReport>> | null = null;
  let reportError: string | null = null;

  try {
    report = await fetchReservationReport({
      period,
      start: params.start,
      end: params.end,
    });
  } catch (e: any) {
    reportError = e?.message || 'Failed to load reservation report data.';
  }

  if (reportError) {
    return (
      <div className="space-y-6 pb-12">
        <div className="border-b border-neutral-200 pb-5">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-resort-charcoal">
              Reservations Report
            </h1>
          </div>
        </div>
        <div className="p-6 bg-rose-50 text-rose-700 text-sm rounded-lg border border-rose-200">
          <p className="font-semibold">Error loading report</p>
          <p className="mt-1 text-xs">{reportError}</p>
        </div>
      </div>
    );
  }

  const s = report!.summary;
  const trend = report!.trend;
  const bySource = report!.bySource;
  const byRoomType = report!.byRoomType;
  const byStatus = report!.byStatus;

  const trendLabels = trend.map((t) => t.label);
  const trendData = trend.map((t) => ({ label: t.label, value: t.count }));

  let details: Awaited<ReturnType<typeof fetchReservationDetails>> | null = null;
  try {
    details = await fetchReservationDetails({ period, start: params.start, end: params.end, page: 1, pageSize: 15 });
  } catch {
    // detail load failure is non-fatal
  }

  const detailColumns = [
    { header: 'Res. #', accessorKey: 'reservationNumber', className: 'font-mono font-semibold' },
    { header: 'Guest', accessorKey: 'guestName' },
    { header: 'Room Type', accessorKey: 'roomType' },
    { header: 'Check-in', accessorKey: 'checkInFormatted' },
    { header: 'Check-out', accessorKey: 'checkOutFormatted' },
    { header: 'Amount', accessorKey: 'amountFormatted', className: 'text-right font-mono' },
    { header: 'Status', accessorKey: 'statusFormatted' },
    { header: 'Source', accessorKey: 'sourceFormatted', className: 'capitalize' },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="border-b border-neutral-200 pb-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-resort-charcoal">
              Reservations Report
            </h1>
            <p className="text-xs text-resort-stone mt-1.5">
              Booking volumes, trends, source breakdown, and reservation details.
            </p>
          </div>
          <ReportFilter currentPeriod={period} basePath="/admin/reports/reservations" />
        </div>
      </div>

      {!report!.hasData ? (
        <div className="p-8 text-center">
          <CalendarCheck className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
          <p className="text-sm text-resort-stone font-medium">No reservation data for the selected period.</p>
          <p className="text-xs text-neutral-400 mt-1">Try selecting a different date range.</p>
        </div>
      ) : (
        <>
          {/* KPI Cards - Row 1 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <ReportKpi
              label="Total Reservations"
              value={s.totalReservations.toLocaleString()}
              subtitle="Bookings in period"
              icon={<CalendarCheck className="w-4 h-4" />}
              variant="success"
            />
            <ReportKpi
              label="Confirmed"
              value={s.confirmed.toLocaleString()}
              subtitle="Active confirmed"
              icon={<CheckCircle className="w-4 h-4" />}
              variant="success"
            />
            <ReportKpi
              label="Pending"
              value={s.pending.toLocaleString()}
              subtitle="Awaiting confirmation"
              icon={<Clock className="w-4 h-4" />}
              variant="warning"
            />
            <ReportKpi
              label="Cancelled"
              value={s.cancelled.toLocaleString()}
              subtitle="Cancelled bookings"
              icon={<XCircle className="w-4 h-4" />}
              variant="danger"
            />
            <ReportKpi
              label="Expired"
              value={s.expired.toLocaleString()}
              subtitle="Auto-expired"
              icon={<Timer className="w-4 h-4" />}
            />
            <ReportKpi
              label="No Show"
              value={s.noShow.toLocaleString()}
              subtitle="Did not arrive"
              icon={<UserX className="w-4 h-4" />}
              variant="danger"
            />
          </div>

          {/* KPI Cards - Row 2 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <ReportKpi
              label="Completed"
              value={s.completed.toLocaleString()}
              subtitle="Finished stays"
              icon={<BadgeCheck className="w-4 h-4" />}
              variant="success"
            />
            <ReportKpi
              label="Avg Lead Time"
              value={s.averageLeadTimeDays !== null ? `${s.averageLeadTimeDays} days` : '—'}
              subtitle="Booking to check-in"
              icon={<TrendingUp className="w-4 h-4" />}
            />
            <ReportKpi
              label="Avg Length of Stay"
              value={s.averageLengthOfStay !== null ? `${s.averageLengthOfStay} nights` : '—'}
              subtitle="Nights per booking"
              icon={<BedDouble className="w-4 h-4" />}
            />
            <ReportKpi
              label="Total Rooms Booked"
              value={s.totalRoomsBooked.toLocaleString()}
              subtitle="Room-nights booked"
              icon={<LayoutList className="w-4 h-4" />}
            />
            <ReportKpi
              label="Total Guests"
              value={s.totalGuestsBooked.toLocaleString()}
              subtitle="Adults + children"
              icon={<Users className="w-4 h-4" />}
            />
            <ReportKpi
              label="Total Booking Value"
              value={formatCurrency(s.totalBookingValue.toNumber())}
              subtitle="Sum of all bookings"
              icon={<Banknote className="w-4 h-4" />}
              variant="success"
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Reservation Trend */}
            <ReportChart
              title="Reservation Trend"
              data={[trendData]}
              series={[
                { key: 'count', color: '#173B2F', label: 'Reservations' },
              ]}
              height={280}
            />

            {/* Status Distribution */}
            <ReportSection title="Status Distribution" description="Booking status breakdown">
              <div className="space-y-3 pt-2">
                {byStatus
                  .filter((st) => st.count > 0)
                  .map((st) => (
                    <div key={st.status} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className={`w-2.5 h-2.5 rounded-full ${st.color}`} />
                          <span className="font-medium text-resort-charcoal">{st.status}</span>
                        </div>
                        <span className="font-mono font-semibold text-resort-forest">{st.count}</span>
                      </div>
                      <div className="h-2 bg-resort-sand/50 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${st.color}`}
                          style={{
                            width: `${s.totalReservations > 0 ? Math.min((st.count / s.totalReservations) * 100, 100) : 0}%`,
                          }}
                        />
                      </div>
                      <p className="text-[10px] text-resort-muted text-right">
                        {s.totalReservations > 0 ? Math.round((st.count / s.totalReservations) * 1000) / 10 : 0}%
                      </p>
                    </div>
                  ))}
              </div>
            </ReportSection>
          </div>

          {/* Booking Source & Room Type */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Booking Source Breakdown */}
            <ReportSection title="Booking Source Breakdown" description="Reservations by channel">
              {bySource.length > 0 ? (
                <div className="space-y-3 pt-2">
                  {bySource.map((src) => (
                    <div key={src.source} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-resort-charcoal capitalize">
                          {src.source.replace(/_/g, ' ')}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-semibold text-resort-forest">{src.count}</span>
                          <span className="text-resort-muted w-12 text-right">{src.percentage}%</span>
                        </div>
                      </div>
                      <div className="h-2 bg-resort-sand/50 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-resort-forest rounded-full transition-all"
                          style={{ width: `${Math.min(src.percentage, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-resort-muted text-xs">No source data available.</div>
              )}
            </ReportSection>

            {/* Room Type Demand */}
            <ReportSection title="Room Type Demand" description="Most requested room types">
              {byRoomType.length > 0 ? (
                <div className="space-y-3 pt-2">
                  {byRoomType.map((rt) => (
                    <div key={rt.roomType} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-resort-charcoal">{rt.roomType}</span>
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-semibold text-resort-forest">{rt.count}</span>
                          <span className="text-resort-muted w-12 text-right">{rt.percentage}%</span>
                        </div>
                      </div>
                      <div className="h-2 bg-resort-sand/50 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-resort-gold rounded-full transition-all"
                          style={{ width: `${Math.min(rt.percentage, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-resort-muted text-xs">No room type data available.</div>
              )}
            </ReportSection>
          </div>

          {/* Detail Table */}
          {details && details.rows.length > 0 && (
            <ReportSection title="Reservation Details" description="Individual reservation records in period">
              <ReportTable
                columns={detailColumns}
                rows={details.rows.map((r) => ({
                  reservationNumber: r.reservationNumber,
                  guestName: r.guestName,
                  roomType: r.roomType,
                  checkInFormatted: new Date(r.checkInDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
                  checkOutFormatted: new Date(r.checkOutDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
                  amountFormatted: formatCurrency(r.totalAmount.toNumber ? r.totalAmount.toNumber() : Number(r.totalAmount)),
                  statusFormatted: r.status,
                  sourceFormatted: (r.source || '—').replace(/_/g, ' '),
                }))}
                pagination={details.pagination}
                emptyMessage="No reservation records found."
              />
            </ReportSection>
          )}
        </>
      )}
    </div>
  );
}
