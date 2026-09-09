import { Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/db/prisma';

export interface RoomLinePricingInput {
  roomTypeId: string;
  roomsCount: number;
  basePrice: Prisma.Decimal | number | string;
  nights: number;
}

export interface CalculatedRoomLine {
  roomTypeId: string;
  roomsCount: number;
  ratePerNight: Prisma.Decimal;
  totalNights: number;
  discountAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
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
  }>;
  discountAmount?: Prisma.Decimal | number;
  depositRatio?: Prisma.Decimal | number;
}

export interface CanonicalPricingResult extends ReservationPricingResult {
  taxRatePercent: Prisma.Decimal;
  taxCode: string;
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
  }> = [];

  for (const item of params.items) {
    const ratePerNight = roundCurrency(new Prisma.Decimal(item.basePrice));
    const nights = item.nights;
    const count = new Prisma.Decimal(item.roomsCount);
    const lineBase = roundCurrency(ratePerNight.mul(nights).mul(count));

    subtotal = subtotal.add(lineBase);
    preTaxLines.push({
      roomTypeId: item.roomTypeId,
      roomsCount: item.roomsCount,
      ratePerNight,
      totalNights: nights,
      lineBase,
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
 * 3. Authoritative DB Tax retrieval (code: 'ROOM_GST', isActive: true).
 *    CRITICAL: Fails closed with an explicit error if tax configuration is missing.
 *    NEVER falls back silently to an arbitrary number.
 * 4. Pure Decimal arithmetic with Banker's Rounding (ROUND_HALF_EVEN) via calculateReservationPricing.
 */
export async function calculateBookingPrice(
  input: CalculateBookingPriceInput,
  client: Prisma.TransactionClient | typeof defaultPrisma = defaultPrisma
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

  // Authoritative Tax Record from DB (Strict: No silent fallback!)
  const taxRecord = await client.tax.findFirst({
    where: { code: 'ROOM_GST', isActive: true },
  });

  if (!taxRecord) {
    throw new Error("Active room accommodation tax configuration (code: 'ROOM_GST') not found in database.");
  }

  const pricingItems: RoomLinePricingInput[] = input.rooms.map((item) => {
    const rt = roomTypeMap.get(item.roomTypeId)!;
    return {
      roomTypeId: item.roomTypeId,
      roomsCount: item.roomsCount,
      basePrice: rt.basePrice,
      nights,
    };
  });

  const pricing = calculateReservationPricing({
    items: pricingItems,
    taxRatePercent: taxRecord.rate,
    depositRatio: input.depositRatio ?? 1.0,
    discountAmount: input.discountAmount ?? 0,
  });

  const roomDetails = pricing.lines.map((l) => {
    const rt = roomTypeMap.get(l.roomTypeId)!;
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
    };
  });

  return {
    ...pricing,
    taxRatePercent: taxRecord.rate,
    taxCode: taxRecord.code,
    nights,
    currency: 'INR',
    roomDetails,
  };
}

