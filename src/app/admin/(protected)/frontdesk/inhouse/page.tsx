import Link from 'next/link';
import { requirePermission } from '@/lib/auth/auth';
import { getInHouseRooms, InHouseFilter } from '@/lib/frontdesk/inhouse';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BedDouble, Users, AlertTriangle, Search, ArrowLeft } from 'lucide-react';
import { InHouseCardGrid } from '@/components/frontdesk/InHouseCardGrid';

export const dynamic = 'force-dynamic';

interface InHousePageProps {
  searchParams: Promise<{
    filter?: string;
    q?: string;
  }>;
}

export default async function InHousePage({ searchParams }: InHousePageProps) {
  await requirePermission('booking:read');

  const params = await searchParams;
  const filter = (params.filter as InHouseFilter) || 'all';
  const searchQuery = params.q || '';

  const rooms = await getInHouseRooms(filter, searchQuery);

  const checkoutTodayCount = rooms.filter((r) => r.isCheckoutToday).length;
  const overdueCount = rooms.filter((r) => r.isOverdue).length;

  const filterButtons: Array<{ label: string; value: InHouseFilter; icon?: React.ReactNode; count?: number }> = [
    { label: 'All Occupied', value: 'all', icon: <BedDouble className="w-3.5 h-3.5" />, count: rooms.length },
    { label: 'Checkout Today', value: 'checkout_today', icon: <Users className="w-3.5 h-3.5" />, count: checkoutTodayCount },
    { label: 'Overdue', value: 'overdue', icon: <AlertTriangle className="w-3.5 h-3.5" />, count: overdueCount },
    { label: 'Paid', value: 'paid' },
    { label: 'Balance Due', value: 'balance_due' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-resort-sand pb-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-resort-charcoal">In-House Rooms</h1>
          <p className="text-xs text-resort-muted mt-1">
            Currently occupied physical rooms with live folio balances and actions.
          </p>
        </div>
        <Link href="/admin/frontdesk">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to Front Desk
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {filterButtons.map((fb) => {
          const isActive = filter === fb.value;
          const href = fb.value === 'all'
            ? '/admin/frontdesk/inhouse'
            : `/admin/frontdesk/inhouse?filter=${fb.value}`;
          return (
            <Link key={fb.value} href={href}>
              <Button
                size="sm"
                variant={isActive ? 'primary' : 'outline'}
                className={
                  isActive
                    ? 'bg-resort-forest text-white text-xs'
                    : 'text-xs border-resort-sand text-resort-charcoal-text hover:bg-resort-sand-light'
                }
              >
                {fb.icon && <span className="mr-1">{fb.icon}</span>}
                {fb.label}
                {fb.count !== undefined && (
                  <Badge
                    variant={isActive ? 'secondary' : 'outline'}
                    className="ml-1.5 text-[10px] px-1.5 py-0"
                  >
                    {fb.count}
                  </Badge>
                )}
              </Button>
            </Link>
          );
        })}
      </div>

      <InHouseCardGrid rooms={rooms} searchQuery={searchQuery} filter={filter} />
    </div>
  );
}
