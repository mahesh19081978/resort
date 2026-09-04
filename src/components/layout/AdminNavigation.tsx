'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CalendarCheck,
  BedDouble,
  UserCheck,
  Receipt,
  UtensilsCrossed,
  Boxes,
  Truck,
  ShieldCheck,
  FileBarChart,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { logoutAction } from '@/actions/auth';
import { UserRole } from '@/lib/permissions/rbac';

export interface AdminUserPresentation {
  name: string;
  email: string;
  role: UserRole;
}

const NAV_ITEMS = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/bookings', label: 'Reservations', icon: CalendarCheck },
  { href: '/admin/rooms', label: 'Rooms & PMS', icon: BedDouble },
  { href: '/admin/frontdesk', label: 'Front Desk / Check-In', icon: UserCheck },
  { href: '/admin/folios', label: 'Guest Folios', icon: Receipt },
  { href: '/admin/restaurant', label: 'Restaurant POS & KOT', icon: UtensilsCrossed },
  { href: '/admin/inventory', label: 'Inventory & Store', icon: Boxes },
  { href: '/admin/procurement', label: 'Procurement & GRN', icon: Truck },
  { href: '/admin/reports', label: 'Reports & Audits', icon: FileBarChart },
  { href: '/admin/access', label: 'RBAC & Access Control', icon: ShieldCheck },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-resort-sand/80 bg-white flex flex-col shrink-0 min-h-screen">
      <div className="h-16 border-b border-resort-sand/80 flex items-center px-6">
        <Link href="/admin/dashboard" className="flex items-center gap-2">
          <span className="font-serif font-bold text-lg text-resort-forest">THE ROYAL RESERVE</span>
          <span className="rounded bg-resort-forest text-resort-ivory text-[10px] font-bold px-1.5 py-0.5">
            PMS
          </span>
        </Link>
      </div>

      <nav className="p-4 space-y-1 flex-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded text-xs font-medium transition-colors',
                isActive
                  ? 'bg-resort-forest text-resort-ivory font-semibold'
                  : 'text-resort-charcoal hover:bg-resort-sand/50'
              )}
            >
              <Icon className={cn('h-4 w-4', isActive ? 'text-resort-gold' : 'text-resort-stone')} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-resort-sand/80">
        <form action={logoutAction}>
          <button
            type="submit"
            className="w-full flex items-center gap-3 px-3 py-2 rounded text-xs font-medium text-red-700 hover:bg-red-50 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </button>
        </form>
      </div>
    </aside>
  );
}

export function AdminTopbar({ user }: { user?: AdminUserPresentation | null }) {
  const initial = user?.name ? user.name.charAt(0).toUpperCase() : 'A';
  const roleName = user?.role ? user.role.replace(/_/g, ' ') : 'Administrator';

  return (
    <header className="h-16 border-b border-resort-sand/80 bg-white px-6 flex items-center justify-between">
      <div className="flex items-center gap-2 text-xs text-resort-stone">
        <span>Admin Console</span>
        <span>/</span>
        <span className="text-resort-charcoal font-medium">Enterprise Management</span>
      </div>

      <div className="flex items-center gap-4">
        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
          Security Active
        </span>
        <div className="flex items-center gap-2 text-xs">
          <div className="h-7 w-7 rounded-full bg-resort-forest text-resort-ivory flex items-center justify-center font-bold">
            {initial}
          </div>
          <div className="flex flex-col text-left">
            <span className="font-medium text-resort-charcoal leading-none">
              {user?.name || 'Administrator'}
            </span>
            <span className="text-[10px] text-resort-gold font-semibold leading-tight uppercase mt-0.5">
              {roleName}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}