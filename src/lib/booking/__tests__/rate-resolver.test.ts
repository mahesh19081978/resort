import { describe, it, expect, vi } from 'vitest';
import { Prisma, RateType, TaxScope } from '@prisma/client';
import {
  resolveRoomRateForNight,
  resolveRoomRateForStay,
  resolveBatchRoomRatesForStay,
  getKolkataDayOfWeek,
  CandidateRoomRate,
} from '../rate-resolver';
import { calculateBookingPrice } from '../pricing-calculator';

describe('STAGE 1: RATE RESOLVER & PRICING INTEGRITY TESTS', () => {
  const mockRoomType = {
    id: 'rt-std',
    name: 'Standard Heritage Room',
    basePrice: new Prisma.Decimal('5500.00'),
  };

  const mockPlanEP = {
    id: 'rp-ep',
    code: 'EP',
    name: 'European Plan',
  };

  const mockPlanCP = {
    id: 'rp-cp',
    code: 'CP',
    name: 'Continental Plan',
  };

  function createCandidateRate(overrides: Partial<CandidateRoomRate> = {}): CandidateRoomRate {
    return {
      id: 'rate-1',
      roomTypeId: 'rt-std',
      ratePlanId: 'rp-ep',
      name: 'Test Rule',
      rateType: RateType.WEEKEND,
      basePrice: new Prisma.Decimal('6500.00'),
      extraAdultPrice: new Prisma.Decimal('1000.00'),
      extraChildPrice: new Prisma.Decimal('500.00'),
      startDate: null,
      endDate: null,
      daysOfWeek: [5, 6], // Fri, Sat
      priority: 0,
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      ratePlan: {
        id: 'rp-ep',
        code: 'EP',
        name: 'European Plan',
        description: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      ...overrides,
    };
  }

  // 1. No RoomRate -> RoomType.basePrice fallback
  it('1. No RoomRate => returns RoomType.basePrice fallback with rateType = BASE', () => {
    const res = resolveRoomRateForNight({
      date: '2026-09-21', // Monday
      roomType: mockRoomType,
      ratePlan: mockPlanEP,
      candidateRates: [],
    });

    expect(res.rateType).toBe('BASE');
    expect(res.roomRateId).toBeNull();
    expect(res.appliedPrice.toFixed(2)).toBe('5500.00');
    expect(res.referencePrice.toFixed(2)).toBe('5500.00');
    expect(res.discountAmount.toFixed(2)).toBe('0.00');
    expect(res.isDiscounted).toBe(false);
  });

  // 2. Weekend rate
  it('2. Weekend rate => Friday night resolves WEEKEND price', () => {
    const weekendRule = createCandidateRate({
      rateType: RateType.WEEKEND,
      basePrice: new Prisma.Decimal('6500.00'),
      daysOfWeek: [5, 6],
    });

    const resFriday = resolveRoomRateForNight({
      date: '2026-09-25', // Friday
      roomType: mockRoomType,
      ratePlan: mockPlanEP,
      candidateRates: [weekendRule],
    });

    expect(resFriday.rateType).toBe(RateType.WEEKEND);
    expect(resFriday.appliedPrice.toFixed(2)).toBe('6500.00');
    expect(resFriday.isWeekend).toBe(true);
    expect(resFriday.isDiscounted).toBe(false);

    // Thursday night should fall back to BASE
    const resThursday = resolveRoomRateForNight({
      date: '2026-09-24', // Thursday
      roomType: mockRoomType,
      ratePlan: mockPlanEP,
      candidateRates: [weekendRule],
    });
    expect(resThursday.rateType).toBe('BASE');
    expect(resThursday.appliedPrice.toFixed(2)).toBe('5500.00');
  });

  // 3. Seasonal rate
  it('3. Seasonal rate => dates within window resolve SEASONAL price', () => {
    const monsoonRule = createCandidateRate({
      rateType: RateType.SEASONAL,
      name: 'Monsoon Special',
      basePrice: new Prisma.Decimal('5000.00'),
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: new Date('2026-09-30T00:00:00.000Z'),
      daysOfWeek: [], // all days
    });

    const res = resolveRoomRateForNight({
      date: '2026-08-15',
      roomType: mockRoomType,
      ratePlan: mockPlanEP,
      candidateRates: [monsoonRule],
    });

    expect(res.rateType).toBe(RateType.SEASONAL);
    expect(res.appliedPrice.toFixed(2)).toBe('5000.00');
    expect(res.rateName).toBe('Monsoon Special');
  });

  // 4. Festival rate
  it('4. Festival rate => festival holiday dates resolve FESTIVAL price', () => {
    const diwaliRule = createCandidateRate({
      rateType: RateType.FESTIVAL,
      name: 'Diwali Festive Surge',
      basePrice: new Prisma.Decimal('8500.00'),
      startDate: new Date('2026-10-20T00:00:00.000Z'),
      endDate: new Date('2026-10-25T00:00:00.000Z'),
      daysOfWeek: [],
    });

    const res = resolveRoomRateForNight({
      date: '2026-10-22',
      roomType: mockRoomType,
      ratePlan: mockPlanEP,
      candidateRates: [diwaliRule],
    });

    expect(res.rateType).toBe(RateType.FESTIVAL);
    expect(res.appliedPrice.toFixed(2)).toBe('8500.00');
  });

  // 5. Promotion
  it('5. Promotion => marketing deal resolves PROMOTION rate', () => {
    const promoRule = createCandidateRate({
      rateType: RateType.PROMOTION,
      name: 'Summer Flash Offer',
      basePrice: new Prisma.Decimal('4500.00'),
      startDate: new Date('2026-05-01T00:00:00.000Z'),
      endDate: new Date('2026-05-10T00:00:00.000Z'),
      daysOfWeek: [],
    });

    const res = resolveRoomRateForNight({
      date: '2026-05-05',
      roomType: mockRoomType,
      ratePlan: mockPlanEP,
      candidateRates: [promoRule],
    });

    expect(res.rateType).toBe(RateType.PROMOTION);
    expect(res.appliedPrice.toFixed(2)).toBe('4500.00');
  });

  // 6. Promotion below base -> discounted = true, discount computed
  it('6. Promotion below base => isDiscounted = true, discountAmount = referencePrice - appliedPrice', () => {
    const promo = createCandidateRate({
      rateType: RateType.PROMOTION,
      basePrice: new Prisma.Decimal('4500.00'),
      daysOfWeek: [],
    });

    const res = resolveRoomRateForNight({
      date: '2026-05-05',
      roomType: mockRoomType, // base 5500
      ratePlan: mockPlanEP,
      candidateRates: [promo],
    });

    expect(res.isDiscounted).toBe(true);
    expect(res.discountAmount.toFixed(2)).toBe('1000.00'); // 5500 - 4500
  });

  // 7. Promotion equal base -> not discounted
  it('7. Promotion equal to base => isDiscounted = false, discountAmount = 0', () => {
    const promo = createCandidateRate({
      rateType: RateType.PROMOTION,
      basePrice: new Prisma.Decimal('5500.00'),
      daysOfWeek: [],
    });

    const res = resolveRoomRateForNight({
      date: '2026-05-05',
      roomType: mockRoomType, // base 5500
      ratePlan: mockPlanEP,
      candidateRates: [promo],
    });

    expect(res.isDiscounted).toBe(false);
    expect(res.discountAmount.toFixed(2)).toBe('0.00');
  });

  // 8. Promotion above base -> not discounted
  it('8. Promotion above base => isDiscounted = false, discountAmount = 0', () => {
    const promo = createCandidateRate({
      rateType: RateType.PROMOTION,
      basePrice: new Prisma.Decimal('6000.00'),
      daysOfWeek: [],
    });

    const res = resolveRoomRateForNight({
      date: '2026-05-05',
      roomType: mockRoomType, // base 5500
      ratePlan: mockPlanEP,
      candidateRates: [promo],
    });

    expect(res.isDiscounted).toBe(false);
    expect(res.discountAmount.toFixed(2)).toBe('0.00');
  });

  // 9. Weekend + seasonal overlap
  it('9. Weekend + Seasonal overlap => Seasonal wins (Tier 3 > Tier 4)', () => {
    const weekend = createCandidateRate({
      id: 'r-wknd',
      rateType: RateType.WEEKEND,
      basePrice: new Prisma.Decimal('7000.00'),
      daysOfWeek: [5, 6],
    });

    const seasonal = createCandidateRate({
      id: 'r-season',
      rateType: RateType.SEASONAL,
      basePrice: new Prisma.Decimal('6200.00'),
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: new Date('2026-09-30T00:00:00.000Z'),
      daysOfWeek: [],
    });

    const res = resolveRoomRateForNight({
      date: '2026-07-10', // Friday in July
      roomType: mockRoomType,
      ratePlan: mockPlanEP,
      candidateRates: [weekend, seasonal],
    });

    expect(res.rateType).toBe(RateType.SEASONAL);
    expect(res.appliedPrice.toFixed(2)).toBe('6200.00');
  });

  // 10. Weekend + festival overlap
  it('10. Weekend + Festival overlap => Festival wins (Tier 2 > Tier 4)', () => {
    const weekend = createCandidateRate({
      id: 'r-wknd',
      rateType: RateType.WEEKEND,
      basePrice: new Prisma.Decimal('7000.00'),
      daysOfWeek: [5, 6],
    });

    const festival = createCandidateRate({
      id: 'r-fest',
      rateType: RateType.FESTIVAL,
      basePrice: new Prisma.Decimal('8500.00'),
      startDate: new Date('2026-10-23T00:00:00.000Z'), // Friday
      endDate: new Date('2026-10-25T00:00:00.000Z'),
      daysOfWeek: [],
    });

    const res = resolveRoomRateForNight({
      date: '2026-10-23', // Friday
      roomType: mockRoomType,
      ratePlan: mockPlanEP,
      candidateRates: [weekend, festival],
    });

    expect(res.rateType).toBe(RateType.FESTIVAL);
    expect(res.appliedPrice.toFixed(2)).toBe('8500.00');
  });

  // 11. Festival + promotion overlap
  it('11. Festival + Promotion overlap => Promotion wins (Tier 1 > Tier 2)', () => {
    const festival = createCandidateRate({
      id: 'r-fest',
      rateType: RateType.FESTIVAL,
      basePrice: new Prisma.Decimal('8500.00'),
      startDate: new Date('2026-10-20T00:00:00.000Z'),
      endDate: new Date('2026-10-25T00:00:00.000Z'),
      daysOfWeek: [],
    });

    const promotion = createCandidateRate({
      id: 'r-promo',
      rateType: RateType.PROMOTION,
      name: 'Diwali Member Discount',
      basePrice: new Prisma.Decimal('7500.00'),
      startDate: new Date('2026-10-20T00:00:00.000Z'),
      endDate: new Date('2026-10-22T00:00:00.000Z'),
      daysOfWeek: [],
    });

    const res = resolveRoomRateForNight({
      date: '2026-10-21',
      roomType: mockRoomType,
      ratePlan: mockPlanEP,
      candidateRates: [festival, promotion],
    });

    expect(res.rateType).toBe(RateType.PROMOTION);
    expect(res.appliedPrice.toFixed(2)).toBe('7500.00');
  });

  // 12. Priority
  it('12. Priority => higher priority integer wins within same tier', () => {
    const seasonLow = createCandidateRate({
      id: 'r-s1',
      rateType: RateType.SEASONAL,
      basePrice: new Prisma.Decimal('6000.00'),
      priority: 0,
      daysOfWeek: [],
    });

    const seasonHigh = createCandidateRate({
      id: 'r-s2',
      rateType: RateType.SEASONAL,
      basePrice: new Prisma.Decimal('6800.00'),
      priority: 10,
      daysOfWeek: [],
    });

    const res = resolveRoomRateForNight({
      date: '2026-08-01',
      roomType: mockRoomType,
      ratePlan: mockPlanEP,
      candidateRates: [seasonLow, seasonHigh],
    });

    expect(res.roomRateId).toBe('r-s2');
    expect(res.appliedPrice.toFixed(2)).toBe('6800.00');
  });

  // 13. Specificity
  it('13. Specificity => narrower date range wins within same tier and priority', () => {
    const broadSeason = createCandidateRate({
      id: 'r-broad',
      rateType: RateType.SEASONAL,
      basePrice: new Prisma.Decimal('6000.00'),
      startDate: new Date('2026-06-01T00:00:00.000Z'),
      endDate: new Date('2026-09-30T00:00:00.000Z'),
      priority: 0,
      daysOfWeek: [],
    });

    const narrowPeak = createCandidateRate({
      id: 'r-narrow',
      rateType: RateType.SEASONAL,
      basePrice: new Prisma.Decimal('6500.00'),
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: new Date('2026-07-15T00:00:00.000Z'),
      priority: 0,
      daysOfWeek: [],
    });

    const res = resolveRoomRateForNight({
      date: '2026-07-05',
      roomType: mockRoomType,
      ratePlan: mockPlanEP,
      candidateRates: [broadSeason, narrowPeak],
    });

    expect(res.roomRateId).toBe('r-narrow');
    expect(res.appliedPrice.toFixed(2)).toBe('6500.00');
  });

  // 14. Date boundaries
  it('14. Date boundaries => startDate and endDate are inclusive calendar dates', () => {
    const rule = createCandidateRate({
      startDate: new Date('2026-11-01T00:00:00.000Z'),
      endDate: new Date('2026-11-03T00:00:00.000Z'),
      daysOfWeek: [],
      rateType: RateType.FESTIVAL,
      basePrice: new Prisma.Decimal('8000.00'),
    });

    expect(resolveRoomRateForNight({ date: '2026-10-31', roomType: mockRoomType, ratePlan: mockPlanEP, candidateRates: [rule] }).rateType).toBe('BASE');
    expect(resolveRoomRateForNight({ date: '2026-11-01', roomType: mockRoomType, ratePlan: mockPlanEP, candidateRates: [rule] }).rateType).toBe(RateType.FESTIVAL);
    expect(resolveRoomRateForNight({ date: '2026-11-03', roomType: mockRoomType, ratePlan: mockPlanEP, candidateRates: [rule] }).rateType).toBe(RateType.FESTIVAL);
    expect(resolveRoomRateForNight({ date: '2026-11-04', roomType: mockRoomType, ratePlan: mockPlanEP, candidateRates: [rule] }).rateType).toBe('BASE');
  });

  // 15. Weekend boundaries
  it('15. Weekend boundaries => Friday (5) and Saturday (6) are weekend nights; Sunday (0) is weekday', () => {
    expect(getKolkataDayOfWeek('2026-09-25')).toBe(5); // Friday
    expect(getKolkataDayOfWeek('2026-09-26')).toBe(6); // Saturday
    expect(getKolkataDayOfWeek('2026-09-27')).toBe(0); // Sunday
    expect(getKolkataDayOfWeek('2026-09-28')).toBe(1); // Monday
  });

  // 16. Asia/Kolkata timezone
  it('16. Asia/Kolkata timezone => day of week is evaluated in +05:30', () => {
    // 2026-09-25 is Friday in IST
    const dow = getKolkataDayOfWeek('2026-09-25');
    expect(dow).toBe(5);
  });

  // 17. Multi-night variable pricing
  it('17. Multi-night variable pricing => sum of distinct nightly rates', async () => {
    const weekendRule = createCandidateRate({
      rateType: RateType.WEEKEND,
      basePrice: new Prisma.Decimal('6500.00'),
      daysOfWeek: [5, 6],
    });

    const mockClient = {
      roomType: {
        findUnique: vi.fn().mockResolvedValue(mockRoomType),
      },
      ratePlan: {
        findUnique: vi.fn().mockResolvedValue(mockPlanEP),
      },
      roomRate: {
        findMany: vi.fn().mockResolvedValue([weekendRule]),
      },
    } as unknown as Prisma.TransactionClient;

    // Thursday (2026-09-24) to Sunday (2026-09-27) = 3 nights:
    // Thu 24: Base (5500)
    // Fri 25: Weekend (6500)
    // Sat 26: Weekend (6500)
    // Total = 18500
    const stay = await resolveRoomRateForStay(
      {
        roomTypeId: 'rt-std',
        checkInDate: '2026-09-24',
        checkOutDate: '2026-09-27',
      },
      mockClient
    );

    expect(stay.totalNights).toBe(3);
    expect(stay.totalBaseAmount.toFixed(2)).toBe('18500.00');
    expect(stay.nights[0].appliedPrice.toFixed(2)).toBe('5500.00');
    expect(stay.nights[1].appliedPrice.toFixed(2)).toBe('6500.00');
    expect(stay.nights[2].appliedPrice.toFixed(2)).toBe('6500.00');
  });

  // 18. Multi-room pricing
  it('18. Multi-room pricing => multiplies nightly stay sum by room count', async () => {
    const mockClient = {
      roomType: {
        findMany: vi.fn().mockResolvedValue([mockRoomType]),
      },
      ratePlan: {
        findUnique: vi.fn().mockResolvedValue(mockPlanEP),
      },
      roomRate: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      tax: {
        findMany: vi.fn().mockResolvedValue([
          { id: 't1', code: 'ROOM_GST', rate: new Prisma.Decimal('12.00'), isActive: true, scope: TaxScope.ROOM },
        ]),
      },
    } as unknown as Prisma.TransactionClient;

    // 2 rooms x 2 nights x 5500 = 22,000 net + 12% GST = 24,640
    const result = await calculateBookingPrice(
      {
        checkInDate: '2026-09-20',
        checkOutDate: '2026-09-22',
        rooms: [{ roomTypeId: 'rt-std', roomsCount: 2 }],
      },
      mockClient
    );

    expect(result.subtotal.toFixed(2)).toBe('22000.00');
    expect(result.taxAmount.toFixed(2)).toBe('2640.00');
    expect(result.totalAmount.toFixed(2)).toBe('24640.00');
  });

  // 19. Extra adult pricing
  it('19. Extra adult pricing => attaches extraAdultPrice to resolved night', () => {
    const rule = createCandidateRate({
      extraAdultPrice: new Prisma.Decimal('1200.00'),
      extraChildPrice: new Prisma.Decimal('600.00'),
    });

    const res = resolveRoomRateForNight({
      date: '2026-09-25', // Friday
      roomType: mockRoomType,
      ratePlan: mockPlanEP,
      candidateRates: [rule],
    });

    expect(res.extraAdultPrice.toFixed(2)).toBe('1200.00');
    expect(res.extraChildPrice.toFixed(2)).toBe('600.00');
  });

  // 20. Extra child pricing
  it('20. Extra child pricing => zero extra charges when rule does not set supplements', () => {
    const res = resolveRoomRateForNight({
      date: '2026-09-21',
      roomType: mockRoomType,
      ratePlan: mockPlanEP,
      candidateRates: [],
    });

    expect(res.extraAdultPrice.toFixed(2)).toBe('0.00');
    expect(res.extraChildPrice.toFixed(2)).toBe('0.00');
  });

  // 21. EP isolation
  it('21. EP isolation => EP rate does not match CP search context', async () => {
    const epRule = createCandidateRate({
      ratePlanId: 'rp-ep',
      basePrice: new Prisma.Decimal('6500.00'),
      ratePlan: mockPlanEP as any,
    });

    const mockClient = {
      roomType: {
        findUnique: vi.fn().mockResolvedValue(mockRoomType),
      },
      ratePlan: {
        findUnique: vi.fn().mockResolvedValue(mockPlanCP), // User requested CP
      },
      roomRate: {
        findMany: vi.fn().mockResolvedValue([]), // No CP rules found
      },
    } as unknown as Prisma.TransactionClient;

    const stay = await resolveRoomRateForStay(
      {
        roomTypeId: 'rt-std',
        ratePlanId: 'rp-cp',
        checkInDate: '2026-09-25',
        checkOutDate: '2026-09-26',
      },
      mockClient
    );

    // Should NOT use epRule (6500); falls back to RoomType.basePrice (5500)
    expect(stay.nights[0].appliedPrice.toFixed(2)).toBe('5500.00');
    expect(stay.ratePlanCode).toBe('CP');
  });

  // 22. CP isolation
  it('22. CP isolation => CP rate does not match EP search context', async () => {
    const cpRule = createCandidateRate({
      ratePlanId: 'rp-cp',
      basePrice: new Prisma.Decimal('7500.00'),
      ratePlan: mockPlanCP as any,
    });

    const mockClient = {
      roomType: {
        findUnique: vi.fn().mockResolvedValue(mockRoomType),
      },
      ratePlan: {
        findUnique: vi.fn().mockResolvedValue(mockPlanEP), // User requested EP
      },
      roomRate: {
        findMany: vi.fn().mockResolvedValue([]), // No EP rules found
      },
    } as unknown as Prisma.TransactionClient;

    const stay = await resolveRoomRateForStay(
      {
        roomTypeId: 'rt-std',
        ratePlanId: 'rp-ep',
        checkInDate: '2026-09-25',
        checkOutDate: '2026-09-26',
      },
      mockClient
    );

    expect(stay.nights[0].appliedPrice.toFixed(2)).toBe('5500.00');
    expect(stay.ratePlanCode).toBe('EP');
  });

  // 23. No cross-plan fallback
  it('23. No cross-plan fallback => missing plan fails closed if ratePlanId does not exist', async () => {
    const mockClient = {
      roomType: {
        findUnique: vi.fn().mockResolvedValue(mockRoomType),
      },
      ratePlan: {
        findUnique: vi.fn().mockResolvedValue(null), // Invalid plan
      },
    } as unknown as Prisma.TransactionClient;

    await expect(
      resolveRoomRateForStay(
        {
          roomTypeId: 'rt-std',
          ratePlanId: 'non-existent-plan',
          checkInDate: '2026-09-25',
          checkOutDate: '2026-09-26',
        },
        mockClient
      )
    ).rejects.toThrow('RATE_PLAN_NOT_FOUND');
  });

  // 24. Existing no-rate financial regression: 5500 + 12% = 6160
  it('24. Financial regression => 1 night at 5500 base with 12% GST = exactly 6160.00', async () => {
    const mockClient = {
      roomType: {
        findMany: vi.fn().mockResolvedValue([mockRoomType]),
      },
      ratePlan: {
        findUnique: vi.fn().mockResolvedValue(mockPlanEP),
      },
      roomRate: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      tax: {
        findMany: vi.fn().mockResolvedValue([
          { id: 't1', code: 'ROOM_GST', rate: new Prisma.Decimal('12.00'), isActive: true, scope: TaxScope.ROOM },
        ]),
      },
    } as unknown as Prisma.TransactionClient;

    const result = await calculateBookingPrice(
      {
        checkInDate: '2026-09-20',
        checkOutDate: '2026-09-21',
        rooms: [{ roomTypeId: 'rt-std', roomsCount: 1 }],
      },
      mockClient
    );

    expect(result.subtotal.toFixed(2)).toBe('5500.00');
    expect(result.taxAmount.toFixed(2)).toBe('660.00');
    expect(result.totalAmount.toFixed(2)).toBe('6160.00');
    expect(result.requiredAdvanceAmount.toFixed(2)).toBe('6160.00');
  });

  // 25. 30-night stay executes exactly 1 database query for RoomRates
  it('25. Performance => 30-night stay executes exactly 1 RoomRate query', async () => {
    const findManySpy = vi.fn().mockResolvedValue([]);

    const mockClient = {
      roomType: {
        findUnique: vi.fn().mockResolvedValue(mockRoomType),
      },
      ratePlan: {
        findUnique: vi.fn().mockResolvedValue(mockPlanEP),
      },
      roomRate: {
        findMany: findManySpy,
      },
    } as unknown as Prisma.TransactionClient;

    const stay = await resolveRoomRateForStay(
      {
        roomTypeId: 'rt-std',
        checkInDate: '2026-09-01',
        checkOutDate: '2026-10-01', // 30 nights
      },
      mockClient
    );

    expect(stay.totalNights).toBe(30);
    expect(stay.nights).toHaveLength(30);
    expect(findManySpy).toHaveBeenCalledTimes(1); // EXACTLY 1 query, not 30!
  });

  // 26. Batch resolve for multiple room types
  it('26. Batch resolver => resolves multiple room types in a single query', async () => {
    const findManyRatesSpy = vi.fn().mockResolvedValue([]);

    const mockClient = {
      roomType: {
        findMany: vi.fn().mockResolvedValue([
          mockRoomType,
          { id: 'rt-dlx', name: 'Deluxe Suite', basePrice: new Prisma.Decimal('8500.00') },
        ]),
      },
      ratePlan: {
        findUnique: vi.fn().mockResolvedValue(mockPlanEP),
      },
      roomRate: {
        findMany: findManyRatesSpy,
      },
    } as unknown as Prisma.TransactionClient;

    const results = await resolveBatchRoomRatesForStay(
      {
        roomTypeIds: ['rt-std', 'rt-dlx'],
        checkInDate: '2026-09-20',
        checkOutDate: '2026-09-23',
      },
      mockClient
    );

    expect(results.size).toBe(2);
    expect(findManyRatesSpy).toHaveBeenCalledTimes(1);
    expect(results.get('rt-std')?.totalBaseAmount.toFixed(2)).toBe('16500.00'); // 3 x 5500
    expect(results.get('rt-dlx')?.totalBaseAmount.toFixed(2)).toBe('25500.00'); // 3 x 8500
  });
});
