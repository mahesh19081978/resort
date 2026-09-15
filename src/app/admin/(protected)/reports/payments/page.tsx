import { requireAuth } from '@/lib/auth/auth';
import { fetchPaymentReport, fetchPaymentDetails } from '@/actions/report/index';
import { formatCurrency } from '@/lib/utils';
import { ReportFilter } from '../components/report-filter';
import { ReportKpi } from '../components/report-kpi';
import { ReportChart } from '../components/report-chart';
import { ReportSection } from '../components/report-section';
import { ReportTable } from '../components/report-table';
import {
  CreditCard,
  CheckCircle,
  Clock,
  XCircle,
  RotateCcw,
  Wallet,
  Hash,
  TrendingUp,
  Banknote,
  ArrowDownToLine,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ period?: string; start?: string; end?: string }>;
}

export default async function PaymentsReportPage({ searchParams }: PageProps) {
  await requireAuth();
  const params = await searchParams;
  const period = params.period || 'this-month';

  let report: Awaited<ReturnType<typeof fetchPaymentReport>> | null = null;
  let reportError: string | null = null;

  try {
    report = await fetchPaymentReport({
      period,
      start: params.start,
      end: params.end,
    });
  } catch (e: any) {
    reportError = e?.message || 'Failed to load payment report data.';
  }

  if (reportError) {
    return (
      <div className="space-y-6 pb-12">
        <div className="border-b border-neutral-200 pb-5">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-resort-charcoal">
              Payments & Collections Report
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
  const byMethod = report!.byMethod;
  const byContext = report!.byContext;

  const trendCollections = trend.map((t) => ({ label: t.label, value: t.collections }));
  const trendRefunds = trend.map((t) => ({ label: t.label, value: t.refunds }));

  let details: Awaited<ReturnType<typeof fetchPaymentDetails>> | null = null;
  try {
    details = await fetchPaymentDetails({ period, start: params.start, end: params.end, page: 1, pageSize: 15 });
  } catch {
    // detail load failure is non-fatal
  }

  const statusMap: Record<string, { label: string; className: string }> = {
    SUCCESS: { label: 'Success', className: 'bg-emerald-100 text-emerald-800' },
    PENDING: { label: 'Pending', className: 'bg-amber-100 text-amber-800' },
    FAILED: { label: 'Failed', className: 'bg-red-100 text-red-800' },
    REFUNDED: { label: 'Refunded', className: 'bg-blue-100 text-blue-800' },
    PARTIALLY_REFUNDED: { label: 'Partial Refund', className: 'bg-indigo-100 text-indigo-800' },
    VOIDED: { label: 'Voided', className: 'bg-neutral-100 text-neutral-600' },
  };

  const contextLabels: Record<string, string> = {
    RESERVATION_ADVANCE: 'Reservation Advance',
    FOLIO_SETTLEMENT: 'Folio Settlement',
    RESTAURANT_BILL: 'Restaurant Bill',
    VENDOR_PAYMENT: 'Vendor Payment',
    DIRECT_SERVICE: 'Direct Service',
  };

  const detailColumns = [
    { header: 'Payment #', accessorKey: 'paymentNumber', className: 'font-mono font-semibold' },
    { header: 'Amount', accessorKey: 'amountFormatted', className: 'text-right font-mono' },
    { header: 'Method', accessorKey: 'methodFormatted', className: 'capitalize' },
    { header: 'Context', accessorKey: 'contextFormatted' },
    { header: 'Status', accessorKey: 'statusFormatted' },
    { header: 'Reference', accessorKey: 'referenceFormatted', className: 'font-mono text-xs' },
    { header: 'Date', accessorKey: 'dateFormatted' },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="border-b border-neutral-200 pb-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-resort-charcoal">
              Payments & Collections Report
            </h1>
            <p className="text-xs text-resort-stone mt-1.5">
              Transaction volumes, collections, refunds, and payment method breakdown.
            </p>
          </div>
          <ReportFilter currentPeriod={period} basePath="/admin/reports/payments" />
        </div>
      </div>

      {!report!.hasData ? (
        <div className="p-8 text-center">
          <CreditCard className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
          <p className="text-sm text-resort-stone font-medium">No payment data for the selected period.</p>
          <p className="text-xs text-neutral-400 mt-1">Try selecting a different date range.</p>
        </div>
      ) : (
        <>
          {/* KPI Cards - Row 1 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <ReportKpi
              label="Successful"
              value={formatCurrency(s.totalSuccessful.toNumber())}
              subtitle="Completed payments"
              icon={<CheckCircle className="w-4 h-4" />}
              variant="success"
            />
            <ReportKpi
              label="Pending"
              value={formatCurrency(s.totalPending.toNumber())}
              subtitle="Awaiting confirmation"
              icon={<Clock className="w-4 h-4" />}
              variant="warning"
            />
            <ReportKpi
              label="Failed"
              value={formatCurrency(s.totalFailed.toNumber())}
              subtitle="Failed transactions"
              icon={<XCircle className="w-4 h-4" />}
              variant="danger"
            />
            <ReportKpi
              label="Refunded"
              value={formatCurrency(s.totalRefunded.toNumber())}
              subtitle="Processed refunds"
              icon={<RotateCcw className="w-4 h-4" />}
              variant="danger"
            />
            <ReportKpi
              label="Net Collections"
              value={formatCurrency(s.netCollections.toNumber())}
              subtitle="Success minus refunds"
              icon={<Wallet className="w-4 h-4" />}
              variant="success"
            />
            <ReportKpi
              label="Total Transactions"
              value={s.totalTransactions.toLocaleString()}
              subtitle={`${s.successfulTransactions} successful`}
              icon={<Hash className="w-4 h-4" />}
            />
          </div>

          {/* Payment Trend Chart */}
          <ReportChart
            title="Payment Trend"
            data={[trendCollections, trendRefunds]}
            series={[
              { key: 'collections', color: '#173B2F', label: 'Collections' },
              { key: 'refunds', color: '#C6A15B', label: 'Refunds' },
            ]}
            height={280}
          />

          {/* By Method & By Context */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* By Method */}
            <ReportSection title="By Payment Method" description="Transaction breakdown by payment method">
              {byMethod.length > 0 ? (
                <div className="space-y-3 pt-2">
                  {byMethod
                    .sort((a, b) => b.amount - a.amount)
                    .map((m) => (
                      <div key={m.method} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-resort-charcoal capitalize">
                            {m.method}
                          </span>
                          <div className="flex items-center gap-3">
                            <span className="font-mono font-semibold text-resort-forest">
                              {formatCurrency(m.amount)}
                            </span>
                            <span className="text-resort-muted w-12 text-right">{m.count} txns</span>
                          </div>
                        </div>
                        <div className="h-2 bg-resort-sand/50 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-resort-forest rounded-full transition-all"
                            style={{
                              width: `${s.totalSuccessful.toNumber() > 0 ? Math.min((m.amount / s.totalSuccessful.toNumber()) * 100, 100) : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="p-6 text-center text-resort-muted text-xs">No payment method data available.</div>
              )}
            </ReportSection>

            {/* By Context */}
            <ReportSection title="By Payment Context" description="Where payments were collected from">
              {byContext.length > 0 ? (
                <div className="space-y-3 pt-2">
                  {byContext
                    .sort((a, b) => b.amount - a.amount)
                    .map((ctx) => (
                      <div key={ctx.context} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-resort-charcoal">{ctx.context}</span>
                          <div className="flex items-center gap-3">
                            <span className="font-mono font-semibold text-resort-forest">
                              {formatCurrency(ctx.amount)}
                            </span>
                            <span className="text-resort-muted w-12 text-right">{ctx.count} txns</span>
                          </div>
                        </div>
                        <div className="h-2 bg-resort-sand/50 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-resort-gold rounded-full transition-all"
                            style={{
                              width: `${s.totalSuccessful.toNumber() > 0 ? Math.min((ctx.amount / s.totalSuccessful.toNumber()) * 100, 100) : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="p-6 text-center text-resort-muted text-xs">No payment context data available.</div>
              )}
            </ReportSection>
          </div>

          {/* Detail Table */}
          {details && details.rows.length > 0 && (
            <ReportSection title="Payment Details" description="Individual payment transactions in period">
              <ReportTable
                columns={detailColumns}
                rows={details.rows.map((r) => ({
                  paymentNumber: r.paymentNumber || '—',
                  amountFormatted: formatCurrency(r.amount.toNumber ? r.amount.toNumber() : Number(r.amount)),
                  methodFormatted: (r.method || '—').replace(/_/g, ' '),
                  contextFormatted: contextLabels[r.context] || r.context,
                  statusFormatted: r.status,
                  referenceFormatted: r.reservation?.reservationNumber || r.folio?.folioNumber || r.restaurantBill?.billNumber || '—',
                  dateFormatted: new Date(r.paymentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
                }))}
                pagination={details.pagination}
                emptyMessage="No payment records found."
              />
            </ReportSection>
          )}
        </>
      )}
    </div>
  );
}
