import Link from 'next/link';
import { requirePermission } from '@/lib/auth/auth';
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

export const dynamic = 'force-dynamic';

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

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePermission('settings:view');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-resort-charcoal">
          System Settings
        </h1>
        <p className="text-xs text-resort-stone mt-1">
          Configure property, tax, service charges, cancellation policies, invoicing, and restaurant settings.
        </p>
      </div>

      <SettingsTabNav />

      <div>{children}</div>
    </div>
  );
}

function SettingsTabNav() {
  return null;
}

export { SETTINGS_TABS };
