import { Prisma } from '@prisma/client';

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
