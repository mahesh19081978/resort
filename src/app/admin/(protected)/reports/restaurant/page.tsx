import { requireAuth } from '@/lib/auth/auth';
import { fetchRestaurantReport, fetchRestaurantDetails } from '@/actions/report/index';
import { formatCurrency } from '@/lib/utils';
import { ReportFilter } from '../components/report-filter';
import { ReportKpi } from '../components/report-kpi';
import { ReportChart } from '../components/report-chart';
import { ReportSection } from '../components/report-section';
import { ReportTable } from '../components/report-table';
import {
  UtensilsCrossed,
  Receipt,
  TrendingUp,
  Coffee,
  ShoppingBag,
  Hotel,
  Wallet,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ period?: string; start?: string; end?: string }>;
}

export default async function RestaurantReportPage({ searchParams }: PageProps) {
  await requireAuth();
  const params = await searchParams;
  const period = params.period || 'this-month';

  let report: Awaited<ReturnType<typeof fetchRestaurantReport>> | null = null;
  let reportError: string | null = null;

  try {
    report = await fetchRestaurantReport({
      period,
      start: params.start,
      end: params.end,
    });
  } catch (e: any) {
    reportError = e?.message || 'Failed to load restaurant report data.';
  }

  if (reportError) {
    return (
      <div className="space-y-6 pb-12">
        <div className="border-b border-neutral-200 pb-5">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-resort-charcoal">
              Restaurant & F&B Report
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
  const topDishes = report!.topDishes;
  const salesByCategory = report!.salesByCategory;

  const trendSales = trend.map((t) => ({ label: t.label, value: t.sales }));
  const trendOrders = trend.map((t) => ({ label: t.label, value: t.orderCount }));

  const totalRevNum = s.totalRevenue.toNumber();

  let details: Awaited<ReturnType<typeof fetchRestaurantDetails>> | null = null;
  try {
    details = await fetchRestaurantDetails({ period, start: params.start, end: params.end, page: 1, pageSize: 15 });
  } catch {
    // detail load failure is non-fatal
  }

  const detailColumns = [
    { header: 'Bill #', accessorKey: 'billNumber', className: 'font-mono font-semibold' },
    { header: 'Order Type', accessorKey: 'orderTypeFormatted' },
    { header: 'Restaurant', accessorKey: 'restaurantName' },
    { header: 'Amount', accessorKey: 'amountFormatted', className: 'text-right font-mono' },
    { header: 'Tax', accessorKey: 'taxFormatted', className: 'text-right font-mono' },
    { header: 'Status', accessorKey: 'statusFormatted' },
    { header: 'Date', accessorKey: 'dateFormatted' },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="border-b border-neutral-200 pb-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-resort-charcoal">
              Restaurant & F&B Report
            </h1>
            <p className="text-xs text-resort-stone mt-1.5">
              Revenue, orders, top dishes, and sales breakdown across all outlets.
            </p>
          </div>
          <ReportFilter currentPeriod={period} basePath="/admin/reports/restaurant" />
        </div>
      </div>

      {!report!.hasData ? (
        <div className="p-8 text-center">
          <UtensilsCrossed className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
          <p className="text-sm text-resort-stone font-medium">No restaurant data for the selected period.</p>
          <p className="text-xs text-neutral-400 mt-1">Try selecting a different date range.</p>
        </div>
      ) : (
        <>
          {/* KPI Cards - Row 1 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <ReportKpi
              label="Total Revenue"
              value={formatCurrency(s.totalRevenue.toNumber())}
              subtitle="Settled & room-charged bills"
              icon={<Receipt className="w-4 h-4" />}
              variant="success"
            />
            <ReportKpi
              label="Total Orders"
              value={s.totalOrders.toLocaleString()}
              subtitle="Finalized orders in period"
              icon={<UtensilsCrossed className="w-4 h-4" />}
            />
            <ReportKpi
              label="Avg Order Value"
              value={s.averageOrderValue ? formatCurrency(s.averageOrderValue.toNumber()) : '—'}
              subtitle="Revenue ÷ orders"
              icon={<TrendingUp className="w-4 h-4" />}
            />
            <ReportKpi
              label="POS Collections"
              value={formatCurrency(s.posCollections.toNumber())}
              subtitle="Payments at POS"
              icon={<Wallet className="w-4 h-4" />}
            />
          </div>

          {/* KPI Cards - Row 2: Order Type Breakdown */}
          <div className="grid grid-cols-3 gap-4">
            <ReportKpi
              label="Dine-In Sales"
              value={formatCurrency(s.dineInSales.toNumber())}
              subtitle={`${s.dineInCount} orders`}
              icon={<Coffee className="w-4 h-4" />}
            />
            <ReportKpi
              label="Take-Away Sales"
              value={formatCurrency(s.takeawaySales.toNumber())}
              subtitle={`${s.takeawayCount} orders`}
              icon={<ShoppingBag className="w-4 h-4" />}
            />
            <ReportKpi
              label="Room Service Sales"
              value={formatCurrency(s.roomServiceSales.toNumber())}
              subtitle={`${s.roomServiceCount} orders`}
              icon={<Hotel className="w-4 h-4" />}
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sales Trend */}
            <ReportChart
              title="Sales Trend"
              data={[trendSales]}
              series={[
                { key: 'sales', color: '#173B2F', label: 'Sales' },
              ]}
              height={280}
            />

            {/* Order Type Breakdown */}
            <ReportSection title="Order Type Breakdown" description="Sales distribution by order channel">
              <div className="space-y-3 pt-2">
                {salesByCategory
                  .filter((cat) => cat.amount > 0)
                  .map((cat) => (
                    <div key={cat.category} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-resort-charcoal">{cat.category}</span>
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-semibold text-resort-forest">
                            {formatCurrency(cat.amount)}
                          </span>
                          <span className="text-resort-muted w-12 text-right">{cat.percentage}%</span>
                        </div>
                      </div>
                      <div className="h-2 bg-resort-sand/50 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-resort-gold rounded-full transition-all"
                          style={{ width: `${Math.min(cat.percentage, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
              </div>
            </ReportSection>
          </div>

          {/* Top Selling Dishes */}
          {topDishes.length > 0 && (
            <ReportSection title="Top Selling Dishes" description="Best performing menu items by quantity sold">
              <div className="overflow-x-auto pt-2">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-resort-sand bg-resort-ivory/50">
                      <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-resort-muted w-12">
                        Rank
                      </th>
                      <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-resort-muted">
                        Dish Name
                      </th>
                      <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-resort-muted">
                        Category
                      </th>
                      <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-resort-muted">
                        Qty Sold
                      </th>
                      <th className="px-4 py-3 text-right font-semibold uppercase tracking-wider text-resort-muted">
                        Sales Value
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {topDishes.map((dish) => (
                      <tr
                        key={dish.rank}
                        className="border-b border-resort-sand last:border-0 hover:bg-resort-ivory/30 transition-colors"
                      >
                        <td className="px-4 py-3 text-center font-mono font-bold text-resort-gold">
                          {dish.rank}
                        </td>
                        <td className="px-4 py-3 font-semibold text-resort-charcoal">{dish.name}</td>
                        <td className="px-4 py-3 text-resort-charcoal-text">{dish.category}</td>
                        <td className="px-4 py-3 text-center font-mono text-resort-charcoal-text">
                          {dish.quantitySold.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-emerald-800">
                          {formatCurrency(dish.salesValue.toNumber())}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ReportSection>
          )}

          {/* Sales by Category Breakdown */}
          {salesByCategory.length > 0 && (
            <ReportSection title="Sales by Category" description="Revenue contribution by order type">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                {salesByCategory.map((cat) => (
                  <div
                    key={cat.category}
                    className="p-4 bg-resort-ivory/50 rounded-lg border border-resort-sand text-center"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-resort-muted">
                      {cat.category}
                    </p>
                    <p className="text-xl font-bold font-mono text-resort-charcoal mt-2">
                      {formatCurrency(cat.amount)}
                    </p>
                    <div className="mt-2 h-2 bg-resort-sand/50 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-resort-forest rounded-full transition-all"
                        style={{ width: `${Math.min(cat.percentage, 100)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-resort-muted mt-1.5">{cat.percentage}% of total revenue</p>
                  </div>
                ))}
              </div>
            </ReportSection>
          )}

          {/* Detail Table */}
          {details && details.rows.length > 0 && (
            <ReportSection title="Bill Details" description="Individual restaurant bills in period">
              <ReportTable
                columns={detailColumns}
                rows={details.rows.map((r) => {
                  const typeMap: Record<string, string> = {
                    DINE_IN: 'Dine-In',
                    TAKE_AWAY: 'Take-Away',
                    ROOM_SERVICE: 'Room Service',
                  };
                  const orderType = r.order?.orderType || '—';
                  return {
                    billNumber: r.billNumber || '—',
                    orderTypeFormatted: typeMap[orderType] || orderType,
                    restaurantName: r.order?.restaurant?.name || '—',
                    amountFormatted: formatCurrency(r.totalAmount.toNumber ? r.totalAmount.toNumber() : Number(r.totalAmount)),
                    taxFormatted: formatCurrency(r.taxAmount.toNumber ? r.taxAmount.toNumber() : Number(r.taxAmount)),
                    statusFormatted: r.status,
                    dateFormatted: new Date(r.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
                  };
                })}
                pagination={details.pagination}
                emptyMessage="No bill records found."
              />
            </ReportSection>
          )}
        </>
      )}
    </div>
  );
}
