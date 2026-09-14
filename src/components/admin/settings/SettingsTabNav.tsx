'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Building,
  Receipt,
  CreditCard,
  FileText,
  CalendarX,
  UtensilsCrossed,
  Cog,
  Wrench,
} from 'lucide-react';

const SETTINGS_TABS = [
  { href: '/admin/settings', label: 'Overview', icon: Cog, exact: true },
  { href: '/admin/settings/property', label: 'Property', icon: Building },
  { href: '/admin/settings/taxes', label: 'Taxes', icon: Receipt },
  { href: '/admin/settings/services', label: 'Services', icon: Wrench },
  { href: '/admin/settings/charges', label: 'Service Charges', icon: CreditCard },
  { href: '/admin/settings/cancellation', label: 'Cancellation', icon: CalendarX },
  { href: '/admin/settings/invoicing', label: 'Invoicing', icon: FileText },
  { href: '/admin/settings/restaurant', label: 'Restaurant', icon: UtensilsCrossed },
];

export function SettingsTabNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-1 border-b border-resort-sand pb-px" aria-label="Settings sections">
      {SETTINGS_TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(tab.href + '/');
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t transition-colors -mb-px',
              isActive
                ? 'bg-white border border-resort-sand border-b-white text-resort-forest'
                : 'text-resort-stone hover:text-resort-charcoal hover:bg-resort-sand/30'
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon className="h-3.5 w-3.5" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
