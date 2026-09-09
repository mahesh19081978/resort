import { requireAuth } from '@/lib/auth/auth';
import { fetchAuditReport, fetchAuditLog } from '@/actions/report/index';
import { ReportFilter } from '../components/report-filter';
import { ReportKpi } from '../components/report-kpi';
import { ReportSection } from '../components/report-section';
import { ReportTable } from '../components/report-table';
import {
  Shield,
  Users,
  FileText,
  Activity,
  Calendar,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ period?: string; start?: string; end?: string }>;
}

export default async function AuditReportPage({ searchParams }: PageProps) {
  await requireAuth();
  const params = await searchParams;
  const period = params.period || 'this-month';

  let report: Awaited<ReturnType<typeof fetchAuditReport>> | null = null;
  let reportError: string | null = null;

  try {
    report = await fetchAuditReport({
      period,
      start: params.start,
      end: params.end,
    });
  } catch (e: any) {
    reportError = e?.message || 'Failed to load audit report data.';
  }

  if (reportError) {
    return (
      <div className="space-y-6 pb-12">
        <div className="border-b border-neutral-200 pb-5">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-resort-charcoal">
              Audit & Activity Report
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
  const topActions = s.topActions;

  let logData: Awaited<ReturnType<typeof fetchAuditLog>> | null = null;
  try {
    logData = await fetchAuditLog({ period, start: params.start, end: params.end, page: 1, pageSize: 25 });
  } catch {
    // detail load failure is non-fatal
  }

  const logColumns = [
    { header: 'Timestamp', accessorKey: 'timestampFormatted', className: 'whitespace-nowrap' },
    { header: 'User', accessorKey: 'userFormatted' },
    { header: 'Action', accessorKey: 'action' },
    { header: 'Entity', accessorKey: 'entity' },
    { header: 'Entity ID', accessorKey: 'entityId' },
    { header: 'Changes', accessorKey: 'changesFormatted' },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="border-b border-neutral-200 pb-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-resort-charcoal">
              Audit & Activity Report
            </h1>
            <p className="text-xs text-resort-stone mt-1.5">
              System activity log, user actions, entity changes, and audit trail.
            </p>
          </div>
          <ReportFilter currentPeriod={period} basePath="/admin/reports/audit" />
        </div>
      </div>

      {!report!.hasData ? (
        <div className="p-8 text-center">
          <Shield className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
          <p className="text-sm text-resort-stone font-medium">No audit data for the selected period.</p>
          <p className="text-xs text-neutral-400 mt-1">Try selecting a different date range.</p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <ReportKpi
              label="Total Events"
              value={s.totalEvents.toLocaleString()}
              subtitle="Audit log entries"
              icon={<Activity className="w-4 h-4" />}
              variant="success"
            />
            <ReportKpi
              label="Unique Users"
              value={s.uniqueUsers.toLocaleString()}
              subtitle="Active user accounts"
              icon={<Users className="w-4 h-4" />}
            />
            <ReportKpi
              label="Unique Entities"
              value={s.uniqueEntities.toLocaleString()}
              subtitle="Affected entity types"
              icon={<FileText className="w-4 h-4" />}
            />
          </div>

          {/* Top Actions */}
          {topActions.length > 0 && (
            <ReportSection title="Top Actions" description="Most frequently performed actions">
              <div className="overflow-x-auto pt-2">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-resort-sand bg-resort-ivory/50">
                      <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-resort-muted w-12">
                        #
                      </th>
                      <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-resort-muted">
                        Action
                      </th>
                      <th className="px-4 py-3 text-right font-semibold uppercase tracking-wider text-resort-muted">
                        Count
                      </th>
                      <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-resort-muted">
                        Distribution
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {topActions.map((a, idx) => {
                      const maxCount = topActions[0]?.count || 1;
                      const pct = Math.round((a.count / maxCount) * 100);
                      return (
                        <tr
                          key={a.action}
                          className="border-b border-resort-sand last:border-0 hover:bg-resort-ivory/30 transition-colors"
                        >
                          <td className="px-4 py-3 text-center font-mono font-bold text-resort-gold">
                            {idx + 1}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-resort-sand text-resort-charcoal-text capitalize">
                              {a.action}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-semibold text-resort-charcoal">
                            {a.count.toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-resort-sand/50 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-resort-forest rounded-full transition-all"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-resort-muted w-8 text-right">
                                {Math.round((a.count / s.totalEvents) * 1000) / 10}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </ReportSection>
          )}

          {/* Audit Log Detail Table */}
          {logData && logData.rows.length > 0 && (
            <ReportSection title="Audit Log" description="Detailed audit trail with entity changes">
              <ReportTable
                columns={logColumns}
                rows={logData.rows.map((r) => {
                  let changesStr = '—';
                  if (r.changes) {
                    const parts: string[] = [];
                    if (r.changes.old && Object.keys(r.changes.old).length > 0) {
                      parts.push(`Old:\n${JSON.stringify(r.changes.old, null, 2)}`);
                    }
                    if (r.changes.new && Object.keys(r.changes.new).length > 0) {
                      parts.push(`New:\n${JSON.stringify(r.changes.new, null, 2)}`);
                    }
                    if (parts.length > 0) changesStr = parts.join('\n');
                  }
                  return {
                    timestampFormatted: new Date(r.timestamp).toLocaleString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    }),
                    userFormatted: `${r.userName} (${r.userRole})`,
                    action: r.action,
                    entity: r.entity,
                    entityId: r.entityId || '—',
                    changesFormatted: changesStr,
                  };
                })}
                pagination={logData.pagination}
                emptyMessage="No audit log entries found."
              />
            </ReportSection>
          )}
        </>
      )}
    </div>
  );
}
