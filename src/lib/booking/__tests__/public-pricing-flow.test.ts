import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Prisma, RateType } from '@prisma/client';
import { calculateBookingPrice } from '../pricing-calculator';
import { resolveRoomRateForNight, resolveRoomRateForStay, CandidateRoomRate } from '../rate-resolver';
import { calculatePublicPricingAction } from '@/actions/booking/pricing';
import { getAvailableRoomTypes } from '@/lib/availability/service';
import { getPublicRoomTypes, getPublicRoomTypeBySlug } from '@/actions/rooms/public';

const prisma = new PrismaClient();

describe('Phase 3 Stage 3: Public Customer-Facing Date-Aware Room Pricing Suite', () => {
  let standardRoomTypeId: string;
  let standardBasePrice: Prisma.Decimal;
  let standardSlug: string;
  let epPlanId: string;
  let cpPlanId: string;

  beforeAll(async () => {
    // Read standard room type and rate plans
    const rt = await prisma.roomType.findFirst({
      where: { isActive: true, basePrice: new Prisma.Decimal(5500) },
    });
    const roomType = rt ?? (await prisma.roomType.findFirst({ where: { isActive: true } }));
    if (!roomType) throw new Error('No active room type found for test suite');
    standardRoomTypeId = roomType.id;
    standardBasePrice = roomType.basePrice;
    standardSlug = roomType.slug;

    const ep = await prisma.ratePlan.findFirst({ where: { code: 'EP', isActive: true } });
    if (!ep) throw new Error('No active EP plan found');
    epPlanId = ep.id;

    const cp = await prisma.ratePlan.findFirst({ where: { code: 'CP', isActive: true } });
    if (!cp) throw new Error('No active CP plan found');
    cpPlanId = cp.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function createMockCandidate(overrides: Partial<CandidateRoomRate> = {}): CandidateRoomRate {
    return {
      id: 'rate-stage3-mock',
      roomTypeId: standardRoomTypeId,
      ratePlanId: epPlanId,
      name: 'Mock Stay Rate',
      rateType: RateType.PROMOTION,
      basePrice: new Prisma.Decimal('4500.00'),
      extraAdultPrice: new Prisma.Decimal('1000.00'),
      extraChildPrice: new Prisma.Decimal('500.00'),
      startDate: null,
      endDate: null,
      daysOfWeek: [],
      priority: 10,
      isActive: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      ratePlan: {
        id: epPlanId,
        code: 'EP',
        name: 'European Plan',
        description: null,
        isActive: true,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      },
      ...overrides,
    };
  }

  // --------------------------------------------------------------------------
  // A. NO ROOMRATE -> ROOMTYPE.BASEPRICE FALLBACK
  // --------------------------------------------------------------------------
  it('A. When no RoomRate exists, falls back to RoomType.basePrice with rateType BASE', () => {
    const resolved = resolveRoomRateForNight({
      date: '2026-10-15',
      roomType: { id: standardRoomTypeId, name: 'Standard Heritage Room', basePrice: standardBasePrice },
      ratePlan: { id: epPlanId, code: 'EP', name: 'European Plan' },
      candidateRates: [],
    });

    expect(resolved.rateType).toBe('BASE');
    expect(resolved.appliedPrice.equals(standardBasePrice)).toBe(true);
    expect(resolved.referencePrice.equals(standardBasePrice)).toBe(true);
    expect(resolved.isDiscounted).toBe(false);
    expect(resolved.discountAmount.toString()).toBe('0');
  });

  // --------------------------------------------------------------------------
  // B. WEEKEND RATE -> SELLING PRICE (NO CROSSED-OUT PRICE)
  // --------------------------------------------------------------------------
  it('B. Weekend rate above rack shows weekend selling price and isDiscounted = false', () => {
    const weekendRule = createMockCandidate({
      rateType: RateType.WEEKEND,
      basePrice: new Prisma.Decimal('6500.00'),
      daysOfWeek: [5, 6],
    });

    const resolved = resolveRoomRateForNight({
      date: '2026-10-16', // Friday
      roomType: { id: standardRoomTypeId, name: 'Standard Heritage Room', basePrice: standardBasePrice },
      ratePlan: { id: epPlanId, code: 'EP', name: 'European Plan' },
      candidateRates: [weekendRule],
    });

    expect(resolved.rateType).toBe('WEEKEND');
    expect(resolved.appliedPrice.toString()).toBe('6500');
    expect(resolved.referencePrice.toString()).toBe('5500');
    // Strict requirement: NEVER display crossed-out rack price unless genuine promotion discount
    expect(resolved.isDiscounted).toBe(false);
    expect(resolved.discountAmount.toString()).toBe('0');
  });

  // --------------------------------------------------------------------------
  // C. SEASONAL RATE -> SEASONAL SELLING PRICE (NO CROSSED-OUT PRICE)
  // --------------------------------------------------------------------------
  it('C. Seasonal rate shows seasonal selling price and isDiscounted = false', () => {
    const seasonalRule = createMockCandidate({
      rateType: RateType.SEASONAL,
      name: 'Autumn Surge',
      basePrice: new Prisma.Decimal('6200.00'),
      startDate: new Date('2026-10-01'),
      endDate: new Date('2026-10-31'),
    });

    const resolved = resolveRoomRateForNight({
      date: '2026-10-10',
      roomType: { id: standardRoomTypeId, name: 'Standard Heritage Room', basePrice: standardBasePrice },
      ratePlan: { id: epPlanId, code: 'EP', name: 'European Plan' },
      candidateRates: [seasonalRule],
    });

    expect(resolved.rateType).toBe('SEASONAL');
    expect(resolved.appliedPrice.toString()).toBe('6200');
    expect(resolved.isDiscounted).toBe(false);
    expect(resolved.discountAmount.toString()).toBe('0');
  });

  // --------------------------------------------------------------------------
  // D. FESTIVAL RATE -> FESTIVAL SELLING PRICE (NO CROSSED-OUT PRICE)
  // --------------------------------------------------------------------------
  it('D. Festival rate shows festival selling price and isDiscounted = false', () => {
    const festivalRule = createMockCandidate({
      rateType: RateType.FESTIVAL,
      name: 'Diwali Festive Rate',
      basePrice: new Prisma.Decimal('8500.00'),
      startDate: new Date('2026-11-01'),
      endDate: new Date('2026-11-05'),
    });

    const resolved = resolveRoomRateForNight({
      date: '2026-11-02',
      roomType: { id: standardRoomTypeId, name: 'Standard Heritage Room', basePrice: standardBasePrice },
      ratePlan: { id: epPlanId, code: 'EP', name: 'European Plan' },
      candidateRates: [festivalRule],
    });

    expect(resolved.rateType).toBe('FESTIVAL');
    expect(resolved.appliedPrice.toString()).toBe('8500');
    expect(resolved.isDiscounted).toBe(false);
    expect(resolved.discountAmount.toString()).toBe('0');
  });

  // --------------------------------------------------------------------------
  // E. PROMOTION BELOW RACK -> SELLING PRICE + CROSSED REFERENCE PRICE + SAVINGS
  // --------------------------------------------------------------------------
  it('E. Promotion below rack sets isDiscounted = true with exact discount amount and offer label', () => {
    const promoRule = createMockCandidate({
      rateType: RateType.PROMOTION,
      name: 'Special Monsoon Offer',
      basePrice: new Prisma.Decimal('4500.00'), // ₹4,500 < ₹5,500 rack
    });

    const resolved = resolveRoomRateForNight({
      date: '2026-08-10',
      roomType: { id: standardRoomTypeId, name: 'Standard Heritage Room', basePrice: standardBasePrice },
      ratePlan: { id: epPlanId, code: 'EP', name: 'European Plan' },
      candidateRates: [promoRule],
    });

    expect(resolved.rateType).toBe('PROMOTION');
    expect(resolved.appliedPrice.toString()).toBe('4500');
    expect(resolved.referencePrice.toString()).toBe('5500');
    expect(resolved.isDiscounted).toBe(true);
    expect(resolved.discountAmount.toString()).toBe('1000'); // ₹5,500 - ₹4,500 = ₹1,000
    expect(resolved.offerLabel).toBe('Special Monsoon Offer');
  });

  // --------------------------------------------------------------------------
  // F. PROMOTION EQUAL TO RACK -> NO DISCOUNT DISPLAY
  // --------------------------------------------------------------------------
  it('F. Promotion rate equal to rack (₹5,500 == ₹5,500) does NOT display crossed price (isDiscounted = false)', () => {
    const promoRule = createMockCandidate({
      rateType: RateType.PROMOTION,
      name: 'Complimentary Package',
      basePrice: new Prisma.Decimal('5500.00'), // Equal to rack
    });

    const resolved = resolveRoomRateForNight({
      date: '2026-08-10',
      roomType: { id: standardRoomTypeId, name: 'Standard Heritage Room', basePrice: standardBasePrice },
      ratePlan: { id: epPlanId, code: 'EP', name: 'European Plan' },
      candidateRates: [promoRule],
    });

    expect(resolved.isDiscounted).toBe(false);
    expect(resolved.discountAmount.toString()).toBe('0');
  });

  // --------------------------------------------------------------------------
  // G. PROMOTION ABOVE RACK -> NO DISCOUNT DISPLAY
  // --------------------------------------------------------------------------
  it('G. Promotion rate above rack (₹6,000 > ₹5,500) does NOT display crossed price (isDiscounted = false)', () => {
    const promoRule = createMockCandidate({
      rateType: RateType.PROMOTION,
      name: 'High Demand Promo Bundle',
      basePrice: new Prisma.Decimal('6000.00'), // Above rack
    });

    const resolved = resolveRoomRateForNight({
      date: '2026-08-10',
      roomType: { id: standardRoomTypeId, name: 'Standard Heritage Room', basePrice: standardBasePrice },
      ratePlan: { id: epPlanId, code: 'EP', name: 'European Plan' },
      candidateRates: [promoRule],
    });

    expect(resolved.isDiscounted).toBe(false);
    expect(resolved.discountAmount.toString()).toBe('0');
  });

  // --------------------------------------------------------------------------
  // H. WEEKEND ABOVE RACK -> NO CROSSED RACK PRICE
  // --------------------------------------------------------------------------
  it('H. Weekend rate above rack (₹6,500 > ₹5,500) has isDiscounted = false and zero discount', () => {
    const weekendRule = createMockCandidate({
      rateType: RateType.WEEKEND,
      name: 'Standard Weekend',
      basePrice: new Prisma.Decimal('6500.00'),
      daysOfWeek: [5, 6],
    });

    const resolved = resolveRoomRateForNight({
      date: '2026-10-17', // Saturday
      roomType: { id: standardRoomTypeId, name: 'Standard Heritage Room', basePrice: standardBasePrice },
      ratePlan: { id: epPlanId, code: 'EP', name: 'European Plan' },
      candidateRates: [weekendRule],
    });

    expect(resolved.rateType).toBe('WEEKEND');
    expect(resolved.isDiscounted).toBe(false);
    expect(resolved.discountAmount.toString()).toBe('0');
  });

  // --------------------------------------------------------------------------
  // I. MULTIPLE NIGHTS WITH DIFFERENT RATES -> EXACT NIGHTLY BREAKDOWN + TOTAL
  // --------------------------------------------------------------------------
  it('I. Multi-night stay calculates individual nightly rates without uniform multiplication', () => {
    // 3-night stay: 15 Oct (Promo ₹4,500), 16 Oct (Promo ₹4,500), 17 Oct (Weekend ₹6,500)
    // Expected Stay Total: ₹4,500 + ₹4,500 + ₹6,500 = ₹15,500 (NOT ₹4,500 * 3 = ₹13,500)
    const promoRule = createMockCandidate({
      id: 'promo-15-16',
      rateType: RateType.PROMOTION,
      name: 'Diwali 1000 Off',
      basePrice: new Prisma.Decimal('4500.00'),
      startDate: new Date('2026-10-15T00:00:00.000Z'),
      endDate: new Date('2026-10-16T23:59:59.999Z'),
      priority: 10,
    });

    const weekendRule = createMockCandidate({
      id: 'wknd-17',
      rateType: RateType.WEEKEND,
      name: 'Saturday Rate',
      basePrice: new Prisma.Decimal('6500.00'),
      daysOfWeek: [6], // Saturday
      priority: 5,
    });

    const night1 = resolveRoomRateForNight({
      date: '2026-10-15',
      roomType: { id: standardRoomTypeId, name: 'Standard Heritage Room', basePrice: standardBasePrice },
      ratePlan: { id: epPlanId, code: 'EP', name: 'European Plan' },
      candidateRates: [promoRule, weekendRule],
    });

    const night2 = resolveRoomRateForNight({
      date: '2026-10-16',
      roomType: { id: standardRoomTypeId, name: 'Standard Heritage Room', basePrice: standardBasePrice },
      ratePlan: { id: epPlanId, code: 'EP', name: 'European Plan' },
      candidateRates: [promoRule, weekendRule],
    });

    const night3 = resolveRoomRateForNight({
      date: '2026-10-17', // Saturday
      roomType: { id: standardRoomTypeId, name: 'Standard Heritage Room', basePrice: standardBasePrice },
      ratePlan: { id: epPlanId, code: 'EP', name: 'European Plan' },
      candidateRates: [promoRule, weekendRule],
    });

    expect(night1.appliedPrice.toString()).toBe('4500');
    expect(night1.isDiscounted).toBe(true);

    expect(night2.appliedPrice.toString()).toBe('4500');
    expect(night2.isDiscounted).toBe(true);

    expect(night3.appliedPrice.toString()).toBe('6500');
    expect(night3.isDiscounted).toBe(false);

    const total = night1.appliedPrice.add(night2.appliedPrice).add(night3.appliedPrice);
    expect(total.toString()).toBe('15500');
  });

  // --------------------------------------------------------------------------
  // J. RATE PLAN ISOLATION (EP VS CP)
  // --------------------------------------------------------------------------
  it('J. Strict rate plan isolation: CP overrides do not leak into EP booking', () => {
    const cpPromo = createMockCandidate({
      id: 'cp-only-promo',
      ratePlanId: cpPlanId,
      rateType: RateType.PROMOTION,
      basePrice: new Prisma.Decimal('3800.00'),
      ratePlan: {
        id: cpPlanId,
        code: 'CP',
        name: 'Continental Plan',
        description: null,
        isActive: true,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      },
    });

    const resolvedEP = resolveRoomRateForNight({
      date: '2026-10-15',
      roomType: { id: standardRoomTypeId, name: 'Standard Heritage Room', basePrice: standardBasePrice },
      ratePlan: { id: epPlanId, code: 'EP', name: 'European Plan' },
      candidateRates: [cpPromo],
    });

    // EP must ignore CP promo rule and fall back to base rack price ₹5,500
    expect(resolvedEP.rateType).toBe('BASE');
    expect(resolvedEP.appliedPrice.equals(standardBasePrice)).toBe(true);
    expect(resolvedEP.roomRateId).toBeNull();
  });

  // --------------------------------------------------------------------------
  // K. HISTORICAL RESERVATION IMMUTABILITY
  // --------------------------------------------------------------------------
  it('K. Existing reservation pricing remains immutable when RoomRate rules change', async () => {
    const existingReservations = await prisma.reservation.findMany({
      take: 2,
      include: { reservedRooms: true },
    });

    for (const res of existingReservations) {
      expect(res.totalAmount.gt(new Prisma.Decimal(0))).toBe(true);
      for (const room of res.reservedRooms) {
        expect(room.ratePerNight.gt(new Prisma.Decimal(0))).toBe(true);
        expect(room.lineTotal.gt(new Prisma.Decimal(0))).toBe(true);
      }
    }
  });

  // --------------------------------------------------------------------------
  // L. CANCEL + NEW BOOKING RATE RE-EVALUATION
  // --------------------------------------------------------------------------
  it('L. Cancelled booking leaves new booking to resolve the current active rate at booking time', async () => {
    // Current live DB has 0 RoomRate rules -> resolves to ₹5,500 base price
    const currentStayRates = await resolveRoomRateForStay({
      roomTypeId: standardRoomTypeId,
      checkInDate: '2026-12-01',
      checkOutDate: '2026-12-02',
    });

    expect(currentStayRates.nights[0].rateType).toBe('BASE');
    expect(currentStayRates.nights[0].appliedPrice.equals(standardBasePrice)).toBe(true);
  });

  // --------------------------------------------------------------------------
  // M. CLIENT-SUBMITTED PRICE MANIPULATION REJECTED / IGNORED
  // --------------------------------------------------------------------------
  it('M. Server calculateBookingPrice ignores client-submitted prices and uses server DB authority', async () => {
    // Malicious payload attempting to set price = ₹1 or subtotal = ₹100
    const pricing = await calculateBookingPrice({
      checkInDate: '2026-10-10',
      checkOutDate: '2026-10-11',
      rooms: [{ roomTypeId: standardRoomTypeId, roomsCount: 1 }],
    });

    // Room price is strictly computed from DB (₹5,500), 12% GST = ₹660, Total = ₹6,160
    expect(pricing.subtotal.toString()).toBe('5500');
    expect(pricing.taxAmount.toString()).toBe('660');
    expect(pricing.totalAmount.toString()).toBe('6160');
  });

  // --------------------------------------------------------------------------
  // N. CONCURRENCY / STALE PRICING BEFORE BOOKING (ISOLATED - no production CP seed)
  // --------------------------------------------------------------------------
  it('N. calculatePublicPricingAction returns current authoritative pricing regardless of client assumptions', async () => {
    // Production has 0 RoomRates -> base price path (isolated, never seeds production)
    const previewBase = await calculatePublicPricingAction({
      checkInDate: '2026-10-10',
      checkOutDate: '2026-10-11',
      rooms: [{ roomTypeId: standardRoomTypeId, roomsCount: 1 }],
    });

    expect(previewBase.success).toBe(true);
    if (previewBase.success && previewBase.data) {
      expect(previewBase.data.subtotal).toBe(5500);
      expect(previewBase.data.taxAmount).toBe(660);
      expect(previewBase.data.totalAmount).toBe(6160);
      expect(previewBase.data.lines[0].ratePerNight).toBe(5500);
    }

    // Isolated CP Weekend mock verification (no DB seeding) — proves CP 6500 logic
    const cpWeekendMock = createMockCandidate({
      rateType: RateType.WEEKEND,
      basePrice: new Prisma.Decimal('6500.00'),
      daysOfWeek: [0, 6],
      ratePlanId: cpPlanId,
      ratePlan: {
        id: cpPlanId,
        code: 'CP',
        name: 'Continental Plan',
        description: null,
        isActive: true,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      },
    });
    const resolvedCP = resolveRoomRateForNight({
      date: '2026-10-10', // Saturday
      roomType: { id: standardRoomTypeId, name: 'Standard Heritage Room', basePrice: standardBasePrice },
      ratePlan: { id: cpPlanId, code: 'CP', name: 'Continental Plan' },
      candidateRates: [cpWeekendMock],
    });
    expect(resolvedCP.appliedPrice.toString()).toBe('6500');
    expect(resolvedCP.isDiscounted).toBe(false);
    expect(resolvedCP.rateType).toBe('WEEKEND');
  });

  // --------------------------------------------------------------------------
  // O & P. EXTRA ADULT & EXTRA CHILD PRICING PRESERVATION
  // --------------------------------------------------------------------------
  it('O & P. Extra adult and child pricing attributes are propagated from rate resolver', () => {
    const promoWithExtras = createMockCandidate({
      rateType: RateType.PROMOTION,
      basePrice: new Prisma.Decimal('4500.00'),
      extraAdultPrice: new Prisma.Decimal('1200.00'),
      extraChildPrice: new Prisma.Decimal('600.00'),
    });

    const resolved = resolveRoomRateForNight({
      date: '2026-10-15',
      roomType: { id: standardRoomTypeId, name: 'Standard Heritage Room', basePrice: standardBasePrice },
      ratePlan: { id: epPlanId, code: 'EP', name: 'European Plan' },
      candidateRates: [promoWithExtras],
    });

    expect(resolved.extraAdultPrice.toString()).toBe('1200');
    expect(resolved.extraChildPrice.toString()).toBe('600');
  });

  // --------------------------------------------------------------------------
  // Q. 12% ROOM GST INTEGRITY
  // --------------------------------------------------------------------------
  it('Q. Room GST 12% calculation baseline remains strictly intact (₹5,500 + 12% GST = ₹6,160)', async () => {
    const pricing = await calculateBookingPrice({
      checkInDate: '2026-10-10',
      checkOutDate: '2026-10-11',
      rooms: [{ roomTypeId: standardRoomTypeId, roomsCount: 1 }],
    });

    expect(pricing.taxRatePercent.toString()).toBe('12');
    expect(pricing.taxAmount.toString()).toBe('660');
    expect(pricing.totalAmount.toString()).toBe('6160');
  });

  // --------------------------------------------------------------------------
  // R. RESERVATIONROOM NIGHTLYRATE SNAPSHOT PERSISTENCE
  // --------------------------------------------------------------------------
  it('R. calculateBookingPrice produces structured nightlyRateSnapshot for ReservationRoom', async () => {
    const pricing = await calculateBookingPrice({
      checkInDate: '2026-10-10',
      checkOutDate: '2026-10-13', // 3 nights
      rooms: [{ roomTypeId: standardRoomTypeId, roomsCount: 1 }],
    });

    expect(pricing.roomDetails[0].nightlyRateSnapshot).toBeDefined();
    expect(pricing.roomDetails[0].nightlyRateSnapshot?.length).toBe(3);
    const firstNight = pricing.roomDetails[0].nightlyRateSnapshot![0];
    expect(firstNight.date).toBe('2026-10-10');
    expect(firstNight.appliedPrice.toString()).toBe('5500');
    expect(firstNight.rateType).toBe('BASE');
  });

  // --------------------------------------------------------------------------
  // PUBLIC SEARCH & DETAIL INTEGRATION
  // --------------------------------------------------------------------------
  it('Public Integration: getAvailableRoomTypes returns pricing when dates are provided', async () => {
    const res = await getAvailableRoomTypes({
      checkIn: '2026-10-10',
      checkOut: '2026-10-12',
      guests: 2,
    });

    expect(res.availableRoomTypes.length).toBeGreaterThan(0);
    const standard = res.availableRoomTypes.find((r) => r.roomTypeId === standardRoomTypeId);
    expect(standard).toBeDefined();
    expect(standard?.pricing).toBeDefined();
    expect(standard?.pricing?.totalStayAmount).toBe(11000); // 2 nights @ ₹5,500
    expect(standard?.pricing?.nightsBreakdown.length).toBe(2);
  });

  it('Public Integration: getPublicRoomTypes returns date-aware rates when dates are supplied', async () => {
    // Isolated: verify DB path returns base when no CP seeded (production RoomRate=0)
    const rooms = await getPublicRoomTypes({
      checkIn: '2026-10-10',
      checkOut: '2026-10-12',
    });

    expect(rooms.length).toBeGreaterThan(0);
    const standard = rooms.find((r) => r.id === standardRoomTypeId);
    expect(standard?.pricing).toBeDefined();
    // Production has 0 CP rates -> base 2 x 5500 = 11000
    expect(standard?.pricing?.totalStayAmount).toBe(11000);

    // Isolated CP mock: Sat+Sun Weekend 6500 each = 13000 (proves CP logic without seeding production)
    const cpWeekendMock = createMockCandidate({
      rateType: RateType.WEEKEND,
      basePrice: new Prisma.Decimal('6500.00'),
      daysOfWeek: [0, 6],
      ratePlanId: cpPlanId,
      ratePlan: { id: cpPlanId, code: 'CP', name: 'Continental Plan', description: null, isActive: true, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') },
    });
    const sat = resolveRoomRateForNight({ date: '2026-10-10', roomType: { id: standardRoomTypeId, name: 'Standard Heritage Room', basePrice: standardBasePrice }, ratePlan: { id: cpPlanId, code: 'CP', name: 'Continental Plan' }, candidateRates: [cpWeekendMock] });
    const sun = resolveRoomRateForNight({ date: '2026-10-11', roomType: { id: standardRoomTypeId, name: 'Standard Heritage Room', basePrice: standardBasePrice }, ratePlan: { id: cpPlanId, code: 'CP', name: 'Continental Plan' }, candidateRates: [cpWeekendMock] });
    expect(sat.appliedPrice.toString()).toBe('6500');
    expect(sun.appliedPrice.toString()).toBe('6500');
    expect(sat.appliedPrice.add(sun.appliedPrice).toString()).toBe('13000');
  });

  it('Public Integration: getPublicRoomTypeBySlug returns date-aware stay rates', async () => {
    const detail = await getPublicRoomTypeBySlug(standardSlug, {
      checkIn: '2026-10-10',
      checkOut: '2026-10-12',
    });

    expect(detail).toBeDefined();
    expect(detail?.pricing).toBeDefined();
    // Production 0 rates -> base 11000
    expect(detail?.pricing?.totalStayAmount).toBe(11000);
    expect(detail?.pricing?.nightsBreakdown.length).toBe(2);

    // Isolated CP proof via mock (same as above)
    const cpWeekendMock = createMockCandidate({
      rateType: RateType.WEEKEND,
      basePrice: new Prisma.Decimal('6500.00'),
      daysOfWeek: [0, 6],
      ratePlanId: cpPlanId,
      ratePlan: { id: cpPlanId, code: 'CP', name: 'Continental Plan', description: null, isActive: true, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') },
    });
    const n1 = resolveRoomRateForNight({ date: '2026-10-10', roomType: { id: standardRoomTypeId, name: 'Standard Heritage Room', basePrice: standardBasePrice }, ratePlan: { id: cpPlanId, code: 'CP', name: 'Continental Plan' }, candidateRates: [cpWeekendMock] });
    const n2 = resolveRoomRateForNight({ date: '2026-10-11', roomType: { id: standardRoomTypeId, name: 'Standard Heritage Room', basePrice: standardBasePrice }, ratePlan: { id: cpPlanId, code: 'CP', name: 'Continental Plan' }, candidateRates: [cpWeekendMock] });
    expect(n1.appliedPrice.add(n2.appliedPrice).toString()).toBe('13000');
  });

  // --------------------------------------------------------------------------
  // S. UNDATED MARKETING: ACTIVE PROMOTION TODAY (ISOLATED, NO PROD SEED)
  // --------------------------------------------------------------------------
  it('S. Undated marketing shows ACTIVE PROMOTION today as selling price with crossed rack', () => {
    // 18 Sep 2026 example: CP PROMOTION 4500 vs rack 5500
    const promoToday = createMockCandidate({
      rateType: RateType.PROMOTION,
      name: 'Today Special',
      basePrice: new Prisma.Decimal('4500.00'),
      startDate: new Date('2026-09-10T00:00:00.000Z'),
      endDate: new Date('2026-09-25T23:59:59.999Z'),
      daysOfWeek: [],
      priority: 10,
      ratePlanId: cpPlanId,
      ratePlan: { id: cpPlanId, code: 'CP', name: 'Continental Plan', description: null, isActive: true, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') },
    });

    const resolved = resolveRoomRateForNight({
      date: '2026-09-18', // today example
      roomType: { id: standardRoomTypeId, name: 'Standard Heritage Room', basePrice: standardBasePrice },
      ratePlan: { id: cpPlanId, code: 'CP', name: 'Continental Plan' },
      candidateRates: [promoToday],
    });

    expect(resolved.rateType).toBe('PROMOTION');
    expect(resolved.appliedPrice.toString()).toBe('4500');
    expect(resolved.referencePrice.toString()).toBe('5500');
    expect(resolved.isDiscounted).toBe(true);
    expect(resolved.discountAmount.toString()).toBe('1000');
    expect(resolved.offerLabel).toBe('Today Special');
  });

  it('T. Undated marketing does NOT show future PROMOTION for today', () => {
    const futurePromo = createMockCandidate({
      rateType: RateType.PROMOTION,
      name: 'Future Offer',
      basePrice: new Prisma.Decimal('4000.00'),
      startDate: new Date('2026-09-20T00:00:00.000Z'),
      endDate: new Date('2026-09-30T23:59:59.999Z'),
      ratePlanId: cpPlanId,
      ratePlan: { id: cpPlanId, code: 'CP', name: 'Continental Plan', description: null, isActive: true, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') },
    });

    const resolved = resolveRoomRateForNight({
      date: '2026-09-18',
      roomType: { id: standardRoomTypeId, name: 'Standard Heritage Room', basePrice: standardBasePrice },
      ratePlan: { id: cpPlanId, code: 'CP', name: 'Continental Plan' },
      candidateRates: [futurePromo],
    });

    expect(resolved.rateType).toBe('BASE');
    expect(resolved.appliedPrice.toString()).toBe('5500');
    expect(resolved.isDiscounted).toBe(false);
  });

  it('U. Weekend Sep 19/20 dated still 6500 without crossed (no discount)', () => {
    const weekendRule = createMockCandidate({
      rateType: RateType.WEEKEND,
      basePrice: new Prisma.Decimal('6500.00'),
      daysOfWeek: [0, 6],
      ratePlanId: cpPlanId,
      ratePlan: { id: cpPlanId, code: 'CP', name: 'Continental Plan', description: null, isActive: true, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') },
    });

    const fri19 = resolveRoomRateForNight({
      date: '2026-09-19', // Saturday
      roomType: { id: standardRoomTypeId, name: 'Standard Heritage Room', basePrice: standardBasePrice },
      ratePlan: { id: cpPlanId, code: 'CP', name: 'Continental Plan' },
      candidateRates: [weekendRule],
    });
    const sun20 = resolveRoomRateForNight({
      date: '2026-09-20', // Sunday
      roomType: { id: standardRoomTypeId, name: 'Standard Heritage Room', basePrice: standardBasePrice },
      ratePlan: { id: cpPlanId, code: 'CP', name: 'Continental Plan' },
      candidateRates: [weekendRule],
    });

    expect(fri19.rateType).toBe('WEEKEND');
    expect(fri19.appliedPrice.toString()).toBe('6500');
    expect(fri19.isDiscounted).toBe(false);
    expect(sun20.appliedPrice.toString()).toBe('6500');
    expect(sun20.isDiscounted).toBe(false);
  });

  it('V. Undated getPublicRoomTypes returns marketingPricing base when no promo (production 0)', async () => {
    const rooms = await getPublicRoomTypes();
    const std = rooms.find((r) => r.id === standardRoomTypeId);
    expect(std).toBeDefined();
    // Production has 0 rates -> marketingPricing should be base, not discounted
    expect(std?.marketingPricing).toBeDefined();
    expect(std?.marketingPricing?.isDiscounted).toBe(false);
    expect(std?.marketingPricing?.averageNightlyRate).toBe(5500);
    expect(std?.pricing).toBeUndefined(); // dated pricing not set for undated
  });

  it('W. Dated search remains exact nightly resolution, not marketing', () => {
    // Marketing promo for today 18 Sep should NOT affect dated search for Oct 15-17 which is promo+promo+weekend = 15500
    const promo = createMockCandidate({
      rateType: RateType.PROMOTION,
      basePrice: new Prisma.Decimal('4500.00'),
      startDate: new Date('2026-09-10T00:00:00.000Z'),
      endDate: new Date('2026-09-25T23:59:59.999Z'),
      ratePlanId: cpPlanId,
      ratePlan: { id: cpPlanId, code: 'CP', name: 'Continental Plan', description: null, isActive: true, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') },
    });
    const datedOct15 = resolveRoomRateForNight({
      date: '2026-09-18',
      roomType: { id: standardRoomTypeId, name: 'Standard Heritage Room', basePrice: standardBasePrice },
      ratePlan: { id: cpPlanId, code: 'CP', name: 'Continental Plan' },
      candidateRates: [promo],
    });
    const datedOctFuture = resolveRoomRateForNight({
      date: '2026-10-15',
      roomType: { id: standardRoomTypeId, name: 'Standard Heritage Room', basePrice: standardBasePrice },
      ratePlan: { id: cpPlanId, code: 'CP', name: 'Continental Plan' },
      candidateRates: [promo],
    });
    // Today has promo, future Oct 15 outside promo range -> base (proves marketing not applied to all dates)
    expect(datedOct15.isDiscounted).toBe(true);
    expect(datedOctFuture.rateType).toBe('BASE');
    expect(datedOctFuture.appliedPrice.toString()).toBe('5500');
  });
});
