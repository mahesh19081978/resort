import { Prisma, RateType } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/db/prisma';

export type ResolverRateType = RateType | 'BASE';

export interface ResolvedNightRate {
  date: string;                     // 'YYYY-MM-DD'
  dayOfWeek: number;                // 0 (Sun) to 6 (Sat) in Asia/Kolkata
  isWeekend: boolean;               // default Fri/Sat (5, 6) in Asia/Kolkata
  rateType: ResolverRateType;       // 'BASE' | 'WEEKEND' | 'SEASONAL' | 'FESTIVAL' | 'PROMOTION'
  ratePlanId: string;
  ratePlanCode: string;
  ratePlanName: string;
  roomRateId: string | null;        // null if falling back to RoomType.basePrice
  rateName: string | null;
  referencePrice: Prisma.Decimal;   // RoomType.basePrice (canonical default/rack price)
  appliedPrice: Prisma.Decimal;     // The winning price for this night
  discountAmount: Prisma.Decimal;   // referencePrice - appliedPrice (only positive for promotions)
  isDiscounted: boolean;            // true ONLY if rateType === 'PROMOTION' && appliedPrice < referencePrice
  offerLabel: string | null;        // e.g. "Special Offer" or rule name
  extraAdultPrice: Prisma.Decimal;
  extraChildPrice: Prisma.Decimal;
}

export interface ResolvedStayRates {
  roomTypeId: string;
  roomTypeName: string;
  ratePlanId: string;
  ratePlanCode: string;
  ratePlanName: string;
  checkInDate: string;
  checkOutDate: string;
  totalNights: number;
  nights: ResolvedNightRate[];
  totalBaseAmount: Prisma.Decimal;      // Sum of appliedPrice across all nights
  totalReferenceAmount: Prisma.Decimal; // Sum of referencePrice across all nights
  totalPromotionDiscount: Prisma.Decimal;// Sum of discountAmount across all nights
  averageNightlyRate: Prisma.Decimal;  // totalBaseAmount / totalNights (banker's rounded)
  isDiscounted: boolean;                // true if any night has an active promotional discount
  effectiveOfferLabel: string | null;   // Winning promo label if applicable
}

export interface ResolveStayRatesInput {
  roomTypeId: string;
  ratePlanId?: string; // Optional: falls back to canonical default EP plan if omitted
  checkInDate: string; // 'YYYY-MM-DD'
  checkOutDate: string; // 'YYYY-MM-DD'
  asOf?: Date;
}

export interface ResolveBatchStayRatesInput {
  roomTypeIds: string[];
  ratePlanId?: string;
  checkInDate: string;
  checkOutDate: string;
  asOf?: Date;
}

/**
 * Calculates calendar nights between two YYYY-MM-DD date strings.
 */
function getStayDateStrings(checkInDate: string, checkOutDate: string): string[] {
  const dates: string[] = [];
  const cur = new Date(`${checkInDate}T00:00:00.000Z`);
  const end = new Date(`${checkOutDate}T00:00:00.000Z`);

  if (end.getTime() <= cur.getTime()) {
    throw new Error(`Check-out date (${checkOutDate}) must be strictly after check-in date (${checkInDate}).`);
  }

  while (cur.getTime() < end.getTime()) {
    const yyyy = cur.getUTCFullYear();
    const mm = String(cur.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(cur.getUTCDate()).padStart(2, '0');
    dates.push(`${yyyy}-${mm}-${dd}`);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  return dates;
}

/**
 * Extracts day of week in Asia/Kolkata timezone (0 = Sunday, 1 = Monday, ..., 6 = Saturday).
 */
export function getKolkataDayOfWeek(dateStr: string): number {
  // ISO string noon UTC to avoid any midnight timezone boundary ambiguity
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  const dayName = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
  }).format(d);

  switch (dayName) {
    case 'Sun': return 0;
    case 'Mon': return 1;
    case 'Tue': return 2;
    case 'Wed': return 3;
    case 'Thu': return 4;
    case 'Fri': return 5;
    case 'Sat': return 6;
    default: throw new Error(`Invalid weekday name resolved for date: ${dateStr}`);
  }
}

/**
 * Tier Rank for RateType:
 * PROMOTION (1) > FESTIVAL (2) > SEASONAL (3) > WEEKEND (4)
 */
function getRateTypeTier(type: RateType): number {
  switch (type) {
    case RateType.PROMOTION: return 1;
    case RateType.FESTIVAL: return 2;
    case RateType.SEASONAL: return 3;
    case RateType.WEEKEND: return 4;
    default: return 99;
  }
}

export type CandidateRoomRate = Prisma.RoomRateGetPayload<{
  include: { ratePlan: true };
}>;

/**
 * Deterministically resolves the winning rate for a single night from candidate rules.
 *
 * Precedence hierarchy:
 * 1. Tier: PROMOTION > FESTIVAL > SEASONAL > WEEKEND
 * 2. Explicit Priority: priority DESC
 * 3. Specificity:
 *    a. Has explicit date range (startDate/endDate not null) beats open-ended rules
 *    b. Narrower date range (endDate - startDate in days ASC) beats broad season ranges
 *    c. Specific daysOfWeek filter beats all-days rule
 * 4. Stable tie-breaker:
 *    createdAt DESC -> id DESC
 */
export function resolveRoomRateForNight(params: {
  date: string;
  roomType: { id: string; name: string; basePrice: Prisma.Decimal };
  ratePlan: { id: string; code: string; name: string };
  candidateRates: CandidateRoomRate[];
}): ResolvedNightRate {
  const { date, roomType, ratePlan, candidateRates } = params;
  const dayOfWeek = getKolkataDayOfWeek(date);
  const isWeekend = dayOfWeek === 5 || dayOfWeek === 6; // Friday & Saturday nights

  const targetDateObj = new Date(`${date}T00:00:00.000Z`);

  // Filter candidates matching this specific night
  const eligible = candidateRates.filter((rule) => {
    if (rule.roomTypeId !== roomType.id) return false;
    if (rule.ratePlanId !== ratePlan.id) return false;
    if (!rule.isActive) return false;

    // Date range check (inclusive calendar dates)
    if (rule.startDate) {
      const s = new Date(rule.startDate);
      if (targetDateObj < s) return false;
    }
    if (rule.endDate) {
      const e = new Date(rule.endDate);
      if (targetDateObj > e) return false;
    }

    // Days of week check: empty array [] = all days
    if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
      if (!rule.daysOfWeek.includes(dayOfWeek)) return false;
    }

    return true;
  });

  // If no override rule matches, fall back to canonical default: RoomType.basePrice
  if (eligible.length === 0) {
    const referencePrice = new Prisma.Decimal(roomType.basePrice);
    return {
      date,
      dayOfWeek,
      isWeekend,
      rateType: 'BASE',
      ratePlanId: ratePlan.id,
      ratePlanCode: ratePlan.code,
      ratePlanName: ratePlan.name,
      roomRateId: null,
      rateName: null,
      referencePrice,
      appliedPrice: referencePrice,
      discountAmount: new Prisma.Decimal(0),
      isDiscounted: false,
      offerLabel: null,
      extraAdultPrice: new Prisma.Decimal(0),
      extraChildPrice: new Prisma.Decimal(0),
    };
  }

  // Sort eligible candidates deterministically
  eligible.sort((a, b) => {
    // 1. Tier Rank (lower number = higher precedence)
    const tierA = getRateTypeTier(a.rateType);
    const tierB = getRateTypeTier(b.rateType);
    if (tierA !== tierB) {
      return tierA - tierB;
    }

    // 2. Explicit Priority (higher integer wins)
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }

    // 3. Specificity:
    // a. Explicit date range beats open-ended
    const hasRangeA = a.startDate !== null && a.endDate !== null;
    const hasRangeB = b.startDate !== null && b.endDate !== null;
    if (hasRangeA !== hasRangeB) {
      return hasRangeA ? -1 : 1;
    }

    // b. Narrower date range wins
    if (hasRangeA && hasRangeB) {
      const spanA = new Date(a.endDate!).getTime() - new Date(a.startDate!).getTime();
      const spanB = new Date(b.endDate!).getTime() - new Date(b.startDate!).getTime();
      if (spanA !== spanB) {
        return spanA - spanB; // Narrower (smaller ms) wins
      }
    }

    // c. Specific days of week beats all days
    const hasDaysA = a.daysOfWeek && a.daysOfWeek.length > 0;
    const hasDaysB = b.daysOfWeek && b.daysOfWeek.length > 0;
    if (hasDaysA !== hasDaysB) {
      return hasDaysA ? -1 : 1;
    }

    // 4. Stable tie-breaker: createdAt DESC -> id DESC
    const timeA = new Date(a.createdAt).getTime();
    const timeB = new Date(b.createdAt).getTime();
    if (timeA !== timeB) {
      return timeB - timeA;
    }

    return b.id.localeCompare(a.id);
  });

  const winningRule = eligible[0];
  const referencePrice = new Prisma.Decimal(roomType.basePrice);
  const appliedPrice = new Prisma.Decimal(winningRule.basePrice);

  let discountAmount = new Prisma.Decimal(0);
  let isDiscounted = false;

  if (winningRule.rateType === RateType.PROMOTION) {
    if (appliedPrice.lt(referencePrice)) {
      discountAmount = referencePrice.sub(appliedPrice);
      isDiscounted = true;
    }
  }

  return {
    date,
    dayOfWeek,
    isWeekend,
    rateType: winningRule.rateType,
    ratePlanId: ratePlan.id,
    ratePlanCode: ratePlan.code,
    ratePlanName: ratePlan.name,
    roomRateId: winningRule.id,
    rateName: winningRule.name || null,
    referencePrice,
    appliedPrice,
    discountAmount,
    isDiscounted,
    offerLabel: isDiscounted ? (winningRule.name || 'Special Offer') : null,
    extraAdultPrice: new Prisma.Decimal(winningRule.extraAdultPrice),
    extraChildPrice: new Prisma.Decimal(winningRule.extraChildPrice),
  };
}

/**
 * Resolves rates for an entire stay across multiple nights in a single query batch.
 * Evaluates candidate rates in memory without executing one query per night.
 */
export async function resolveRoomRateForStay(
  input: ResolveStayRatesInput,
  client: Prisma.TransactionClient | typeof defaultPrisma = defaultPrisma
): Promise<ResolvedStayRates> {
  const stayDates = getStayDateStrings(input.checkInDate, input.checkOutDate);

  // 1. Fetch RoomType
  const roomType = await client.roomType.findUnique({
    where: { id: input.roomTypeId, isActive: true },
    select: { id: true, name: true, basePrice: true },
  });

  if (!roomType) {
    throw new Error(`ROOM_TYPE_NOT_FOUND: Room type [${input.roomTypeId}] not found or inactive.`);
  }

  // 2. Resolve RatePlan context (no silent fallback between CP and EP!)
  let ratePlan;
  if (input.ratePlanId) {
    ratePlan = await client.ratePlan.findUnique({
      where: { id: input.ratePlanId, isActive: true },
      select: { id: true, code: true, name: true },
    });
    if (!ratePlan) {
      throw new Error(`RATE_PLAN_NOT_FOUND: Configured rate plan [${input.ratePlanId}] not found or inactive.`);
    }
  } else {
    // Default public booking plan: EP (European Plan / Room Only)
    ratePlan = await client.ratePlan.findUnique({
      where: { code: 'EP', isActive: true },
      select: { id: true, code: true, name: true },
    });
    if (!ratePlan) {
      // Fallback: any active rate plan if EP code doesn't exist
      ratePlan = await client.ratePlan.findFirst({
        where: { isActive: true },
        select: { id: true, code: true, name: true },
      });
      if (!ratePlan) {
        throw new Error('RATE_PLAN_CONFIG_MISSING: No active rate plan configured in database.');
      }
    }
  }

  // 3. Single Batch Query for candidate RoomRates covering the stay window
  const checkInUtc = new Date(`${input.checkInDate}T00:00:00.000Z`);
  const checkOutUtc = new Date(`${input.checkOutDate}T00:00:00.000Z`);

  const candidateRates = await client.roomRate.findMany({
    where: {
      roomTypeId: input.roomTypeId,
      ratePlanId: ratePlan.id,
      isActive: true,
      OR: [
        { startDate: null, endDate: null },
        {
          startDate: { lte: checkOutUtc },
          endDate: { gte: checkInUtc },
        },
      ],
    },
    include: { ratePlan: true },
  });

  // 4. In-Memory Nightly Evaluation
  const nights: ResolvedNightRate[] = stayDates.map((date) =>
    resolveRoomRateForNight({
      date,
      roomType: { id: roomType.id, name: roomType.name, basePrice: new Prisma.Decimal(roomType.basePrice) },
      ratePlan,
      candidateRates,
    })
  );

  let totalBaseAmount = new Prisma.Decimal(0);
  let totalReferenceAmount = new Prisma.Decimal(0);
  let totalPromotionDiscount = new Prisma.Decimal(0);
  let isDiscounted = false;
  let effectiveOfferLabel: string | null = null;

  for (const n of nights) {
    totalBaseAmount = totalBaseAmount.add(n.appliedPrice);
    totalReferenceAmount = totalReferenceAmount.add(n.referencePrice);
    totalPromotionDiscount = totalPromotionDiscount.add(n.discountAmount);
    if (n.isDiscounted) {
      isDiscounted = true;
      if (!effectiveOfferLabel && n.offerLabel) {
        effectiveOfferLabel = n.offerLabel;
      }
    }
  }

  const averageNightlyRate = totalBaseAmount
    .div(new Prisma.Decimal(nights.length))
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_EVEN);

  return {
    roomTypeId: roomType.id,
    roomTypeName: roomType.name,
    ratePlanId: ratePlan.id,
    ratePlanCode: ratePlan.code,
    ratePlanName: ratePlan.name,
    checkInDate: input.checkInDate,
    checkOutDate: input.checkOutDate,
    totalNights: nights.length,
    nights,
    totalBaseAmount,
    totalReferenceAmount,
    totalPromotionDiscount,
    averageNightlyRate,
    isDiscounted,
    effectiveOfferLabel,
  };
}

/**
 * Batch resolves stay rates for multiple room types concurrently using a single batch query.
 */
export async function resolveBatchRoomRatesForStay(
  input: ResolveBatchStayRatesInput,
  client: Prisma.TransactionClient | typeof defaultPrisma = defaultPrisma
): Promise<Map<string, ResolvedStayRates>> {
  const stayDates = getStayDateStrings(input.checkInDate, input.checkOutDate);

  const roomTypes = await client.roomType.findMany({
    where: { id: { in: input.roomTypeIds }, isActive: true },
    select: { id: true, name: true, basePrice: true },
  });

  const roomTypeMap = new Map(roomTypes.map((rt) => [rt.id, rt]));

  let ratePlan;
  if (input.ratePlanId) {
    ratePlan = await client.ratePlan.findUnique({
      where: { id: input.ratePlanId, isActive: true },
      select: { id: true, code: true, name: true },
    });
    if (!ratePlan) {
      throw new Error(`RATE_PLAN_NOT_FOUND: Configured rate plan [${input.ratePlanId}] not found or inactive.`);
    }
  } else {
    ratePlan = await client.ratePlan.findUnique({
      where: { code: 'EP', isActive: true },
      select: { id: true, code: true, name: true },
    });
    if (!ratePlan) {
      ratePlan = await client.ratePlan.findFirst({
        where: { isActive: true },
        select: { id: true, code: true, name: true },
      });
      if (!ratePlan) {
        throw new Error('RATE_PLAN_CONFIG_MISSING: No active rate plan configured in database.');
      }
    }
  }

  const checkInUtc = new Date(`${input.checkInDate}T00:00:00.000Z`);
  const checkOutUtc = new Date(`${input.checkOutDate}T00:00:00.000Z`);

  // SINGLE database query for all room types in batch
  const candidateRates = await client.roomRate.findMany({
    where: {
      roomTypeId: { in: input.roomTypeIds },
      ratePlanId: ratePlan.id,
      isActive: true,
      OR: [
        { startDate: null, endDate: null },
        {
          startDate: { lte: checkOutUtc },
          endDate: { gte: checkInUtc },
        },
      ],
    },
    include: { ratePlan: true },
  });

  // Group candidate rates by roomTypeId
  const candidatesByRoomType = new Map<string, CandidateRoomRate[]>();
  for (const c of candidateRates) {
    const list = candidatesByRoomType.get(c.roomTypeId) || [];
    list.push(c);
    candidatesByRoomType.set(c.roomTypeId, list);
  }

  const results = new Map<string, ResolvedStayRates>();

  for (const roomTypeId of input.roomTypeIds) {
    const rt = roomTypeMap.get(roomTypeId);
    if (!rt) continue;

    const ratesForType = candidatesByRoomType.get(roomTypeId) || [];
    const nights: ResolvedNightRate[] = stayDates.map((date) =>
      resolveRoomRateForNight({
        date,
        roomType: { id: rt.id, name: rt.name, basePrice: new Prisma.Decimal(rt.basePrice) },
        ratePlan,
        candidateRates: ratesForType,
      })
    );

    let totalBaseAmount = new Prisma.Decimal(0);
    let totalReferenceAmount = new Prisma.Decimal(0);
    let totalPromotionDiscount = new Prisma.Decimal(0);
    let isDiscounted = false;
    let effectiveOfferLabel: string | null = null;

    for (const n of nights) {
      totalBaseAmount = totalBaseAmount.add(n.appliedPrice);
      totalReferenceAmount = totalReferenceAmount.add(n.referencePrice);
      totalPromotionDiscount = totalPromotionDiscount.add(n.discountAmount);
      if (n.isDiscounted) {
        isDiscounted = true;
        if (!effectiveOfferLabel && n.offerLabel) {
          effectiveOfferLabel = n.offerLabel;
        }
      }
    }

    const averageNightlyRate = totalBaseAmount
      .div(new Prisma.Decimal(nights.length))
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_EVEN);

    results.set(roomTypeId, {
      roomTypeId: rt.id,
      roomTypeName: rt.name,
      ratePlanId: ratePlan.id,
      ratePlanCode: ratePlan.code,
      ratePlanName: ratePlan.name,
      checkInDate: input.checkInDate,
      checkOutDate: input.checkOutDate,
      totalNights: nights.length,
      nights,
      totalBaseAmount,
      totalReferenceAmount,
      totalPromotionDiscount,
      averageNightlyRate,
      isDiscounted,
      effectiveOfferLabel,
    });
  }

  return results;
}
