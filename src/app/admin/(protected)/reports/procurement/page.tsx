import { requireAuth } from '@/lib/auth/auth';
import { fetchProcurementReport } from '@/actions/report/index';
import { formatCurrency } from '@/lib/utils';
import { ReportFilter } from '../components/report-filter';
import { ReportKpi } from '../components/report-kpi';
import { ReportChart } from '../components/report-chart';
import { ReportSection } from '../components/report-section';
import {
  ShoppingCart,
  Clock,
  CheckCircle,
  Package,
  Receipt,
  Banknote,
  Wallet,
  AlertTriangle,
  Users,
  XCircle,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ period?: string; start?: string; end?: string }>;
}

export default async function ProcurementReportPage({ searchParams }: PageProps) {
  await requireAuth();
  const params = await searchParams;
  const period = params.period || 'this-month';

  let report: Awaited<ReturnType<typeof fetchProcurementReport>> | null = null;
  let reportError: string | null = null;

  try {
    report = await fetchProcurementReport({
      period,
      start: params.start,
      end: params.end,
    });
  } catch (e: any) {
    reportError = e?.message || 'Failed to load procurement report data.';
  }

  if (reportError) {
    return (
      <div className="space-y-6 pb-12">
        <div className="border-b border-neutral-200 pb-5">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-resort-charcoal">
              Procurement & Vendors Report
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
  const vendorOutstanding = report!.vendorOutstanding;

  const trendLabels = trend.map((t) => t.label);
  const trendPOs = trend.map((t) => ({ label: t.label, value: t.poCount }));
  const trendValue = trend.map((t) => ({ label: t.label, value: t.purchaseValue }));

  const poStatusBreakdown = [
    { status: 'Pending', count: s.pendingPOs, color: 'bg-amber-500' },
    { status: 'Completed', count: s.completedPOs, color: 'bg-emerald-500' },
    { status: 'Cancelled', count: s.cancelledPOs, color: 'bg-red-500' },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="border-b border-neutral-200 pb-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-resort-charcoal">
              Procurement & Vendors Report
            </h1>
            <p className="text-xs text-resort-stone mt-1.5">
              Purchase orders, GRNs, vendor billing, payments, and outstanding balances.
            </p>
          </div>
          <ReportFilter currentPeriod={period} basePath="/admin/reports/procurement" />
        </div>
      </div>

      {!report!.hasData ? (
        <div className="p-8 text-center">
          <ShoppingCart className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
          <p className="text-sm text-resort-stone font-medium">No procurement data for the selected period.</p>
          <p className="text-xs text-neutral-400 mt-1">Try selecting a different date range.</p>
        </div>
      ) : (
        <>
          {/* KPI Cards - Row 1: PO & GRN Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <ReportKpi
              label="Total POs"
              value={s.totalPOs.toLocaleString()}
              subtitle="Purchase orders in period"
              icon={<ShoppingCart className="w-4 h-4" />}
              variant="success"
            />
            <ReportKpi
              label="Pending POs"
              value={s.pendingPOs.toLocaleString()}
              subtitle="Awaiting fulfillment"
              icon={<Clock className="w-4 h-4" />}
              variant="warning"
            />
            <ReportKpi
              label="Completed POs"
              value={s.completedPOs.toLocaleString()}
              subtitle="Fully received"
              icon={<CheckCircle className="w-4 h-4" />}
              variant="success"
            />
            <ReportKpi
              label="Total GRNs"
              value={s.totalGRNs.toLocaleString()}
              subtitle="Goods receipt notes"
              icon={<Package className="w-4 h-4" />}
            />
            <ReportKpi
              label="Total Bills"
              value={s.totalBills.toLocaleString()}
              subtitle="Vendor bills received"
              icon={<Receipt className="w-4 h-4" />}
            />
          </div>

          {/* KPI Cards - Row 2: Financial Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <ReportKpi
              label="Total Purchase Value"
              value={formatCurrency(s.totalPurchaseValue.toNumber())}
              subtitle="Sum of all PO amounts"
              icon={<Banknote className="w-4 h-4" />}
              variant="success"
            />
            <ReportKpi
              label="Payments Made"
              value={formatCurrency(s.totalPaymentsMade.toNumber())}
              subtitle="Completed vendor payments"
              icon={<Wallet className="w-4 h-4" />}
              variant="success"
            />
            <ReportKpi
              label="Outstanding Balance"
              value={formatCurrency(s.outstandingVendorBalance.toNumber())}
              subtitle="Amount owed to vendors"
              icon={<AlertTriangle className="w-4 h-4" />}
              variant={s.outstandingVendorBalance.toNumber() > 0 ? 'danger' : 'default'}
            />
            <ReportKpi
              label="Total Vendors"
              value={s.totalVendors.toLocaleString()}
              subtitle="Active vendor accounts"
              icon={<Users className="w-4 h-4" />}
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* PO Trend */}
            <ReportChart
              title="Purchase Order Trend"
              data={[trendPOs]}
              series={[
                { key: 'poCount', color: '#173B2F', label: 'PO Count' },
              ]}
              height={280}
            />

            {/* PO Status Breakdown */}
            <ReportSection title="PO Status Breakdown" description="Purchase order status distribution">
              <div className="space-y-3 pt-2">
                {poStatusBreakdown
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
                            width: `${s.totalPOs > 0 ? Math.min((st.count / s.totalPOs) * 100, 100) : 0}%`,
                          }}
                        />
                      </div>
                      <p className="text-[10px] text-resort-muted text-right">
                        {s.totalPOs > 0 ? Math.round((st.count / s.totalPOs) * 1000) / 10 : 0}%
                      </p>
                    </div>
                  ))}
                {poStatusBreakdown.every((st) => st.count === 0) && (
                  <div className="p-6 text-center text-resort-muted text-xs">No PO status data available.</div>
                )}
              </div>
            </ReportSection>
          </div>

          {/* Vendor Outstanding Table */}
          {vendorOutstanding.length > 0 && (
            <ReportSection
              title="Vendor Outstanding Balances"
              description="Outstanding amounts owed to each vendor"
            >
              <div className="overflow-x-auto pt-2">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-resort-sand bg-resort-ivory/50">
                      <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-resort-muted">
                        Vendor
                      </th>
                      <th className="px-4 py-3 text-right font-semibold uppercase tracking-wider text-resort-muted">
                        Total Billed
                      </th>
                      <th className="px-4 py-3 text-right font-semibold uppercase tracking-wider text-resort-muted">
                        Total Paid
                      </th>
                      <th className="px-4 py-3 text-right font-semibold uppercase tracking-wider text-resort-muted">
                        Outstanding
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendorOutstanding.map((v) => (
                      <tr
                        key={v.vendorId}
                        className="border-b border-resort-sand last:border-0 hover:bg-resort-ivory/30 transition-colors"
                      >
                        <td className="px-4 py-3 font-semibold text-resort-charcoal">{v.vendorName}</td>
                        <td className="px-4 py-3 text-right font-mono text-resort-charcoal-text">
                          {formatCurrency(v.totalBilled.toNumber())}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-emerald-800">
                          {formatCurrency(v.totalPaid.toNumber())}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-red-700">
                          {formatCurrency(v.outstanding.toNumber())}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-resort-ivory/50 font-semibold">
                      <td className="px-4 py-3 text-resort-charcoal">Total</td>
                      <td className="px-4 py-3 text-right font-mono text-resort-charcoal-text">
                        {formatCurrency(vendorOutstanding.reduce((sum, v) => sum + v.totalBilled.toNumber(), 0))}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-800">
                        {formatCurrency(vendorOutstanding.reduce((sum, v) => sum + v.totalPaid.toNumber(), 0))}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-red-700">
                        {formatCurrency(vendorOutstanding.reduce((sum, v) => sum + v.outstanding.toNumber(), 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </ReportSection>
          )}

          {/* Empty vendor outstanding state */}
          {vendorOutstanding.length === 0 && (
            <ReportSection
              title="Vendor Outstanding Balances"
              description="Outstanding amounts owed to each vendor"
            >
              <div className="p-6 text-center">
                <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm text-resort-stone font-medium">All vendor bills are settled.</p>
                <p className="text-xs text-neutral-400 mt-1">No outstanding balances in this period.</p>
              </div>
            </ReportSection>
          )}
        </>
      )}
    </div>
  );
}
