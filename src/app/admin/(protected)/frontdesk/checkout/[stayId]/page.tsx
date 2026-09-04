import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { requirePermission } from '@/lib/auth/auth';
import { CheckOutDialog } from '@/components/frontdesk/CheckOutDialog';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { StayStatus } from '@prisma/client';

interface CheckOutPageProps {
  params: Promise<{
    stayId: string;
  }>;
}

export const dynamic = 'force-dynamic';

export default async function CheckOutPage({ params }: CheckOutPageProps) {
  await requirePermission('checkout:perform');
  const { stayId } = await params;

  const stay = await prisma.stay.findUnique({
    where: { id: stayId },
    include: {
      primaryGuest: true,
      roomAssignments: {
        where: { status: 'ACTIVE' },
        include: {
          room: {
            include: {
              roomType: true,
            },
          },
        },
      },
      folio: {
        include: {
          items: {
            where: { isVoided: false },
            orderBy: { postedAt: 'asc' },
          },
          payments: {
            where: { status: 'SUCCESS' },
            orderBy: { createdAt: 'asc' },
          },
        },
      },
    },
  });

  if (!stay || stay.status !== StayStatus.ACTIVE) {
    notFound();
  }

  const serializedStay = {
    id: stay.id,
    stayNumber: stay.stayNumber,
    actualCheckIn: stay.actualCheckIn.toISOString(),
    expectedCheckOut: stay.expectedCheckOut.toISOString(),
    primaryGuest: {
      firstName: stay.primaryGuest.firstName,
      lastName: stay.primaryGuest.lastName,
      phone: stay.primaryGuest.phone,
      email: stay.primaryGuest.email,
    },
    roomAssignments: stay.roomAssignments.map((ra) => ({
      room: {
        id: ra.room.id,
        roomNumber: ra.room.roomNumber,
        roomType: {
          name: ra.room.roomType.name,
        },
      },
    })),
    folio: stay.folio
      ? {
          id: stay.folio.id,
          folioNumber: stay.folio.folioNumber,
          totalCharges: stay.folio.totalCharges.toString(),
          totalCredits: stay.folio.totalCredits.toString(),
          totalBalance: stay.folio.totalBalance.toString(),
          items: stay.folio.items.map((it) => ({
            id: it.id,
            itemType: it.itemType,
            description: it.description,
            amount: it.amount.toString(),
            taxAmount: it.taxAmount.toString(),
            quantity: it.quantity,
            postedAt: it.postedAt.toISOString(),
          })),
          payments: stay.folio.payments.map((p) => ({
            id: p.id,
            paymentNumber: p.paymentNumber,
            amount: p.amount.toString(),
            method: p.method,
            status: p.status,
          })),
        }
      : null,
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between border-b border-neutral-200 pb-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-resort-charcoal">
            Guest Checkout & Folio Settlement
          </h1>
          <p className="text-xs text-resort-stone mt-1">
            Stay #{stay.stayNumber} &bull; Guest: {stay.primaryGuest.firstName}{' '}
            {stay.primaryGuest.lastName}
          </p>
        </div>
        <Link href="/admin/frontdesk/departures">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to Departures
          </Button>
        </Link>
      </div>

      <CheckOutDialog stay={serializedStay} />
    </div>
  );
}
