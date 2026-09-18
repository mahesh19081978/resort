'use server';

import prisma from '@/lib/db/prisma';
import { resolveBatchRoomRatesForStay, resolveRoomRateForStay, PUBLIC_DEFAULT_RATE_PLAN_CODE, resolveRatePlanByCode } from '@/lib/booking/rate-resolver';
import type { StayPricingSummary } from '@/lib/availability/service';

export interface PublicRoomType {
  id: string;
  name: string;
  code: string;
  slug: string;
  description: string;
  basePrice: number;
  maxOccupancy: number;
  maxAdults: number;
  maxChildren: number;
  totalInventory: number;
  displayOrder: number;
  amenities: {
    name: string;
    code: string;
    icon: string | null;
  }[];
  media: {
    id: string;
    fileUrl: string;
    title: string | null;
    isFeatured: boolean;
  }[];
  activeRoomCount: number;
  pricing?: StayPricingSummary;
  marketingPricing?: StayPricingSummary;
}

function getKolkataTodayString(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now);
}

function getKolkataTomorrowString(today: string): string {
  const d = new Date(`${today}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export interface PublicRoomTypeDetail extends PublicRoomType {
  relatedRoomTypes: {
    id: string;
    name: string;
    slug: string;
    description: string;
    basePrice: number;
    media: {
      fileUrl: string;
      isFeatured: boolean;
    }[];
  }[];
}

const roomTypeInclude = {
  amenities: {
    include: {
      amenity: {
        select: {
          name: true,
          code: true,
          icon: true,
        },
      },
    },
  },
  media: {
    where: {
      entityType: 'ROOM_TYPE',
    },
    select: {
      id: true,
      fileUrl: true,
      title: true,
      isFeatured: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
  rooms: {
    where: { isActive: true },
    select: { id: true },
  },
};

export async function getPublicRoomTypes(options?: {
  checkIn?: string;
  checkOut?: string;
  ratePlanId?: string;
}): Promise<PublicRoomType[]> {
  const roomTypes = await prisma.roomType.findMany({
    where: { isActive: true },
    orderBy: { displayOrder: 'asc' },
    include: roomTypeInclude,
  });

  const publicRooms: PublicRoomType[] = roomTypes.map((rt) => ({
    id: rt.id,
    name: rt.name,
    code: rt.code,
    slug: rt.slug,
    description: rt.description,
    basePrice: Number(rt.basePrice),
    maxOccupancy: rt.maxOccupancy,
    maxAdults: rt.maxAdults,
    maxChildren: rt.maxChildren,
    totalInventory: rt.totalInventory,
    displayOrder: rt.displayOrder,
    amenities: rt.amenities.map((ra) => ra.amenity),
    media: rt.media,
    activeRoomCount: rt.rooms.length,
  }));

  if (options?.checkIn && options?.checkOut && publicRooms.length > 0) {
    try {
      const roomTypeIds = publicRooms.map((r) => r.id);
      const ratePlanId = options.ratePlanId ?? (await resolveRatePlanByCode(PUBLIC_DEFAULT_RATE_PLAN_CODE)).id;
      const stayRatesMap = await resolveBatchRoomRatesForStay({
        roomTypeIds,
        ratePlanId,
        checkInDate: options.checkIn,
        checkOutDate: options.checkOut,
      });

      for (const room of publicRooms) {
        const stayRate = stayRatesMap.get(room.id);
        if (stayRate) {
          room.pricing = {
            totalStayAmount: stayRate.totalBaseAmount.toNumber(),
            totalReferenceAmount: stayRate.totalReferenceAmount.toNumber(),
            totalPromotionDiscount: stayRate.totalPromotionDiscount.toNumber(),
            averageNightlyRate: stayRate.averageNightlyRate.toNumber(),
            isDiscounted: stayRate.isDiscounted,
            effectiveOfferLabel: stayRate.effectiveOfferLabel,
            nightsBreakdown: stayRate.nights.map((n) => ({
              date: n.date,
              dayOfWeek: n.dayOfWeek,
              isWeekend: n.isWeekend,
              rateType: n.rateType,
              appliedPrice: n.appliedPrice.toNumber(),
              referencePrice: n.referencePrice.toNumber(),
              discountAmount: n.discountAmount.toNumber(),
              isDiscounted: n.isDiscounted,
              offerLabel: n.offerLabel,
            })),
          };
        }
      }
    } catch (err) {
      console.error('[GET_PUBLIC_ROOMS_PRICING_ERROR]', err);
    }
  } else if (publicRooms.length > 0) {
    // Marketing pricing for undated /rooms: today's ACTIVE PROMOTION if applicable, server-authoritative
    // Never implies promotion applies to all dates; dated searches use exact nightly resolution above
    try {
      const today = getKolkataTodayString();
      const tomorrow = getKolkataTomorrowString(today);
      const roomTypeIds = publicRooms.map((r) => r.id);
      const ratePlanId = options?.ratePlanId ?? (await resolveRatePlanByCode(PUBLIC_DEFAULT_RATE_PLAN_CODE)).id;
      const stayRatesMap = await resolveBatchRoomRatesForStay({
        roomTypeIds,
        ratePlanId,
        checkInDate: today,
        checkOutDate: tomorrow,
      });

      for (const room of publicRooms) {
        const stayRate = stayRatesMap.get(room.id);
        if (stayRate) {
          room.marketingPricing = {
            totalStayAmount: stayRate.totalBaseAmount.toNumber(),
            totalReferenceAmount: stayRate.totalReferenceAmount.toNumber(),
            totalPromotionDiscount: stayRate.totalPromotionDiscount.toNumber(),
            averageNightlyRate: stayRate.averageNightlyRate.toNumber(),
            isDiscounted: stayRate.isDiscounted,
            effectiveOfferLabel: stayRate.effectiveOfferLabel,
            nightsBreakdown: stayRate.nights.map((n) => ({
              date: n.date,
              dayOfWeek: n.dayOfWeek,
              isWeekend: n.isWeekend,
              rateType: n.rateType,
              appliedPrice: n.appliedPrice.toNumber(),
              referencePrice: n.referencePrice.toNumber(),
              discountAmount: n.discountAmount.toNumber(),
              isDiscounted: n.isDiscounted,
              offerLabel: n.offerLabel,
            })),
          };
        }
      }
    } catch (err) {
      console.error('[GET_PUBLIC_ROOMS_MARKETING_PRICING_ERROR]', err);
    }
  }

  return publicRooms;
}

export async function getPublicRoomTypeBySlug(
  slug: string,
  options?: {
    checkIn?: string;
    checkOut?: string;
    ratePlanId?: string;
  }
): Promise<PublicRoomTypeDetail | null> {
  const roomType = await prisma.roomType.findUnique({
    where: { slug, isActive: true },
    include: roomTypeInclude,
  });

  if (!roomType) return null;

  const relatedRoomTypes = await prisma.roomType.findMany({
    where: {
      isActive: true,
      id: { not: roomType.id },
    },
    orderBy: { displayOrder: 'asc' },
    take: 3,
    include: {
      media: {
        where: { entityType: 'ROOM_TYPE', isFeatured: true },
        select: { fileUrl: true, isFeatured: true },
        take: 1,
      },
      rooms: {
        where: { isActive: true },
        select: { id: true },
      },
    },
  });

  let pricing: StayPricingSummary | undefined;

  if (options?.checkIn && options?.checkOut) {
    try {
      const ratePlanId = options.ratePlanId ?? (await resolveRatePlanByCode(PUBLIC_DEFAULT_RATE_PLAN_CODE)).id;
      const stayRate = await resolveRoomRateForStay({
        roomTypeId: roomType.id,
        ratePlanId,
        checkInDate: options.checkIn,
        checkOutDate: options.checkOut,
      });

      pricing = {
        totalStayAmount: stayRate.totalBaseAmount.toNumber(),
        totalReferenceAmount: stayRate.totalReferenceAmount.toNumber(),
        totalPromotionDiscount: stayRate.totalPromotionDiscount.toNumber(),
        averageNightlyRate: stayRate.averageNightlyRate.toNumber(),
        isDiscounted: stayRate.isDiscounted,
        effectiveOfferLabel: stayRate.effectiveOfferLabel,
        nightsBreakdown: stayRate.nights.map((n) => ({
          date: n.date,
          dayOfWeek: n.dayOfWeek,
          isWeekend: n.isWeekend,
          rateType: n.rateType,
          appliedPrice: n.appliedPrice.toNumber(),
          referencePrice: n.referencePrice.toNumber(),
          discountAmount: n.discountAmount.toNumber(),
          isDiscounted: n.isDiscounted,
          offerLabel: n.offerLabel,
        })),
      };
    } catch (err) {
      console.error('[GET_PUBLIC_ROOM_DETAIL_PRICING_ERROR]', err);
    }
  }

  return {
    id: roomType.id,
    name: roomType.name,
    code: roomType.code,
    slug: roomType.slug,
    description: roomType.description,
    basePrice: Number(roomType.basePrice),
    maxOccupancy: roomType.maxOccupancy,
    maxAdults: roomType.maxAdults,
    maxChildren: roomType.maxChildren,
    totalInventory: roomType.totalInventory,
    displayOrder: roomType.displayOrder,
    amenities: roomType.amenities.map((ra) => ra.amenity),
    media: roomType.media,
    activeRoomCount: roomType.rooms.length,
    pricing,
    relatedRoomTypes: relatedRoomTypes.map((rt) => ({
      id: rt.id,
      name: rt.name,
      slug: rt.slug,
      description: rt.description,
      basePrice: Number(rt.basePrice),
      media: rt.media,
      activeRoomCount: rt.rooms.length,
    })),
  };
}
