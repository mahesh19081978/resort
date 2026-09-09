import { requirePermission } from '@/lib/auth/auth';
import { GuestDatabaseClient } from '@/components/guest-db/GuestDatabaseClient';
import { Users, Calendar, Bed, Search } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function GuestDatabasePage() {
  await requirePermission('guest:read');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif text-2xl font-bold text-resort-charcoal flex items-center gap-2">
            <Users className="h-6 w-6 text-resort-forest" />
            Guest Database
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Search guests, investigate stays, view profiles and financial history
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/guests/stay-search"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium bg-resort-sand/50 text-resort-charcoal hover:bg-resort-sand transition-colors"
          >
            <Calendar className="h-3.5 w-3.5" />
            Stay Investigation
          </Link>
          <Link
            href="/admin/guests/inhouse"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium bg-resort-forest text-white hover:bg-resort-forest/90 transition-colors"
          >
            <Bed className="h-3.5 w-3.5" />
            Currently Staying
          </Link>
        </div>
      </div>

      <div className="border-b border-resort-sand/60 mb-6" />

      <GuestDatabaseClient />
    </div>
  );
}
