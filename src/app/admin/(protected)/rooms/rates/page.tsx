import React from 'react';
import { prisma } from '@/lib/db/prisma';
import { requirePermission } from '@/lib/auth/auth';
import { RoomRatesClient, RoomRateRecord, RoomTypeOption, RatePlanOption } from '@/components/admin/rooms/RoomRatesClient';

export const dynamic = 'force-dynamic';

export default async function AdminRoomRatesPage() {
  // Enforce server-side RBAC permission: room:read to view, room:manage to mutate
  await requirePermission('room:read');

  // Load room types, rate plans, and existing RoomRate rules
  const [rawRoomTypes, rawRatePlans, rawRates] = await Promise.all([
    prisma.roomType.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
        basePrice: true,
      },
      orderBy: { displayOrder: 'asc' },
    }),
    prisma.ratePlan.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
      },
      orderBy: { code: 'asc' },
    }),
    prisma.roomRate.findMany({
      include: {
        roomType: { select: { name: true, code: true, basePrice: true } },
        ratePlan: { select: { name: true, code: true } },
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
    }),
  ]);

  const roomTypes: RoomTypeOption[] = rawRoomTypes.map((rt) => ({
    id: rt.id,
    name: rt.name,
    code: rt.code,
    basePrice: rt.basePrice.toString(),
  }));

  const ratePlans: RatePlanOption[] = rawRatePlans.map((rp) => ({
    id: rp.id,
    name: rp.name,
    code: rp.code,
  }));

  const initialRates: RoomRateRecord[] = rawRates.map((r) => ({
    id: r.id,
    roomTypeId: r.roomTypeId,
    roomTypeName: r.roomType.name,
    roomTypeCode: r.roomType.code,
    referencePrice: r.roomType.basePrice.toString(),
    ratePlanId: r.ratePlanId,
    ratePlanName: r.ratePlan.name,
    ratePlanCode: r.ratePlan.code,
    rateType: r.rateType,
    name: r.name,
    basePrice: r.basePrice.toString(),
    extraAdultPrice: r.extraAdultPrice.toString(),
    extraChildPrice: r.extraChildPrice.toString(),
    startDate: r.startDate ? r.startDate.toISOString() : null,
    endDate: r.endDate ? r.endDate.toISOString() : null,
    daysOfWeek: r.daysOfWeek,
    priority: r.priority,
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <RoomRatesClient
      initialRates={initialRates}
      roomTypes={roomTypes}
      ratePlans={ratePlans}
    />
  );
}
