import { requirePermission } from '@/lib/auth/auth';
import { StayInvestigationClient } from '@/components/guest-db/StayInvestigationClient';
import { Calendar } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function StayInvestigationPage() {
  await requirePermission('guest:read');

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-2xl font-bold text-resort-charcoal flex items-center gap-2">
          <Calendar className="h-6 w-6 text-resort-forest" />
          Stay Investigation
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          Find who stayed at the resort on a particular date
        </p>
      </div>

      <div className="border-b border-resort-sand/60 mb-6" />

      <StayInvestigationClient />
    </div>
  );
}
