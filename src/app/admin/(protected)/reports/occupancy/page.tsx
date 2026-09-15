import { requireAuth } from '@/lib/auth/auth';
import { fetchOccupancyReport } from '@/actions/report/index';
import { formatCurrency } from '@/lib/utils';
import { ReportFilter } from '../components/report-filter';
import { ReportKpi } from '../components/report-kpi';
import { ReportChart } from '../components/report-chart';
import { ReportSection } from '../components/report-section';
import {
  BedDouble,
  Percent,
  TrendingUp,
  DollarSign,
  Moon,
  CalendarDays,
  Home,
  Wrench,
  Banknote,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ period?: string; start?: string; end?: string }>;
}

export default async function OccupancyReportPage({ searchParams }: PageProps) {
  await requireAuth();
  const params = await searchParams;
  const period = params.period || 'today';

  let report: Awaited<ReturnType<typeof fetchOccupancyReport>> | null = null;
  let reportError: string | null = null;

  try {
    report = await fetchOccupancyReport({
      period,
      start: params.start,
      end: params.end,
    });
  } catch (e: any) {
    reportError = e?.message || 'Failed to load occupancy report data.';
  }

  if (reportError) {
    return (
      <div className="space-y-6 pb-12">
        <div className="border-b border-neutral-200 pb-5">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-resort-charcoal">
              Occupancy & Room Performance
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
  const byRoomType = report!.byRoomType;

  const trendOccupancy = trend.map((t) => ({ label: t.label, value: t.occupancyRate }));
  const trendAdr = trend.map((t) => ({ label: t.label, value: t.adr }));

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="border-b border-neutral-200 pb-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-resort-charcoal">
              Occupancy & Room Performance
            </h1>
            <p className="text-xs text-resort-stone mt-1.5">
              Occupancy rates, ADR, RevPAR, and room-type performance metrics.
            </p>
          </div>
          <ReportFilter currentPeriod={period} basePath="/admin/reports/occupancy" />
        </div>
      </div>

      {!report!.hasData ? (
        <div className="p-8 text-center">
          <BedDouble className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
          <p className="text-sm text-resort-stone font-medium">No occupancy data for the selected period.</p>
          <p className="text-xs text-neutral-400 mt-1">Try selecting a different date range.</p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <ReportKpi
              label="Occupancy Rate"
              value={`${s.occupancyRate}%`}
              subtitle={`${s.roomNightsSold} / ${s.roomNightsAvailable} nights`}
              icon={<Percent className="w-4 h-4" />}
              variant="success"
            />
            <ReportKpi
              label="ADR"
              value={s.adr ? formatCurrency(s.adr.toNumber()) : '—'}
              subtitle="Average Daily Rate"
              icon={<TrendingUp className="w-4 h-4" />}
            />
            <ReportKpi
              label="RevPAR"
              value={s.revpar ? formatCurrency(s.revpar.toNumber()) : '—'}
              subtitle="Revenue Per Available Room"
              icon={<DollarSign className="w-4 h-4" />}
            />
            <ReportKpi
              label="Room Nights Sold"
              value={s.roomNightsSold.toLocaleString()}
              subtitle="Physically occupied nights"
              icon={<Moon className="w-4 h-4" />}
            />
            <ReportKpi
              label="Room Nights Available"
              value={s.roomNightsAvailable.toLocaleString()}
              subtitle="Sellable nights in period"
              icon={<CalendarDays className="w-4 h-4" />}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <ReportKpi
              label="Total Rooms"
              value={s.totalRooms}
              subtitle="Active physical rooms"
              icon={<Home className="w-4 h-4" />}
            />
            <ReportKpi
              label="Occupied"
              value={s.occupiedRooms}
              subtitle="Currently occupied"
              icon={<BedDouble className="w-4 h-4" />}
            />
            <ReportKpi
              label="Out of Order"
              value={s.outOfOrderRooms}
              subtitle="Maintenance / unavailable"
              icon={<Wrench className="w-4 h-4" />}
              variant={s.outOfOrderRooms > 0 ? 'warning' : 'default'}
            />
            <ReportKpi
              label="Room Revenue"
              value={formatCurrency(s.roomRevenue.toNumber())}
              subtitle="Total room charges posted"
              icon={<Banknote className="w-4 h-4" />}
              variant="success"
            />
          </div>

          {/* Occupancy Trend Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ReportChart
              title="Occupancy Trend"
              data={[trendOccupancy]}
              series={[
                { key: 'occupancyRate', color: '#173B2F', label: 'Occupancy %' },
              ]}
              height={280}
            />
            <ReportChart
              title="ADR Trend"
              data={[trendAdr]}
              series={[
                { key: 'adr', color: '#C6A15B', label: 'ADR' },
              ]}
              height={280}
            />
          </div>

          {/* Room Type Breakdown */}
          <ReportSection
            title="Room Type Breakdown"
            description="Occupancy and revenue performance by room category"
          >
            {byRoomType.length > 0 ? (
              <div className="overflow-x-auto pt-2">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-resort-sand bg-resort-ivory/50">
                      <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-resort-muted">
                        Room Type
                      </th>
                      <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-resort-muted">
                        Rooms
                      </th>
                      <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-resort-muted">
                        Occupied Nights
                      </th>
                      <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-resort-muted">
                        Available Nights
                      </th>
                      <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-resort-muted">
                        Occupancy %
                      </th>
                      <th className="px-4 py-3 text-right font-semibold uppercase tracking-wider text-resort-muted">
                        Revenue
                      </th>
                      <th className="px-4 py-3 text-right font-semibold uppercase tracking-wider text-resort-muted">
                        ADR
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {byRoomType.map((rt) => (
                      <tr
                        key={rt.roomType}
                        className="border-b border-resort-sand last:border-0 hover:bg-resort-ivory/30 transition-colors"
                      >
                        <td className="px-4 py-3 font-semibold text-resort-charcoal">{rt.roomType}</td>
                        <td className="px-4 py-3 text-center font-mono text-resort-charcoal-text">
                          {rt.totalRooms}
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-resort-charcoal-text">
                          {rt.occupiedNights}
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-resort-charcoal-text">
                          {rt.availableNights}
                        </td>
                        <td className="px-4 py-3 text-center font-mono">
                          <span
                            className={
                              rt.occupancyRate >= 70
                                ? 'text-emerald-700 font-semibold'
                                : rt.occupancyRate >= 40
                                  ? 'text-amber-700 font-semibold'
                                  : 'text-red-600 font-semibold'
                            }
                          >
                            {rt.occupancyRate}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-emerald-800">
                          {formatCurrency(rt.revenue.toNumber())}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-resort-charcoal-text">
                          {rt.adr ? formatCurrency(rt.adr.toNumber()) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6 text-center text-resort-muted text-xs">
                No room type data available for this period.
              </div>
            )}
          </ReportSection>
        </>
      )}
    </div>
  );
}
