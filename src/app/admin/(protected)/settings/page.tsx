import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { requirePermission } from '@/lib/auth/auth';
import { Card, CardContent } from '@/components/ui/card';
import { SettingsTabNav } from '@/components/admin/settings/SettingsTabNav';
import {
  Building,
  Receipt,
  CreditCard,
  FileText,
  CalendarX,
  UtensilsCrossed,
  Wrench,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

const SECTIONS = [
  {
    href: '/admin/settings/property',
    label: 'Property Settings',
    description: 'Resort name, address, GSTIN, timezone, check-in/out times',
    icon: Building,
    color: 'text-resort-forest',
    permission: 'settings:view' as const,
  },
  {
    href: '/admin/settings/taxes',
    label: 'Tax Configuration',
    description: 'Create, edit, and activate tax rates by scope',
    icon: Receipt,
    color: 'text-emerald-600',
    permission: 'settings:tax:view' as const,
  },
  {
    href: '/admin/settings/services',
    label: 'Service Management',
    description: 'Configure chargeable services and assign tax rules',
    icon: Wrench,
    color: 'text-blue-600',
    permission: 'settings:view' as const,
  },
  {
    href: '/admin/settings/charges',
    label: 'Service Charges',
    description: 'Extra charges, room service fees, and tax linkage',
    icon: CreditCard,
    color: 'text-amber-600',
    permission: 'settings:charges:view' as const,
  },
  {
    href: '/admin/settings/cancellation',
    label: 'Cancellation Policies',
    description: 'Fee types, windows, rate-plan associations',
    icon: CalendarX,
    color: 'text-red-600',
    permission: 'settings:cancellation:view' as const,
  },
  {
    href: '/admin/settings/invoicing',
    label: 'Invoice Configuration',
    description: 'Invoice prefix, terms, footer, tax breakdown',
    icon: FileText,
    color: 'text-purple-600',
    permission: 'settings:invoice:view' as const,
  },
  {
    href: '/admin/settings/restaurant',
    label: 'Restaurant Settings',
    description: 'Restaurant profile, operating hours, contact',
    icon: UtensilsCrossed,
    color: 'text-orange-600',
    permission: 'settings:restaurant:update' as const,
  },
];

export default async function SettingsOverviewPage() {
  await requirePermission('settings:view');

  let taxCount = 0;
  let serviceCount = 0;
  let chargeCount = 0;
  let policyCount = 0;

  try {
    [taxCount, serviceCount, chargeCount, policyCount] = await Promise.all([
      prisma.tax.count(),
      prisma.service.count(),
      prisma.serviceCharge.count(),
      prisma.cancellationPolicy.count(),
    ]);
  } catch {
    // Silently handle - overview will show 0 counts
  }

  return (
    <div className="space-y-6">
      <SettingsTabNav />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <Link key={section.href} href={section.href}>
              <Card className="hover:border-resort-gold hover:shadow-md transition-all cursor-pointer h-full">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 ${section.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-resort-charcoal">
                        {section.label}
                      </h3>
                      <p className="text-xs text-resort-stone mt-1">
                        {section.description}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-5">
          <h3 className="text-sm font-semibold text-resort-charcoal mb-3">
            Configuration Summary
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold font-serif text-resort-forest">{taxCount}</div>
              <div className="text-[10px] font-semibold text-resort-stone uppercase mt-1">Tax Rules</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold font-serif text-blue-600">{serviceCount}</div>
              <div className="text-[10px] font-semibold text-resort-stone uppercase mt-1">Services</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold font-serif text-amber-600">{chargeCount}</div>
              <div className="text-[10px] font-semibold text-resort-stone uppercase mt-1">Service Charges</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold font-serif text-red-600">{policyCount}</div>
              <div className="text-[10px] font-semibold text-resort-stone uppercase mt-1">Cancellation Policies</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
