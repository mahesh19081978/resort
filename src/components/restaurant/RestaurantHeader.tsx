'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  UtensilsCrossed,
  LayoutGrid,
  Laptop,
  ChefHat,
  Receipt,
  ClipboardList,
  BookOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const RESTAURANT_TABS = [
  { href: '/admin/restaurant', label: 'Overview', icon: UtensilsCrossed, exact: true },
  { href: '/admin/restaurant/tables', label: 'Tables & Floor', icon: LayoutGrid },
  { href: '/admin/restaurant/pos', label: 'POS Terminal', icon: Laptop },
  { href: '/admin/restaurant/kitchen', label: 'Kitchen Display (KDS)', icon: ChefHat },
  { href: '/admin/restaurant/orders', label: 'Orders & KOT', icon: ClipboardList },
  { href: '/admin/restaurant/bills', label: 'Billing & Settle', icon: Receipt },
  { href: '/admin/restaurant/menu', label: 'Menu & Recipes', icon: BookOpen },
];

export function RestaurantHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const pathname = usePathname();

  return (
    <div className="space-y-4 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="font-serif text-2xl font-bold text-resort-charcoal">{title}</h1>
          {subtitle && <p className="text-xs text-resort-stone mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            Infinity Culinary POS
          </span>
        </div>
      </div>

      <nav className="flex items-center gap-1 border-b border-resort-sand/80 overflow-x-auto pb-px">
        {RESTAURANT_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.exact
            ? pathname === tab.href
            : pathname.startsWith(tab.href);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'flex items-center gap-2 px-3.5 py-2 text-xs font-medium border-b-2 whitespace-nowrap transition-colors',
                isActive
                  ? 'border-resort-forest text-resort-forest font-semibold bg-resort-sand/30 rounded-t'
                  : 'border-transparent text-resort-stone hover:text-resort-charcoal hover:border-resort-sand'
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
