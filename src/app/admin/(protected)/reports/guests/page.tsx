import { requireAuth } from '@/lib/auth/auth';
import { fetchGuestReport } from '@/actions/report/index';
import { ReportFilter } from '../components/report-filter';
import { ReportKpi } from '../components/report-kpi';
import { ReportSection } from '../components/report-section';
import {
  Users,
  UserPlus,
  UserCheck,
  BedDouble,
  Moon,
  Clock,
  Repeat,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ period?: string; start?: string; end?: string }>;
}

export default async function GuestReportPage({ searchParams }: PageProps) {
  await requireAuth();
  const params = await searchParams;
  const period = params.period || 'this-month';

  let report: Awaited<ReturnType<typeof fetchGuestReport>> | null = null;
  let reportError: string | null = null;

  try {
    report = await fetchGuestReport({
      period,
      start: params.start,
      end: params.end,
    });
  } catch (e: any) {
    reportError = e?.message || 'Failed to load guest report data.';
  }

  if (reportError) {
    return (
      <div className="space-y-6 pb-12">
        <div className="border-b border-neutral-200 pb-5">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-resort-charcoal">
              Guest Report
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
  const topGuests = report!.topGuests;

  const repeatRatio = s.totalGuests > 0
    ? Math.round((s.repeatGuests / s.totalGuests) * 1000) / 10
    : 0;

  const newRatio = s.totalGuests > 0
    ? Math.round((s.newGuests / s.totalGuests) * 1000) / 10
    : 0;

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="border-b border-neutral-200 pb-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-resort-charcoal">
              Guest Report
            </h1>
            <p className="text-xs text-resort-stone mt-1.5">
              Guest demographics, stay patterns, repeat ratio, and top guest analysis.
            </p>
          </div>
          <ReportFilter currentPeriod={period} basePath="/admin/reports/guests" />
        </div>
      </div>

      {!report!.hasData ? (
        <div className="p-8 text-center">
          <Users className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
          <p className="text-sm text-resort-stone font-medium">No guest data for the selected period.</p>
          <p className="text-xs text-neutral-400 mt-1">Try selecting a different date range.</p>
        </div>
      ) : (
        <>
          {/* KPI Cards - Row 1 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <ReportKpi
              label="Total Guests"
              value={s.totalGuests.toLocaleString()}
              subtitle="Unique guests in period"
              icon={<Users className="w-4 h-4" />}
              variant="success"
            />
            <ReportKpi
              label="New Guests"
              value={s.newGuests.toLocaleString()}
              subtitle="First-time visitors"
              icon={<UserPlus className="w-4 h-4" />}
            />
            <ReportKpi
              label="Repeat Guests"
              value={s.repeatGuests.toLocaleString()}
              subtitle="Returning visitors"
              icon={<Repeat className="w-4 h-4" />}
              variant="success"
            />
            <ReportKpi
              label="Total Stays"
              value={s.totalStays.toLocaleString()}
              subtitle="Check-ins in period"
              icon={<BedDouble className="w-4 h-4" />}
            />
            <ReportKpi
              label="Room Nights"
              value={s.totalRoomNights.toLocaleString()}
              subtitle="Total nights booked"
              icon={<Moon className="w-4 h-4" />}
            />
            <ReportKpi
              label="Avg Stay Duration"
              value={s.averageStayDuration !== null ? `${s.averageStayDuration} nights` : '—'}
              subtitle="Nights per stay"
              icon={<Clock className="w-4 h-4" />}
            />
          </div>

          {/* Guest Repeat Ratio */}
          <ReportSection title="Guest Repeat Ratio" description="New vs returning guest breakdown">
            <div className="pt-2">
              <div className="flex items-center gap-6 mb-4">
                <div className="flex-1">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-resort-forest" />
                      <span className="font-medium text-resort-charcoal">New Guests</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-resort-charcoal">{s.newGuests}</span>
                      <span className="text-resort-muted w-12 text-right">{newRatio}%</span>
                    </div>
                  </div>
                  <div className="h-3 bg-resort-sand/50 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-resort-forest rounded-full transition-all"
                      style={{ width: `${Math.min(newRatio, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex-1">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-resort-gold" />
                      <span className="font-medium text-resort-charcoal">Repeat Guests</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-resort-charcoal">{s.repeatGuests}</span>
                      <span className="text-resort-muted w-12 text-right">{repeatRatio}%</span>
                    </div>
                  </div>
                  <div className="h-3 bg-resort-sand/50 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-resort-gold rounded-full transition-all"
                      style={{ width: `${Math.min(repeatRatio, 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Summary stat */}
              <div className="mt-6 flex items-center gap-3 p-4 bg-resort-ivory/50 rounded-lg border border-resort-sand">
                <Repeat className="w-5 h-5 text-resort-gold flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-resort-charcoal">
                    {repeatRatio}% Guest Retention Rate
                  </p>
                  <p className="text-[11px] text-resort-muted mt-0.5">
                    {s.repeatGuests} out of {s.totalGuests} guests returned during this period.
                    {repeatRatio >= 30
                      ? ' Strong loyalty indicator.'
                      : repeatRatio >= 15
                        ? ' Moderate retention.'
                        : ' Consider loyalty initiatives.'}
                  </p>
                </div>
              </div>
            </div>
          </ReportSection>

          {/* Top Guests Table */}
          {topGuests.length > 0 && (
            <ReportSection title="Top Guests" description="Most frequent guests by stay count">
              <div className="overflow-x-auto pt-2">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-resort-sand bg-resort-ivory/50">
                      <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-resort-muted w-12">
                        Rank
                      </th>
                      <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-resort-muted">
                        Guest Name
                      </th>
                      <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-resort-muted">
                        Total Stays
                      </th>
                      <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-resort-muted">
                        Room Nights
                      </th>
                      <th className="px-4 py-3 text-right font-semibold uppercase tracking-wider text-resort-muted">
                        Last Stay
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {topGuests.map((guest, idx) => (
                      <tr
                        key={guest.guestId}
                        className="border-b border-resort-sand last:border-0 hover:bg-resort-ivory/30 transition-colors"
                      >
                        <td className="px-4 py-3 text-center font-mono font-bold text-resort-gold">
                          {idx + 1}
                        </td>
                        <td className="px-4 py-3 font-semibold text-resort-charcoal">{guest.guestName}</td>
                        <td className="px-4 py-3 text-center font-mono text-resort-charcoal-text">
                          {guest.stayCount}
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-resort-charcoal-text">
                          {guest.roomNights}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-resort-charcoal-text">
                          {guest.lastStayDate
                            ? new Date(guest.lastStayDate).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ReportSection>
          )}
        </>
      )}
    </div>
  );
}
