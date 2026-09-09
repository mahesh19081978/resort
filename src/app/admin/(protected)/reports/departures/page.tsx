import { requireAuth } from '@/lib/auth/auth';
import { fetchDeparturesReport } from '@/actions/report/index';
import { formatCurrency } from '@/lib/utils';
import { ReportSection } from '../components/report-section';
import { Badge } from '@/components/ui/badge';
import { getBusinessDateNow } from '@/lib/frontdesk/arrivals';
import { Prisma } from '@prisma/client';
import { PlaneTakeoff, DollarSign, AlertCircle } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ start?: string }>;
}

function calculateFolioBalance(folio: {
  items: Array<{ amount: Prisma.Decimal }>;
  payments: Array<{ amount: Prisma.Decimal }>;
} | null): number {
  if (!folio) return 0;
  const totalCharges = folio.items.reduce(
    (sum, item) => sum + (item.amount?.toNumber?.() ?? Number(item.amount)),
    0
  );
  const totalPayments = folio.payments.reduce(
    (sum, payment) => sum + (payment.amount?.toNumber?.() ?? Number(payment.amount)),
    0
  );
  return totalCharges - totalPayments;
}

function getPaymentStatusLabel(balance: number): { label: string; variant: 'success' | 'warning' | 'danger' } {
  if (balance <= 0) return { label: 'Settled', variant: 'success' };
  if (balance > 0) return { label: 'Outstanding', variant: 'warning' };
  return { label: 'Credit', variant: 'danger' };
}

export default async function DeparturesReportPage({ searchParams }: PageProps) {
  await requireAuth();
  const params = await searchParams;
  const businessDate = params.start || getBusinessDateNow();

  let departures: Awaited<ReturnType<typeof fetchDeparturesReport>> = [];
  let departuresError: string | null = null;

  try {
    departures = await fetchDeparturesReport({ start: businessDate });
  } catch (e: any) {
    departuresError = e?.message || 'Failed to load departures data.';
  }

  const formattedDate = new Date(businessDate + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const totalFolioBalance = departures.reduce((sum, dep) => {
    const balance = calculateFolioBalance(dep.folio);
    return sum + balance;
  }, 0);

  const settledCount = departures.filter((dep) => calculateFolioBalance(dep.folio) <= 0).length;
  const outstandingCount = departures.filter((dep) => calculateFolioBalance(dep.folio) > 0).length;

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="border-b border-neutral-200 pb-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-resort-charcoal">
              Expected Departures
            </h1>
            <p className="text-xs text-resort-stone mt-1.5">
              Guests checking out on <span className="font-semibold text-resort-charcoal">{formattedDate}</span>
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

      {departuresError ? (
        <div className="p-6 bg-rose-50 text-rose-700 text-sm rounded-lg border border-rose-200">
          <p className="font-semibold">Error loading departures</p>
          <p className="mt-1 text-xs">{departuresError}</p>
        </div>
      ) : departures.length === 0 ? (
        <div className="p-8 text-center">
          <PlaneTakeoff className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
          <p className="text-sm text-resort-stone font-medium">No departures expected for this date</p>
          <p className="text-xs text-neutral-400 mt-1">No guests are scheduled to check out on {formattedDate}.</p>
        </div>
      ) : (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 bg-white rounded-lg border border-resort-sand shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-resort-muted">Total Departures</p>
              <p className="mt-2 text-2xl font-bold text-resort-charcoal font-display">{departures.length}</p>
            </div>
            <div className="p-4 bg-white rounded-lg border border-resort-sand shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-resort-muted">Settled</p>
              <p className="mt-2 text-2xl font-bold text-emerald-700 font-display">{settledCount}</p>
            </div>
            <div className="p-4 bg-white rounded-lg border border-resort-sand shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-resort-muted">Outstanding</p>
              <p className="mt-2 text-2xl font-bold text-amber-700 font-display">{outstandingCount}</p>
            </div>
            <div className="p-4 bg-white rounded-lg border border-resort-sand shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-resort-muted">Total Folio Balance</p>
              <p className={`mt-2 text-2xl font-bold font-display ${totalFolioBalance > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                {formatCurrency(totalFolioBalance)}
              </p>
            </div>
          </div>

          {/* Departures Table */}
          <ReportSection title="Departures List" description={`${departures.length} guest(s) expected to check out`}>
            <div className="border border-resort-sand rounded-lg bg-white shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-resort-sand bg-resort-ivory/50">
                      <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-resort-muted">
                        Guest
                      </th>
                      <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-resort-muted">
                        Room
                      </th>
                      <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-resort-muted">
                        Expected Checkout
                      </th>
                      <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-resort-muted">
                        Actual Checkout
                      </th>
                      <th className="px-4 py-3 text-right font-semibold uppercase tracking-wider text-resort-muted">
                        Folio Balance
                      </th>
                      <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-resort-muted">
                        Payment Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {departures.map((departure) => {
                      const guestName =
                        `${departure.primaryGuest?.firstName || ''} ${departure.primaryGuest?.lastName || ''}`.trim() ||
                        '—';
                      const roomAssignment = departure.roomAssignments?.[0];
                      const roomNumber = roomAssignment?.room?.roomNumber ?? '—';
                      const roomType = roomAssignment?.room?.roomType?.name ?? '';
                      const folioBalance = calculateFolioBalance(departure.folio);
                      const paymentStatus = getPaymentStatusLabel(folioBalance);

                      return (
                        <tr
                          key={departure.id}
                          className="border-b border-resort-sand last:border-0 hover:bg-resort-ivory/30 transition-colors"
                        >
                          <td className="px-4 py-3 font-medium text-resort-charcoal">{guestName}</td>
                          <td className="px-4 py-3 text-resort-charcoal">
                            <span className="font-mono font-semibold">{roomNumber}</span>
                            {roomType && (
                              <span className="text-resort-muted ml-1.5 text-[11px]">({roomType})</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-resort-charcoal-text">
                            {departure.expectedCheckOut
                              ? new Date(departure.expectedCheckOut).toLocaleDateString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                })
                              : '—'}
                          </td>
                          <td className="px-4 py-3 text-resort-charcoal-text">
                            {departure.actualCheckOut
                              ? new Date(departure.actualCheckOut).toLocaleDateString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                })
                              : (
                                <span className="text-resort-muted italic">Pending</span>
                              )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-semibold">
                            <span className={folioBalance > 0 ? 'text-amber-700' : folioBalance < 0 ? 'text-red-600' : 'text-emerald-700'}>
                              {formatCurrency(folioBalance)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge variant={paymentStatus.variant}>
                              {paymentStatus.label}
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
