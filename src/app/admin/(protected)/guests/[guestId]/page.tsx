import { requirePermission } from '@/lib/auth/auth';
import { GuestProfileClient } from '@/components/guest-db/GuestProfileClient';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function GuestProfilePage() {
  await requirePermission('guest:read');

  return (
    <div>
      <Link
        href="/admin/guests"
        className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-resort-forest mb-4"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to Guest Database
      </Link>
      <GuestProfileClient />
    </div>
  );
}
