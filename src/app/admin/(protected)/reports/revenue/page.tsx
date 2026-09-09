import { requireAuth } from '@/lib/auth/auth';
import { fetchRevenueReport, fetchRevenueDetails } from '@/actions/report/index';
import { formatCurrency } from '@/lib/utils';
import { ReportFilter } from '../components/report-filter';
import { ReportKpi } from '../components/report-kpi';
import { ReportChart } from '../components/report-chart';
import { ReportSection } from '../components/report-section';
import { ReportTable } from '../components/report-table';
import {
  CreditCard,
  BedDouble,
  UtensilsCrossed,
  Wrench,
  Percent,
  Receipt,
  TrendingUp,
  Banknote,
  ArrowDownToLine,
  Wallet,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ period?: string; start?: string; end?: string }>;
}

export default async function RevenueReportPage({ searchParams }: PageProps) {
  await requireAuth();
  const params = await searchParams;
  const period = params.period || 'this-month';

  let report: Awaited<ReturnType<typeof fetchRevenueReport>> | null = null;
  let reportError: string | null = null;

  try {
    report = await fetchRevenueReport({
      period,
      start: params.start,
      end: params.end,
    });
  } catch (e: any) {
    reportError = e?.message || 'Failed to load revenue report data.';
  }

  if (reportError) {
    return (
      <div className="space-y-6 pb-12">
        <div className="border-b border-neutral-200 pb-5">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-resort-charcoal">
              Revenue & Financial Report
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
  const byCategory = report!.byCategory;
  const byContext = report!.byPaymentContext;

  const trendLabels = trend.map((t) => t.label);
  const trendRoom = trend.map((t) => ({ label: t.label, value: t.roomRevenue }));
  const trendRest = trend.map((t) => ({ label: t.label, value: t.restaurantRevenue }));
  const trendOther = trend.map((t) => ({ label: t.label, value: t.otherRevenue }));

  const categoryLabels = byCategory.map((c) => c.category);
  const categoryAmounts = byCategory.map((c) => ({ label: c.category, value: c.amount }));

  const contextLabels = byContext.map((c) => c.context);
  const contextAmounts = byContext.map((c) => ({ label: c.context, value: c.amount }));

  let details: Awaited<ReturnType<typeof fetchRevenueDetails>> | null = null;
  try {
    details = await fetchRevenueDetails({ period, start: params.start, end: params.end, page: 1, pageSize: 15 });
  } catch {
    // detail load failure is non-fatal
  }

  const detailColumns = [
    { header: 'Date', accessorKey: 'dateFormatted' },
    { header: 'Type', accessorKey: 'type' },
    { header: 'Reference', accessorKey: 'reference' },
    { header: 'Description', accessorKey: 'description' },
    { header: 'Amount', accessorKey: 'amountFormatted', className: 'text-right font-mono' },
    { header: 'Tax', accessorKey: 'taxFormatted', className: 'text-right font-mono' },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="border-b border-neutral-200 pb-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-resort-charcoal">
              Revenue & Financial Report
            </h1>
            <p className="text-xs text-resort-stone mt-1.5">
              Comprehensive financial summary — revenue by source, collections, and payment breakdown.
            </p>
          </div>
          <ReportFilter currentPeriod={period} basePath="/admin/reports/revenue" />
        </div>
      </div>

      {!report!.hasData ? (
        <div className="p-8 text-center">
          <CreditCard className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
          <p className="text-sm text-resort-stone font-medium">No revenue data for the selected period.</p>
          <p className="text-xs text-neutral-400 mt-1">Try selecting a different date range.</p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <ReportKpi
              label="Total Revenue"
              value={formatCurrency(s.totalResortRevenue.toNumber())}
              subtitle="Rooms + Restaurant + Other"
              icon={<CreditCard className="w-4 h-4" />}
              variant="success"
            />
            <ReportKpi
              label="Room Revenue"
              value={formatCurrency(s.roomRevenue.toNumber())}
              subtitle="Folio room charges"
              icon={<BedDouble className="w-4 h-4" />}
            />
            <ReportKpi
              label="Restaurant Revenue"
              value={formatCurrency(s.restaurantRevenue.toNumber())}
              subtitle="Settled & room-charged bills"
              icon={<UtensilsCrossed className="w-4 h-4" />}
            />
            <ReportKpi
              label="Other Services"
              value={formatCurrency(s.otherServiceRevenue.toNumber())}
              subtitle="Laundry, extras, damages"
              icon={<Wrench className="w-4 h-4" />}
            />
            <ReportKpi
              label="Discounts"
              value={formatCurrency(s.discounts.toNumber())}
              subtitle="Credits & discounts applied"
              icon={<Percent className="w-4 h-4" />}
              variant="warning"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <ReportKpi
              label="Taxes"
              value={formatCurrency(s.taxes.toNumber())}
              subtitle="Room + restaurant taxes"
              icon={<Receipt className="w-4 h-4" />}
            />
            <ReportKpi
              label="Net Revenue"
              value={formatCurrency(s.netRevenue.toNumber())}
              subtitle="Revenue after discounts"
              icon={<TrendingUp className="w-4 h-4" />}
              variant="success"
            />
            <ReportKpi
              label="Collections"
              value={formatCurrency(s.totalCollections.toNumber())}
              subtitle="Total payment received"
              icon={<Banknote className="w-4 h-4" />}
            />
            <ReportKpi
              label="Refunds"
              value={formatCurrency(s.refunds.toNumber())}
              subtitle="Processed refunds"
              icon={<ArrowDownToLine className="w-4 h-4" />}
              variant="danger"
            />
            <ReportKpi
              label="Net Collections"
              value={formatCurrency(s.netCollections.toNumber())}
              subtitle="Collections minus refunds"
              icon={<Wallet className="w-4 h-4" />}
              variant="success"
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue Trend */}
            <ReportChart
              title="Revenue Trend"
              data={[trendRoom, trendRest, trendOther]}
              series={[
                { key: 'roomRevenue', color: '#173B2F', label: 'Room Revenue' },
                { key: 'restaurantRevenue', color: '#C6A15B', label: 'Restaurant Revenue' },
                { key: 'otherRevenue', color: '#65745B', label: 'Other Services' },
              ]}
              height={280}
            />

            {/* Revenue by Category */}
            <ReportSection title="Revenue by Category" description="Breakdown of revenue sources">
              <div className="space-y-3 pt-2">
                {byCategory.map((cat) => (
                  <div key={cat.category} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-resort-charcoal">{cat.category}</span>
                      <span className="font-mono font-semibold text-resort-forest">
                        {formatCurrency(cat.amount)}
                      </span>
                    </div>
                    <div className="h-2 bg-resort-sand/50 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-resort-forest rounded-full transition-all"
                        style={{ width: `${Math.min(cat.percentage, 100)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-resort-muted text-right">{cat.percentage}%</p>
                  </div>
                ))}
              </div>
            </ReportSection>
          </div>

          {/* Revenue by Payment Context */}
          {byContext.length > 0 && (
            <ReportSection title="Revenue by Payment Context" description="Where revenue was collected from">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                {byContext.map((ctx) => (
                  <div key={ctx.context} className="p-3 bg-resort-ivory/50 rounded-lg border border-resort-sand">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-resort-muted">{ctx.context}</p>
                    <p className="text-lg font-bold font-mono text-resort-charcoal mt-1">
                      {formatCurrency(ctx.amount)}
                    </p>
                    <p className="text-[10px] text-resort-muted mt-0.5">{ctx.percentage}% of total</p>
                  </div>
                ))}
              </div>
            </ReportSection>
          )}

          {/* Detail Table */}
          {details && details.rows.length > 0 && (
            <ReportSection title="Revenue Detail Lines" description="Individual revenue transactions in period">
              <ReportTable
                columns={detailColumns}
                rows={details.rows.map((r) => ({
                  dateFormatted: new Date(r.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
                  type: r.type,
                  reference: r.reference,
                  description: r.description,
                  amountFormatted: formatCurrency(r.amount.toNumber ? r.amount.toNumber() : Number(r.amount)),
                  taxFormatted: formatCurrency(r.tax.toNumber ? r.tax.toNumber() : Number(r.tax)),
                }))}
                pagination={details.pagination}
                emptyMessage="No detail records found."
              />
            </ReportSection>
          )}
        </>
      )}
    </div>
  );
}
