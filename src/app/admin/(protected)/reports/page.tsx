import Link from 'next/link';
import { requireAuth } from '@/lib/auth/auth';
import { hasPermission } from '@/lib/permissions/rbac';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import {
  FileBarChart,
  CreditCard,
  BedDouble,
  CalendarCheck,
  UtensilsCrossed,
  Boxes,
  Truck,
  Receipt,
  Users,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

interface ReportCategory {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  permissions: string[];
  color: string;
  bgColor: string;
  borderColor: string;
}

export default async function ReportsPage() {
  const user = await requireAuth();

  const canAccess = (permissions: string[]) =>
    permissions.some((p) => hasPermission(user, p as any));

  const reports: ReportCategory[] = [
    {
      title: 'Revenue & Finance',
      description: 'Financial summaries, revenue by source, ADR, RevPAR, and period-over-period comparisons.',
      href: '/admin/reports/revenue',
      icon: <CreditCard className="w-5 h-5" />,
      permissions: ['reports:financial'],
      color: 'text-emerald-700',
      bgColor: 'bg-emerald-50',
      borderColor: 'border-l-emerald-500',
    },
    {
      title: 'Occupancy & Rooms',
      description: 'Occupancy rates, room nights sold, ADR by room type, and availability forecast.',
      href: '/admin/reports/occupancy',
      icon: <BedDouble className="w-5 h-5" />,
      permissions: ['reports:operational', 'reports:financial'],
      color: 'text-blue-700',
      bgColor: 'bg-blue-50',
      borderColor: 'border-l-blue-500',
    },
    {
      title: 'Reservations',
      description: 'Booking volume, cancellation rates, channel performance, and lead time analysis.',
      href: '/admin/reports/reservations',
      icon: <CalendarCheck className="w-5 h-5" />,
      permissions: ['booking:read'],
      color: 'text-violet-700',
      bgColor: 'bg-violet-50',
      borderColor: 'border-l-violet-500',
    },
    {
      title: 'Arrivals',
      description: 'Expected arrivals, check-in status, early/late arrival patterns, and no-show tracking.',
      href: '/admin/reports/arrivals',
      icon: <CalendarCheck className="w-5 h-5" />,
      permissions: ['booking:read'],
      color: 'text-indigo-700',
      bgColor: 'bg-indigo-50',
      borderColor: 'border-l-indigo-500',
    },
    {
      title: 'Departures',
      description: 'Expected departures, checkout completion, overstay alerts, and folio settlement status.',
      href: '/admin/reports/departures',
      icon: <CalendarCheck className="w-5 h-5" />,
      permissions: ['booking:read'],
      color: 'text-rose-700',
      bgColor: 'bg-rose-50',
      borderColor: 'border-l-rose-500',
    },
    {
      title: 'Restaurant & F&B',
      description: 'POS sales, order type mix, top dishes, average ticket size, and kitchen performance.',
      href: '/admin/reports/restaurant',
      icon: <UtensilsCrossed className="w-5 h-5" />,
      permissions: ['restaurant:order:read', 'reports:operational'],
      color: 'text-amber-700',
      bgColor: 'bg-amber-50',
      borderColor: 'border-l-amber-500',
    },
    {
      title: 'Inventory',
      description: 'Stock levels, valuation, consumption trends, low-stock alerts, and store ledger.',
      href: '/admin/reports/inventory',
      icon: <Boxes className="w-5 h-5" />,
      permissions: ['inventory:read'],
      color: 'text-orange-700',
      bgColor: 'bg-orange-50',
      borderColor: 'border-l-orange-500',
    },
    {
      title: 'Procurement & Vendors',
      description: 'Purchase orders, GRN status, vendor payables, and procurement cycle metrics.',
      href: '/admin/reports/procurement',
      icon: <Truck className="w-5 h-5" />,
      permissions: ['reports:operational'],
      color: 'text-teal-700',
      bgColor: 'bg-teal-50',
      borderColor: 'border-l-teal-500',
    },
    {
      title: 'Payments & Collections',
      description: 'Payment methods, settlement status, outstanding balances, and collection trends.',
      href: '/admin/reports/payments',
      icon: <Receipt className="w-5 h-5" />,
      permissions: ['reports:financial'],
      color: 'text-cyan-700',
      bgColor: 'bg-cyan-50',
      borderColor: 'border-l-cyan-500',
    },
    {
      title: 'Guest Reports',
      description: 'Guest demographics, repeat stays, loyalty metrics, and guest satisfaction data.',
      href: '/admin/reports/guests',
      icon: <Users className="w-5 h-5" />,
      permissions: ['guest:read'],
      color: 'text-resort-forest',
      bgColor: 'bg-resort-sand/30',
      borderColor: 'border-l-resort-forest',
    },
    {
      title: 'Audit & Activity',
      description: 'User activity logs, system audit trail, security events, and compliance records.',
      href: '/admin/reports/audit',
      icon: <ShieldCheck className="w-5 h-5" />,
      permissions: ['audit:read'],
      color: 'text-neutral-700',
      bgColor: 'bg-neutral-50',
      borderColor: 'border-l-neutral-500',
    },
  ];

  const accessibleReports = reports.filter((r) => canAccess(r.permissions));

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="border-b border-neutral-200 pb-5">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-resort-charcoal">
            Reports & Analytics
          </h1>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-resort-sand/60 text-resort-charcoal border border-resort-sand">
            <FileBarChart className="w-3 h-3 mr-1 text-resort-gold" />
            {accessibleReports.length} Available
          </span>
        </div>
        <p className="text-xs text-resort-stone mt-1.5 max-w-3xl leading-relaxed">
          Operational, financial, inventory, restaurant, reservation, room, guest, and audit reports.
          Each report category requires specific permissions — cards you lack access to are hidden from view.
        </p>
      </div>

      {/* Report Category Cards */}
      {accessibleReports.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accessibleReports.map((report) => (
            <Link key={report.href} href={report.href} className="group">
              <Card className={`border-l-4 ${report.borderColor} hover:shadow-md transition-all h-full`}>
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between">
                    <div className={`w-9 h-9 rounded-lg ${report.bgColor} flex items-center justify-center ${report.color}`}>
                      {report.icon}
                    </div>
                    <ArrowRight className="w-4 h-4 text-neutral-300 group-hover:text-resort-gold group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <CardTitle className="text-sm font-serif font-semibold text-resort-charcoal mt-3">
                    {report.title}
                  </CardTitle>
                  <CardDescription className="text-xs text-resort-stone leading-relaxed">
                    {report.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-1">
                  <span className="text-[11px] font-semibold text-resort-gold group-hover:underline flex items-center">
                    View Report <ArrowRight className="w-3 h-3 ml-1" />
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card className="border-dashed border-neutral-300 bg-neutral-50/50">
          <CardContent className="p-8 text-center">
            <FileBarChart className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
            <p className="text-sm text-resort-stone font-medium">No reports available for your role.</p>
            <p className="text-xs text-neutral-400 mt-1">
              Contact an administrator to request access to report modules.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
