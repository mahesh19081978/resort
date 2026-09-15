'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CalendarCheck,
  BedDouble,
  Building,
  UserCheck,
  Users,
  Receipt,
  UtensilsCrossed,
  Boxes,
  Truck,
  ShieldCheck,
  FileBarChart,
  Settings,
  LogOut,
  ChevronRight,
  Menu,
  X,
  Sparkles,
  Shield,
  Calendar,
  MapPin,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { logoutAction } from '@/actions/auth';
import { UserRole } from '@/lib/permissions/rbac';
import { BrandLogo } from '@/components/public/BrandLogo';

export interface AdminUserPresentation {
  name: string;
  email: string;
  role: UserRole;
}

interface NavSection {
  title: string;
  items: {
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'FRONT DESK & PMS',
    items: [
      { href: '/admin/dashboard', label: 'Executive Dashboard', icon: LayoutDashboard },
      { href: '/admin/bookings', label: 'Reservations', icon: CalendarCheck },
      { href: '/admin/rooms', label: 'Rooms & PMS', icon: BedDouble },
      { href: '/admin/frontdesk', label: 'Front Desk Operations', icon: UserCheck },
      { href: '/admin/guests', label: 'Guest Database', icon: Users },
      { href: '/admin/folios', label: 'Guest Folios', icon: Receipt },
    ],
  },
  {
    title: 'FOOD & BEVERAGE',
    items: [
      { href: '/admin/restaurant', label: 'Restaurant POS & KOT', icon: UtensilsCrossed },
    ],
  },
  {
    title: 'OPERATIONS',
    items: [
      { href: '/admin/property', label: 'Property & Buildings', icon: Building },
      { href: '/admin/inventory', label: 'Inventory & Store', icon: Boxes },
      { href: '/admin/procurement', label: 'Procurement & GRN', icon: Truck },
    ],
  },
  {
    title: 'MANAGEMENT',
    items: [
      { href: '/admin/reports', label: 'Reports & Audits', icon: FileBarChart },
      { href: '/admin/access', label: 'RBAC & Security', icon: ShieldCheck },
      { href: '/admin/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#0F2A1F] text-white">
      {/* Brand Header */}
      <div className="py-6 px-4 border-b border-resort-forest/80 flex flex-col items-center justify-center bg-[#091b14]">
        <Link href="/admin/dashboard" className="flex flex-col items-center text-center group w-full">
          <div className="flex items-center justify-center w-full px-2">
            <BrandLogo variant="light" size="large" linked={false} className="h-20 w-auto object-contain transition-transform group-hover:scale-105" />
          </div>
          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-resort-gold/30">
            <span className="w-1.5 h-1.5 rounded-full bg-resort-gold animate-pulse" />
            <span className="text-[10px] tracking-widest uppercase font-bold text-resort-gold">
              PMS & ERP CONSOLE
            </span>
          </div>
        </Link>
      </div>

      {/* Navigation Links */}
      <nav className="p-3 space-y-5 flex-1 overflow-y-auto custom-scrollbar">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="space-y-1">
            <div className="px-3 py-1 text-[10px] font-bold tracking-wider uppercase text-resort-olive-light/90">
              {section.title}
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || (item.href !== '/admin/dashboard' && pathname.startsWith(item.href + '/'));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-all group',
                      isActive
                        ? 'bg-resort-forest text-white font-semibold border-l-3 border-resort-gold shadow-sm'
                        : 'text-stone-300 hover:text-white hover:bg-white/5'
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon
                        className={cn(
                          'h-4 w-4 shrink-0 transition-colors',
                          isActive ? 'text-resort-gold' : 'text-resort-olive-light group-hover:text-stone-200'
                        )}
                      />
                      <span>{item.label}</span>
                    </div>
                    {isActive && <ChevronRight className="w-3.5 h-3.5 text-resort-gold/80" />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer / Sign out */}
      <div className="p-3 border-t border-resort-forest/80 bg-[#0c2219]">
        <form action={logoutAction}>
          <button
            type="submit"
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium text-rose-300 hover:text-rose-100 hover:bg-rose-950/40 transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span>Sign Out Session</span>
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger trigger */}
      <div className="lg:hidden fixed top-3 left-4 z-50">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 rounded-lg bg-[#0F2A1F] text-white shadow-md focus:outline-none focus:ring-2 focus:ring-resort-gold"
          aria-label="Toggle navigation menu"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 min-h-screen border-r border-resort-forest/60 z-30 flex-col shadow-xl">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setMobileOpen(false)} />
          <div className="relative w-72 max-w-[85vw] h-full z-50 shadow-2xl">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}

export function AdminTopbar({
  user,
  businessDate,
}: {
  user?: AdminUserPresentation | null;
  businessDate?: string;
}) {
  const pathname = usePathname();
  const initial = user?.name ? user.name.charAt(0).toUpperCase() : 'A';
  const roleName = user?.role ? user.role.replace(/_/g, ' ') : 'Administrator';

  // Format business date for header
  const todayDateStr = businessDate || new Date().toISOString().slice(0, 10);
  const formattedBusinessDate = new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${todayDateStr}T12:00:00.000Z`));

  // Determine current active section for breadcrumb
  const currentPathSegments = pathname.split('/').filter(Boolean);
  const sectionLabel = currentPathSegments[1]
    ? currentPathSegments[1].charAt(0).toUpperCase() + currentPathSegments[1].slice(1)
    : 'Console';

  return (
    <header className="h-16 border-b border-resort-sand/80 bg-white px-4 lg:px-8 flex items-center justify-between shadow-2xs z-20 sticky top-0">
      {/* Left Context: Breadcrumbs & Module Indicator */}
      <div className="flex items-center gap-3 pl-10 lg:pl-0">
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 text-[11px] text-resort-muted">
            <span>Infinity Resort</span>
            <span className="text-resort-sand-light select-none">/</span>
            <span className="capitalize font-medium text-resort-charcoal">
              {sectionLabel}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="hidden sm:flex items-center gap-1 text-xs text-resort-forest font-semibold">
              <MapPin className="w-3 h-3 text-resort-gold" />
              Mhow, MP
            </span>
            <span className="hidden md:flex items-center gap-1 text-[11px] text-stone-600 bg-resort-sand/50 px-2 py-0.5 rounded border border-resort-sand">
              <Calendar className="w-3 h-3 text-resort-forest" />
              Business Date: <strong className="font-semibold text-resort-charcoal ml-0.5">{formattedBusinessDate}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Right Context: Security status, User Profile */}
      <div className="flex items-center gap-3 lg:gap-5">
        {/* Security indicator */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200/80 text-[11px] font-semibold text-emerald-800">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Security Active</span>
        </div>

        {/* User Card */}
        <div className="flex items-center gap-2.5 pl-3 border-l border-resort-sand/80">
          <div className="h-8 w-8 rounded-full bg-resort-forest text-resort-ivory flex items-center justify-center font-bold text-xs shadow-xs border border-resort-gold/40">
            {initial}
          </div>
          <div className="hidden sm:flex flex-col text-left">
            <span className="font-medium text-xs text-resort-charcoal leading-none">
              {user?.name || 'Administrator'}
            </span>
            <span className="text-[10px] text-resort-gold-dark font-bold leading-tight uppercase tracking-wider mt-1">
              {roleName}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}