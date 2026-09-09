import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth/auth';
import { getStayBillData } from '@/lib/frontdesk/bill';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { BillView } from '@/components/frontdesk/BillView';

export const dynamic = 'force-dynamic';

interface BillPageProps {
  params: Promise<{
    stayId: string;
  }>;
}

export default async function BillPage({ params }: BillPageProps) {
  await requirePermission('folio:read');
  const { stayId } = await params;

  const bill = await getStayBillData(stayId);

  if (!bill) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-resort-sand pb-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-resort-charcoal">Guest Folio & Bill</h1>
          <p className="text-xs text-resort-muted mt-1">
            Stay #{bill.stayNumber} &bull; {bill.guestName} &bull; Room {bill.roomNumber}
          </p>
        </div>
        <Link href="/admin/frontdesk/inhouse">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to In-House
          </Button>
        </Link>
      </div>

      <BillView bill={bill} stayId={stayId} />
    </div>
  );
}
