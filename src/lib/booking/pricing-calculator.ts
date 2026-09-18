import { Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/db/prisma';
import { resolveTaxForRoom } from '@/lib/db/tax';

import { resolveBatchRoomRatesForStay, ResolvedStayRates, ResolvedNightRate } from './rate-resolver';

export interface RoomLinePricingInput {
  roomTypeId: string;
  roomsCount: number;
  basePrice: Prisma.Decimal | number | string;
  nights: number;
  nightlyRates?: ResolvedNightRate[];
}

export interface CalculatedRoomLine {
  roomTypeId: string;
  roomsCount: number;
  ratePerNight: Prisma.Decimal;
  totalNights: number;
  discountAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  nightlyRates?: ResolvedNightRate[];
}

export interface ReservationPricingResult {
  lines: CalculatedRoomLine[];
  subtotal: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  netTaxableAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  requiredAdvanceAmount: Prisma.Decimal;
}

export interface CalculateBookingPriceInput {
  checkInDate: string;
  checkOutDate: string;
  rooms: Array<{
    roomTypeId: string;
    roomsCount: number;
    ratePlanId?: string;
  }>;
  ratePlanId?: string;
  discountAmount?: Prisma.Decimal | number;
  depositRatio?: Prisma.Decimal | number;
}

export interface CanonicalPricingResult extends ReservationPricingResult {
  taxId: string;
  taxRatePercent: Prisma.Decimal;
  taxCode: string;
  taxName: string;
  nights: number;
  currency: 'INR';
  roomDetails: Array<{
    roomTypeId: string;
    name: string;
    basePrice: Prisma.Decimal;
    roomsCount: number;
    totalNights: number;
    ratePerNight: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
    isDiscounted?: boolean;
    offerLabel?: string | null;
    nightlyRateSnapshot?: ResolvedNightRate[];
  }>;
}

/**
 * Centralized financial rounding helper.
 * Uses pure Decimal with Banker's Rounding (ROUND_HALF_EVEN) to 2 decimal places.
 * Zero JavaScript Math or floating point operators.
 */
export function roundCurrency(amount: Prisma.Decimal): Prisma.Decimal {
  return amount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_EVEN);
}

/**
 * Computes calendar nights between two YYYY-MM-DD date strings without timezone shifts.
 */
export function calculateNights(checkIn: string, checkOut: string): number {
  const dIn = new Date(`${checkIn}T00:00:00.000Z`);
  const dOut = new Date(`${checkOut}T00:00:00.000Z`);
  const diffMs = dOut.getTime() - dIn.getTime();
  const nights = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (nights <= 0) {
    throw new Error(`Check-out date (${checkOut}) must be strictly after check-in date (${checkIn}).`);
  }
  return nights;
}

/**
 * Authoritative 9-Step Pricing Pipeline:
 * Step 1: Nightly Room Rate (from DB RoomType)
 * Step 2: Total Nights (checkOut - checkIn)
 * Step 3: Line Base = Nightly Rate * Nights * Rooms Count
 * Step 4: Subtotal = SUM(Line Base)
 * Step 5: Discount Amount = Decimal(0.00) (or promotional discount)
 * Step 6: Net Taxable Amount = MAX(0.00, Subtotal - Discount Amount)
 * Step 7: Tax Amount = Net Taxable * (taxRate / 100) (tax rate from DB Tax record)
 * Step 8: Final Total Amount = Net Taxable + Tax Amount
 * Step 9: Required Advance Amount = Final Total * (depositRatio)
 */
export function calculateReservationPricing(params: {
  items: RoomLinePricingInput[];
  taxRatePercent: Prisma.Decimal | number; // Queried from DB Tax record
  depositRatio?: Prisma.Decimal | number; // Defaults to 1.0 (100% advance) from DB / config
  discountAmount?: Prisma.Decimal | number;
}): ReservationPricingResult {
  const taxRate = new Prisma.Decimal(params.taxRatePercent);
  const depositRatio = new Prisma.Decimal(params.depositRatio ?? 1.0);
  const totalDiscount = new Prisma.Decimal(params.discountAmount ?? 0);

  let subtotal = new Prisma.Decimal(0);
  const preTaxLines: Array<{
    roomTypeId: string;
    roomsCount: number;
    ratePerNight: Prisma.Decimal;
    totalNights: number;
    lineBase: Prisma.Decimal;
    nightlyRates?: ResolvedNightRate[];
  }> = [];

  for (const item of params.items) {
    let lineBase: Prisma.Decimal;
    let ratePerNight: Prisma.Decimal;

    if (item.nightlyRates && item.nightlyRates.length > 0) {
      // Sum of dynamic nightly rates for 1 room:
      const singleRoomNightSum = item.nightlyRates.reduce(
        (sum, n) => sum.add(n.appliedPrice),
        new Prisma.Decimal(0)
      );
      const count = new Prisma.Decimal(item.roomsCount);
      lineBase = roundCurrency(singleRoomNightSum.mul(count));
      ratePerNight = roundCurrency(singleRoomNightSum.div(new Prisma.Decimal(item.nights)));
    } else {
      ratePerNight = roundCurrency(new Prisma.Decimal(item.basePrice));
      const count = new Prisma.Decimal(item.roomsCount);
      lineBase = roundCurrency(ratePerNight.mul(item.nights).mul(count));
    }

    subtotal = subtotal.add(lineBase);
    preTaxLines.push({
      roomTypeId: item.roomTypeId,
      roomsCount: item.roomsCount,
      ratePerNight,
      totalNights: item.nights,
      lineBase,
      nightlyRates: item.nightlyRates,
    });
  }

  const discountAmount = roundCurrency(Prisma.Decimal.min(subtotal, totalDiscount));
  const netTaxableAmount = roundCurrency(Prisma.Decimal.max(new Prisma.Decimal(0), subtotal.sub(discountAmount)));

  // Tax on net taxable
  const taxMultiplier = taxRate.div(new Prisma.Decimal(100));
  const totalTax = roundCurrency(netTaxableAmount.mul(taxMultiplier));
  const totalAmount = roundCurrency(netTaxableAmount.add(totalTax));
  const requiredAdvanceAmount = roundCurrency(totalAmount.mul(depositRatio));

  // Distribute tax and discounts proportionately to lines for ReservationRoom snapshots
  let allocatedTax = new Prisma.Decimal(0);
  let allocatedDiscount = new Prisma.Decimal(0);
  const lines: CalculatedRoomLine[] = [];

  for (let i = 0; i < preTaxLines.length; i++) {
    const l = preTaxLines[i];
    const isLast = i === preTaxLines.length - 1;

    let lineDiscount = new Prisma.Decimal(0);
    let lineTax = new Prisma.Decimal(0);

    if (subtotal.greaterThan(0)) {
      const lineRatio = l.lineBase.div(subtotal);
      if (isLast) {
        lineDiscount = discountAmount.sub(allocatedDiscount);
        lineTax = totalTax.sub(allocatedTax);
      } else {
        lineDiscount = roundCurrency(discountAmount.mul(lineRatio));
        lineTax = roundCurrency(totalTax.mul(lineRatio));
        allocatedDiscount = allocatedDiscount.add(lineDiscount);
        allocatedTax = allocatedTax.add(lineTax);
      }
    }

    const lineTotal = roundCurrency(l.lineBase.sub(lineDiscount).add(lineTax));

    lines.push({
      roomTypeId: l.roomTypeId,
      roomsCount: l.roomsCount,
      ratePerNight: l.ratePerNight,
      totalNights: l.totalNights,
      discountAmount: lineDiscount,
      taxAmount: lineTax,
      lineTotal,
      nightlyRates: l.nightlyRates,
    });
  }

  return {
    lines,
    subtotal,
    discountAmount,
    netTaxableAmount,
    taxAmount: totalTax,
    totalAmount,
    requiredAdvanceAmount,
  };
}

/**
 * Single Authoritative Canonical Server-Side Booking Pricing Engine.
 *
 * Enforces:
 * 1. Strict calendar nights calculation.
 * 2. RoomType existence and active check.
 * 3. Authoritative scope-based Tax resolution via resolveTaxForRoom().
 *    CRITICAL: Fails closed with an explicit error if tax configuration is missing.
 *    NEVER falls back silently to an arbitrary number.
 * 4. Pure Decimal arithmetic with Banker's Rounding (ROUND_HALF_EVEN) via calculateReservationPricing.
 * 5. Single authoritative asOf timestamp used throughout to prevent boundary inconsistencies.
 */
export async function calculateBookingPrice(
  input: CalculateBookingPriceInput,
  client: Prisma.TransactionClient | typeof defaultPrisma = defaultPrisma,
  asOf: Date = new Date()
): Promise<CanonicalPricingResult> {
  if (!input.checkInDate || !input.checkOutDate) {
    throw new Error('Check-in and check-out dates are required.');
  }

  const nights = calculateNights(input.checkInDate, input.checkOutDate);

  if (!input.rooms || input.rooms.length === 0) {
    throw new Error('At least one room is required for pricing calculation.');
  }

  for (const r of input.rooms) {
    if (!r.roomTypeId || typeof r.roomTypeId !== 'string') {
      throw new Error('Valid roomTypeId is required for all requested rooms.');
    }
    if (!r.roomsCount || r.roomsCount < 1) {
      throw new Error('Rooms count must be at least 1 for all requested rooms.');
    }
  }

  const roomTypeIds = Array.from(new Set(input.rooms.map((r) => r.roomTypeId)));
  const roomTypes = await client.roomType.findMany({
    where: { id: { in: roomTypeIds }, isActive: true },
  });

  if (roomTypes.length !== roomTypeIds.length) {
    throw new Error('One or more selected room types are invalid or inactive.');
  }

  const roomTypeMap = new Map(roomTypes.map((rt) => [rt.id, rt]));

  // Authoritative Scope-Based Tax Resolution (No hardcoded tax codes!)
  const resolvedTax = await resolveTaxForRoom(asOf, client);

  // Authoritative Rate Resolution (Single Batch Query across all requested room types)
  const resolvedStayRatesMap = await resolveBatchRoomRatesForStay(
    {
      roomTypeIds,
      ratePlanId: input.ratePlanId,
      checkInDate: input.checkInDate,
      checkOutDate: input.checkOutDate,
      asOf,
    },
    client
  );

  const pricingItems: RoomLinePricingInput[] = input.rooms.map((item) => {
    const rt = roomTypeMap.get(item.roomTypeId)!;
    const resolvedRates = resolvedStayRatesMap.get(item.roomTypeId);

    return {
      roomTypeId: item.roomTypeId,
      roomsCount: item.roomsCount,
      basePrice: rt.basePrice,
      nights,
      nightlyRates: resolvedRates?.nights,
    };
  });

  const pricing = calculateReservationPricing({
    items: pricingItems,
    taxRatePercent: resolvedTax.taxRate,
    depositRatio: input.depositRatio ?? 1.0,
    discountAmount: input.discountAmount ?? 0,
  });

  const roomDetails = pricing.lines.map((l) => {
    const rt = roomTypeMap.get(l.roomTypeId)!;
    const resolvedRates = resolvedStayRatesMap.get(l.roomTypeId);

    return {
      roomTypeId: l.roomTypeId,
      name: rt.name,
      basePrice: new Prisma.Decimal(rt.basePrice),
      roomsCount: l.roomsCount,
      totalNights: l.totalNights,
      ratePerNight: l.ratePerNight,
      discountAmount: l.discountAmount,
      taxAmount: l.taxAmount,
      lineTotal: l.lineTotal,
      isDiscounted: resolvedRates?.isDiscounted ?? false,
      offerLabel: resolvedRates?.effectiveOfferLabel ?? null,
      nightlyRateSnapshot: l.nightlyRates,
    };
  });

  return {
    ...pricing,
    taxId: resolvedTax.taxId,
    taxRatePercent: resolvedTax.taxRate,
    taxCode: resolvedTax.taxCode,
    taxName: resolvedTax.taxName,
    nights,
    currency: 'INR',
    roomDetails,
  };
}
