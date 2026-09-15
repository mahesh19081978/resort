import { requireAuth } from '@/lib/auth/auth';
import { fetchInventoryReport, fetchInventoryMovements } from '@/actions/report/index';
import { formatCurrency } from '@/lib/utils';
import { ReportFilter } from '../components/report-filter';
import { ReportKpi } from '../components/report-kpi';
import { ReportSection } from '../components/report-section';
import { ReportTable } from '../components/report-table';
import { Badge } from '@/components/ui/badge';
import {
  Package,
  IndianRupee,
  AlertTriangle,
  XCircle,
  Store,
  ArrowLeftRight,
  Warehouse,
  Filter,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{
    period?: string;
    start?: string;
    end?: string;
    movementType?: string;
    storeId?: string;
  }>;
}

export default async function InventoryReportPage({ searchParams }: PageProps) {
  await requireAuth();
  const params = await searchParams;
  const period = params.period || 'this-month';

  let report: Awaited<ReturnType<typeof fetchInventoryReport>> | null = null;
  let reportError: string | null = null;

  try {
    report = await fetchInventoryReport({
      period,
      start: params.start,
      end: params.end,
    });
  } catch (e: any) {
    reportError = e?.message || 'Failed to load inventory report data.';
  }

  if (reportError) {
    return (
      <div className="space-y-6 pb-12">
        <div className="border-b border-neutral-200 pb-5">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-resort-charcoal">
              Inventory Report
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
  const byStore = report!.byStore;
  const movementSummary = report!.movementSummary;
  const lowStockItems = report!.lowStockItems;

  let movements: Awaited<ReturnType<typeof fetchInventoryMovements>> | null = null;
  try {
    movements = await fetchInventoryMovements({
      period,
      start: params.start,
      end: params.end,
      page: 1,
      pageSize: 15,
      movementType: params.movementType,
      storeId: params.storeId,
    });
  } catch {
    // movement load failure is non-fatal
  }

  const movementColumns = [
    { header: 'Movement #', accessorKey: 'movementNumber', className: 'font-mono font-semibold' },
    { header: 'Type', accessorKey: 'typeFormatted' },
    { header: 'Item', accessorKey: 'itemName' },
    { header: 'Store', accessorKey: 'storeName' },
    { header: 'Quantity', accessorKey: 'quantityFormatted', className: 'text-right font-mono' },
    { header: 'Unit Cost', accessorKey: 'unitCostFormatted', className: 'text-right font-mono' },
    { header: 'Balance After', accessorKey: 'balanceAfterFormatted', className: 'text-right font-mono' },
    { header: 'Date', accessorKey: 'dateFormatted' },
  ];

  const movementTypeOptions = [
    { value: '', label: 'All Types' },
    { value: 'PURCHASE', label: 'Purchase' },
    { value: 'CONSUMPTION', label: 'Consumption' },
    { value: 'TRANSFER', label: 'Transfer' },
    { value: 'ADJUSTMENT', label: 'Adjustment' },
    { value: 'RETURN', label: 'Return' },
    { value: 'DAMAGE', label: 'Damage' },
    { value: 'OPENING_STOCK', label: 'Opening Stock' },
  ];

  const storeOptions = byStore.map((st) => ({ value: st.store, label: st.store }));

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="border-b border-neutral-200 pb-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-resort-charcoal">
              Inventory Report
            </h1>
            <p className="text-xs text-resort-stone mt-1.5">
              Stock levels, valuations, movements, and low-stock alerts across all stores.
            </p>
          </div>
          <ReportFilter currentPeriod={period} basePath="/admin/reports/inventory" />
        </div>
      </div>

      {!report!.hasData ? (
        <div className="p-8 text-center">
          <Package className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
          <p className="text-sm text-resort-stone font-medium">No inventory data for the selected period.</p>
          <p className="text-xs text-neutral-400 mt-1">Try selecting a different date range.</p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <ReportKpi
              label="Total Items"
              value={s.totalItems.toLocaleString()}
              subtitle="Active inventory items"
              icon={<Package className="w-4 h-4" />}
            />
            <ReportKpi
              label="Stock Value"
              value={formatCurrency(s.totalStockValue.toNumber())}
              subtitle="Current WAC valuation"
              icon={<IndianRupee className="w-4 h-4" />}
              variant="success"
            />
            <ReportKpi
              label="Low Stock"
              value={s.lowStockItems.toLocaleString()}
              subtitle="Below reorder level"
              icon={<AlertTriangle className="w-4 h-4" />}
              variant={s.lowStockItems > 0 ? 'warning' : 'default'}
            />
            <ReportKpi
              label="Out of Stock"
              value={s.outOfStockItems.toLocaleString()}
              subtitle="Zero quantity items"
              icon={<XCircle className="w-4 h-4" />}
              variant={s.outOfStockItems > 0 ? 'danger' : 'default'}
            />
            <ReportKpi
              label="Total Stores"
              value={s.totalStores.toLocaleString()}
              subtitle="Active store locations"
              icon={<Store className="w-4 h-4" />}
            />
            <ReportKpi
              label="Movements"
              value={s.movementsInPeriod.toLocaleString()}
              subtitle="Stock movements in period"
              icon={<ArrowLeftRight className="w-4 h-4" />}
            />
          </div>

          {/* Stock by Store & Movement Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Stock by Store */}
            <ReportSection title="Stock by Store" description="Item count and valuation per store">
              {byStore.length > 0 ? (
                <div className="overflow-x-auto pt-2">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-resort-sand bg-resort-ivory/50">
                        <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-resort-muted">
                          Store
                        </th>
                        <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-resort-muted">
                          Items
                        </th>
                        <th className="px-4 py-3 text-right font-semibold uppercase tracking-wider text-resort-muted">
                          Value
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {byStore.map((st) => (
                        <tr
                          key={st.store}
                          className="border-b border-resort-sand last:border-0 hover:bg-resort-ivory/30 transition-colors"
                        >
                          <td className="px-4 py-3 font-semibold text-resort-charcoal">
                            <div className="flex items-center gap-2">
                              <Warehouse className="w-3.5 h-3.5 text-resort-muted" />
                              {st.store}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center font-mono text-resort-charcoal-text">
                            {st.itemCount}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-emerald-800">
                            {formatCurrency(st.totalValue.toNumber())}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-6 text-center text-resort-muted text-xs">No store data available.</div>
              )}
            </ReportSection>

            {/* Movement Summary */}
            <ReportSection title="Movement Summary" description="Stock movements by type in period">
              {movementSummary.length > 0 ? (
                <div className="space-y-3 pt-2">
                  {movementSummary.map((m) => (
                    <div key={m.movementType} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-resort-charcoal capitalize">{m.movementType}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-resort-muted">{m.count} transactions</span>
                          <span className="font-mono font-semibold text-resort-forest">
                            {m.totalQuantity.toLocaleString()} units
                          </span>
                        </div>
                      </div>
                      <div className="h-2 bg-resort-sand/50 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-resort-forest rounded-full transition-all"
                          style={{
                            width: `${s.movementsInPeriod > 0 ? Math.min((m.count / s.movementsInPeriod) * 100, 100) : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-resort-muted text-xs">No movements recorded in this period.</div>
              )}
            </ReportSection>
          </div>

          {/* Low Stock Alert */}
          {lowStockItems.length > 0 && (
            <ReportSection
              title="Low Stock Alert"
              description="Items at or below reorder level requiring attention"
              action={
                <Badge variant="warning">
                  {lowStockItems.length} item{lowStockItems.length !== 1 ? 's' : ''} below reorder
                </Badge>
              }
            >
              <div className="overflow-x-auto pt-2">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-resort-sand bg-resort-ivory/50">
                      <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-resort-muted">
                        Item
                      </th>
                      <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-resort-muted">
                        Store
                      </th>
                      <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-resort-muted">
                        Current Stock
                      </th>
                      <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-resort-muted">
                        Reorder Level
                      </th>
                      <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-resort-muted">
                        Unit
                      </th>
                      <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-resort-muted">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowStockItems.map((item, idx) => {
                      const current = item.currentStock.toNumber();
                      const reorder = item.reorderLevel.toNumber();
                      const isOut = current <= 0;
                      return (
                        <tr
                          key={`${item.itemName}-${item.store}-${idx}`}
                          className="border-b border-resort-sand last:border-0 hover:bg-resort-ivory/30 transition-colors"
                        >
                          <td className="px-4 py-3 font-semibold text-resort-charcoal">{item.itemName}</td>
                          <td className="px-4 py-3 text-resort-charcoal-text">{item.store}</td>
                          <td className="px-4 py-3 text-center font-mono">
                            <span className={isOut ? 'text-red-600 font-bold' : 'text-amber-700 font-semibold'}>
                              {current.toLocaleString()}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center font-mono text-resort-charcoal-text">
                            {reorder.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-center text-resort-charcoal-text">{item.unit}</td>
                          <td className="px-4 py-3 text-center">
                            <Badge variant={isOut ? 'danger' : 'warning'}>
                              {isOut ? 'Out of Stock' : 'Low Stock'}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </ReportSection>
          )}

          {/* Movement Detail Table */}
          {movements && movements.rows.length > 0 && (
            <ReportSection title="Movement Details" description="Individual stock movements in period">
              {/* Inline movement filters */}
              <form className="flex flex-wrap items-center gap-3 mb-4 pt-2">
                <div className="flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-resort-muted" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-resort-muted">Filters:</span>
                </div>
                <select
                  name="movementType"
                  defaultValue={params.movementType || ''}
                  className="text-xs border border-neutral-200 rounded px-2 py-1.5 text-neutral-800 bg-white"
                >
                  {movementTypeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <select
                  name="storeId"
                  defaultValue={params.storeId || ''}
                  className="text-xs border border-neutral-200 rounded px-2 py-1.5 text-neutral-800 bg-white"
                >
                  <option value="">All Stores</option>
                  {storeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="text-xs bg-resort-gold hover:bg-resort-sand text-white px-3 py-1.5 rounded font-medium transition-colors"
                >
                  Apply
                </button>
              </form>

              <ReportTable
                columns={movementColumns}
                rows={movements.rows.map((r) => {
                  const qty = r.quantity.toNumber ? r.quantity.toNumber() : Number(r.quantity);
                  const type = (r.movementType || '').replace(/_/g, ' ');
                  return {
                    movementNumber: r.movementNumber || '—',
                    typeFormatted: type,
                    itemName: r.item?.name || '—',
                    storeName: r.store?.name || '—',
                    quantityFormatted: `${qty > 0 ? '+' : ''}${qty.toLocaleString()}`,
                    unitCostFormatted: formatCurrency(r.unitCost.toNumber ? r.unitCost.toNumber() : Number(r.unitCost)),
                    balanceAfterFormatted: (r.balanceAfter.toNumber ? r.balanceAfter.toNumber() : Number(r.balanceAfter)).toLocaleString(),
                    dateFormatted: new Date(r.movementDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
                  };
                })}
                pagination={movements.pagination}
                emptyMessage="No movement records found."
              />
            </ReportSection>
          )}
        </>
      )}
    </div>
  );
}
