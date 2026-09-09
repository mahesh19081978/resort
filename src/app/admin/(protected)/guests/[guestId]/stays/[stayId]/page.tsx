import { requirePermission } from '@/lib/auth/auth';
import { StayDetailClient } from '@/components/guest-db/StayDetailClient';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function StayDetailPage() {
  await requirePermission('guest:read');

  return (
    <div>
      <StayDetailClient />
    </div>
  );
}
