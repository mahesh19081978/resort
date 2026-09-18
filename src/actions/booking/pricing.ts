'use server';

import { calculateBookingPrice } from '@/lib/booking/pricing-calculator';
import { ok, fail, ActionResult } from '@/lib/errors';
import { prisma } from '@/lib/db/prisma';
import { PUBLIC_DEFAULT_RATE_PLAN_CODE, resolveRatePlanByCode } from '@/lib/booking/rate-resolver';

export async function getPublicRatePlanId(): Promise<ActionResult<string>> {
  try {
    const plan = await resolveRatePlanByCode(PUBLIC_DEFAULT_RATE_PLAN_CODE);
    return ok(plan.id);
  } catch (error: any) {
    return fail(error?.message || 'Failed to resolve public rate plan.', 'INTERNAL_ERROR');
  }
}

export interface PublicPricingItem {
  roomTypeId: string;
  roomsCount: number;
}

export interface PublicPricingInput {
  checkInDate: string;
  checkOutDate: string;
  rooms: PublicPricingItem[];
  ratePlanId?: string;
}

export interface PublicNightRate {
  date: string;
  dayOfWeek: number;
  isWeekend: boolean;
  rateType: string;
  rateName: string | null;
  appliedPrice: number;
  referencePrice: number;
  discountAmount: number;
  isDiscounted: boolean;
  offerLabel: string | null;
}

export interface PublicPricingLine {
  roomTypeId: string;
  name: string;
  basePrice: number; // Rack/Reference price
  roomsCount: number;
  totalNights: number;
  ratePerNight: number; // Effective average nightly rate
  discountAmount: number;
  taxAmount: number;
  lineTotal: number;
  isDiscounted?: boolean;
  offerLabel?: string | null;
  nightlyRates?: PublicNightRate[];
}

export interface PublicPricingSummary {
  subtotal: number;
  taxAmount: number;
  taxRatePercent: number;
  taxCode: string;
  discountAmount: number;
  netTaxableAmount: number;
  totalAmount: number;
  requiredAdvanceAmount: number;
  balanceAtHotel: number;
  nights: number;
  currency: string;
  lines: PublicPricingLine[];
}

/**
 * Server-side Public Booking Pricing Preview Action.
 *
 * NOTE: This is strictly an informational preview for the client UI.
 * It consumes the single canonical calculateBookingPrice() engine.
 * The booking creation flow (createReservationHold) recalculates pricing
 * independently on the server and never trusts client-submitted totals.
 */
export async function calculatePublicPricingAction(
  rawInput: PublicPricingInput
): Promise<ActionResult<PublicPricingSummary>> {
  try {
    if (!rawInput || typeof rawInput !== 'object') {
      return fail('Invalid pricing request payload.', 'VALIDATION_ERROR');
    }

    const { checkInDate, checkOutDate, rooms } = rawInput;

    if (!checkInDate || !checkOutDate) {
      return fail('Check-in and check-out dates are required.', 'VALIDATION_ERROR');
    }

    if (!Array.isArray(rooms) || rooms.length === 0) {
      return fail('At least one room is required.', 'VALIDATION_ERROR');
    }

    for (const r of rooms) {
      if (!r.roomTypeId || typeof r.roomTypeId !== 'string') {
        return fail('Invalid room category selected.', 'VALIDATION_ERROR');
      }
      if (!r.roomsCount || typeof r.roomsCount !== 'number' || r.roomsCount < 1) {
        return fail('Room count must be at least 1.', 'VALIDATION_ERROR');
      }
    }

    // SECURITY: Enforce server-side public rate plan. Never trust client-submitted ratePlanId.
    const publicPlan = await resolveRatePlanByCode(PUBLIC_DEFAULT_RATE_PLAN_CODE);

    const result = await calculateBookingPrice(
      {
        checkInDate,
        checkOutDate,
        rooms: rooms.map((r) => ({
          roomTypeId: r.roomTypeId,
          roomsCount: r.roomsCount,
        })),
        ratePlanId: publicPlan.id,
      },
      prisma
    );

    const subtotal = result.subtotal.toNumber();
    const totalAmount = result.totalAmount.toNumber();
    const requiredAdvanceAmount = result.requiredAdvanceAmount.toNumber();
    const balanceAtHotel = result.totalAmount.sub(result.requiredAdvanceAmount).toNumber();

    return ok({
      subtotal,
      taxAmount: result.taxAmount.toNumber(),
      taxRatePercent: result.taxRatePercent.toNumber(),
      taxCode: result.taxCode,
      discountAmount: result.discountAmount.toNumber(),
      netTaxableAmount: result.netTaxableAmount.toNumber(),
      totalAmount,
      requiredAdvanceAmount,
      balanceAtHotel,
      nights: result.nights,
      currency: result.currency,
      lines: result.roomDetails.map((l) => ({
        roomTypeId: l.roomTypeId,
        name: l.name,
        basePrice: l.basePrice.toNumber(),
        roomsCount: l.roomsCount,
        totalNights: l.totalNights,
        ratePerNight: l.ratePerNight.toNumber(),
        discountAmount: l.discountAmount.toNumber(),
        taxAmount: l.taxAmount.toNumber(),
        lineTotal: l.lineTotal.toNumber(),
        isDiscounted: l.isDiscounted,
        offerLabel: l.offerLabel,
        nightlyRates: l.nightlyRateSnapshot?.map((n) => ({
          date: n.date,
          dayOfWeek: n.dayOfWeek,
          isWeekend: n.isWeekend,
          rateType: n.rateType,
          rateName: n.rateName,
          appliedPrice: n.appliedPrice.toNumber(),
          referencePrice: n.referencePrice.toNumber(),
          discountAmount: n.discountAmount.toNumber(),
          isDiscounted: n.isDiscounted,
          offerLabel: n.offerLabel,
        })),
      })),
    });
  } catch (error: any) {
    console.error('[CALCULATE_PUBLIC_PRICING_ERROR]', error);
    return fail(
      error?.message || 'Failed to calculate room pricing.',
      'BUSINESS_RULE_VIOLATION'
    );
  }
}
