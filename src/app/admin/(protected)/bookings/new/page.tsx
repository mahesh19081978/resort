import React from 'react';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth/auth';
import { prisma } from '@/lib/db/prisma';
import { getBusinessDateNow } from '@/lib/frontdesk/arrivals';
import { AdminNewReservationForm } from '@/components/booking/admin/AdminNewReservationForm';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function NewAdminReservationPage() {
  await requirePermission('booking:create');

  const todayStr = getBusinessDateNow();
  const dTomorrow = new Date(`${todayStr}T00:00:00.000Z`);
  dTomorrow.setUTCDate(dTomorrow.getUTCDate() + 1);
  const tomorrowStr = dTomorrow.toISOString().slice(0, 10);

  const rawRoomTypes = await prisma.roomType.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      code: true,
      basePrice: true,
      maxOccupancy: true,
    },
    orderBy: { displayOrder: 'asc' },
  });

  const roomTypes = rawRoomTypes.map((rt) => ({
    id: rt.id,
    name: rt.name,
    code: rt.code,
    basePrice: Number(rt.basePrice),
    maxOccupancy: rt.maxOccupancy,
  }));

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div className="flex items-center gap-3 border-b border-neutral-200/80 pb-4">
        <Link href="/admin/bookings">
          <Button variant="outline" size="sm" className="h-8 w-8 p-0 text-neutral-600">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="font-serif text-2xl font-bold text-resort-charcoal">
            Create Reservation
          </h1>
          <p className="text-xs text-resort-stone mt-1">
            Book walk-in, phone, or corporate room reservation using authoritative availability and pricing.
          </p>
        </div>
      </div>

      <AdminNewReservationForm
        roomTypes={roomTypes}
        todayStr={todayStr}
        tomorrowStr={tomorrowStr}
      />
    </div>
  );
}
