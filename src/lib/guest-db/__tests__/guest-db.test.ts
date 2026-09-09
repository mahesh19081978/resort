import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

// ==========================================
// A. GUEST SEARCH TESTS
// ==========================================
describe('Guest Database - Search', () => {
  describe('A1. Search query parsing', () => {
    it('should identify room number pattern (e.g. D-2004)', () => {
      const query = 'D-2004';
      const isRoomQuery = /^[A-Za-z]-?\d+/.test(query.trim());
      expect(isRoomQuery).toBe(true);
    });

    it('should identify room number pattern (e.g. S1002)', () => {
      const query = 'S1002';
      const isRoomQuery = /^[A-Za-z]-?\d+/.test(query.trim());
      expect(isRoomQuery).toBe(true);
    });

    it('should not identify plain name as room query', () => {
      const query = 'Rajesh Sharma';
      const isRoomQuery = /^[A-Za-z]-?\d+/.test(query.trim());
      expect(isRoomQuery).toBe(false);
    });

    it('should not identify reservation number as room query', () => {
      const query = 'RES-20260908-BAC713';
      const isRoomQuery = /^[A-Za-z]-?\d+/.test(query.trim());
      expect(isRoomQuery).toBe(false);
    });

    it('should not identify stay number as room query', () => {
      const query = 'STY-20260908-1234';
      const isRoomQuery = /^[A-Za-z]-?\d+/.test(query.trim());
      expect(isRoomQuery).toBe(false);
    });
  });

  describe('A2. Document number masking', () => {
    function maskDocumentNumber(docNumber: string): string {
      if (docNumber.length <= 4) return '****';
      return '*'.repeat(docNumber.length - 4) + docNumber.slice(-4);
    }

    it('should mask PAN card number', () => {
      expect(maskDocumentNumber('ABCDE1234F')).toBe('******234F');
    });

    it('should mask Aadhaar number', () => {
      expect(maskDocumentNumber('123456789012')).toBe('********9012');
    });

    it('should mask short numbers', () => {
      expect(maskDocumentNumber('1234')).toBe('****');
    });

    it('should handle 5-character numbers', () => {
      expect(maskDocumentNumber('12345')).toBe('*2345');
    });
  });

  describe('A3. Search pagination', () => {
    it('should calculate total pages correctly', () => {
      const total = 75;
      const pageSize = 25;
      const totalPages = Math.ceil(total / pageSize);
      expect(totalPages).toBe(3);
    });

    it('should calculate skip offset correctly', () => {
      const page = 2;
      const pageSize = 25;
      const skip = (page - 1) * pageSize;
      expect(skip).toBe(25);
    });

    it('should handle page 1 correctly', () => {
      const page = 1;
      const pageSize = 25;
      const skip = (page - 1) * pageSize;
      expect(skip).toBe(0);
    });
  });
});

// ==========================================
// B. STAY INVESTIGATION DATE SEMANTICS
// ==========================================
describe('Guest Database - Stay Investigation Date Semantics', () => {
  describe('B1. Interval overlap logic', () => {
    // The core logic: stay/checkIn < dateEnd AND (actualCheckOut > dateStart OR actualCheckOut IS NULL)
    function isStayingOnDate(
      checkIn: Date,
      actualCheckOut: Date | null,
      dateStart: Date,
      dateEnd: Date
    ): boolean {
      return checkIn < dateEnd && (actualCheckOut === null || actualCheckOut > dateStart);
    }

    it('Case A: guest checked in Sep 3, checkout Sep 7, staying on Sep 5 - must include', () => {
      const checkIn = new Date('2026-09-03T14:00:00Z');
      const checkOut = new Date('2026-09-07T10:00:00Z');
      const { start, end } = getDateRange('2026-09-05');
      expect(isStayingOnDate(checkIn, checkOut, start, end)).toBe(true);
    });

    it('Case B: guest checked in Sep 5, checkout Sep 6, searched "Checked In Sep 5" - must include', () => {
      const checkIn = new Date('2026-09-05T15:00:00Z');
      const dateStart = new Date('2026-09-05T00:00:00Z');
      const dateEnd = new Date('2026-09-06T00:00:00Z');
      // For "checked in on date": checkIn >= dateStart AND checkIn < dateEnd
      expect(checkIn >= dateStart && checkIn < dateEnd).toBe(true);
    });

    it('Case C: guest checked out Sep 7, searched "Checked Out Sep 7" - must include', () => {
      const checkOut = new Date('2026-09-07T10:18:00Z');
      const dateStart = new Date('2026-09-07T00:00:00Z');
      const dateEnd = new Date('2026-09-08T00:00:00Z');
      // For "checked out on date": actualCheckOut >= dateStart AND actualCheckOut < dateEnd
      expect(checkOut >= dateStart && checkOut < dateEnd).toBe(true);
    });

    it('Case D: active stay (checkOut null), staying on Sep 6 - must include', () => {
      const checkIn = new Date('2026-09-05T14:00:00Z');
      const { start, end } = getDateRange('2026-09-06');
      expect(isStayingOnDate(checkIn, null, start, end)).toBe(true);
    });

    it('should exclude guest who checked out before the date', () => {
      const checkIn = new Date('2026-09-01T14:00:00Z');
      const checkOut = new Date('2026-09-03T10:00:00Z');
      const { start, end } = getDateRange('2026-09-05');
      expect(isStayingOnDate(checkIn, checkOut, start, end)).toBe(false);
    });

    it('should exclude guest who checks in after the date', () => {
      const checkIn = new Date('2026-09-07T14:00:00Z');
      const checkOut = new Date('2026-09-09T10:00:00Z');
      const { start, end } = getDateRange('2026-09-05');
      expect(isStayingOnDate(checkIn, checkOut, start, end)).toBe(false);
    });

    it('should include guest checking in exactly on the target date', () => {
      const checkIn = new Date('2026-09-05T00:01:00Z');
      const checkOut = new Date('2026-09-07T10:00:00Z');
      const { start, end } = getDateRange('2026-09-05');
      expect(isStayingOnDate(checkIn, checkOut, start, end)).toBe(true);
    });

    it('should include guest checking out exactly at end of target date', () => {
      const checkIn = new Date('2026-09-03T14:00:00Z');
      const checkOut = new Date('2026-09-05T23:59:59Z');
      const { start, end } = getDateRange('2026-09-05');
      expect(isStayingOnDate(checkIn, checkOut, start, end)).toBe(true);
    });
  });

  function getDateRange(dateStr: string): { start: Date; end: Date } {
    const start = new Date(`${dateStr}T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
  }
});

// ==========================================
// C. FINANCIAL SUMMARY TESTS
// ==========================================
describe('Guest Database - Financial Summary', () => {
  describe('C1. Folio item classification', () => {
    function classifyFolioItem(itemType: string): string {
      switch (itemType) {
        case 'ROOM_CHARGE': return 'accommodation';
        case 'RESTAURANT_CHARGE':
        case 'ROOM_SERVICE_CHARGE': return 'restaurant';
        case 'LAUNDRY_CHARGE':
        case 'EXTRA_SERVICE_CHARGE':
        case 'DAMAGE_FEE':
        case 'MISC_CHARGE': return 'additional';
        case 'TAX_CHARGE': return 'tax';
        case 'DISCOUNT_CREDIT': return 'discount';
        default: return 'other';
      }
    }

    it('should classify ROOM_CHARGE as accommodation', () => {
      expect(classifyFolioItem('ROOM_CHARGE')).toBe('accommodation');
    });

    it('should classify RESTAURANT_CHARGE as restaurant', () => {
      expect(classifyFolioItem('RESTAURANT_CHARGE')).toBe('restaurant');
    });

    it('should classify ROOM_SERVICE_CHARGE as restaurant', () => {
      expect(classifyFolioItem('ROOM_SERVICE_CHARGE')).toBe('restaurant');
    });

    it('should classify LAUNDRY_CHARGE as additional', () => {
      expect(classifyFolioItem('LAUNDRY_CHARGE')).toBe('additional');
    });

    it('should classify EXTRA_SERVICE_CHARGE as additional', () => {
      expect(classifyFolioItem('EXTRA_SERVICE_CHARGE')).toBe('additional');
    });

    it('should classify DAMAGE_FEE as additional', () => {
      expect(classifyFolioItem('DAMAGE_FEE')).toBe('additional');
    });

    it('should classify TAX_CHARGE as tax', () => {
      expect(classifyFolioItem('TAX_CHARGE')).toBe('tax');
    });

    it('should classify DISCOUNT_CREDIT as discount', () => {
      expect(classifyFolioItem('DISCOUNT_CREDIT')).toBe('discount');
    });
  });

  describe('C2. Prisma Decimal financial calculations', () => {
    it('should calculate gross charges using Decimal arithmetic', () => {
      const accommodation = new Prisma.Decimal('6160.00');
      const additional = new Prisma.Decimal('340.00');
      const restaurant = new Prisma.Decimal('1300.00');
      const tax = new Prisma.Decimal('500.00');
      const discount = new Prisma.Decimal('200.00');

      const gross = accommodation.plus(additional).plus(restaurant).plus(tax).minus(discount);
      expect(gross.toFixed(2)).toBe('8100.00');
    });

    it('should calculate outstanding balance using Decimal arithmetic', () => {
      const grossCharges = new Prisma.Decimal('8450.00');
      const totalPaid = new Prisma.Decimal('6160.00');
      const totalRefunds = new Prisma.Decimal('0.00');

      const balance = grossCharges.minus(totalPaid).plus(totalRefunds);
      expect(balance.toFixed(2)).toBe('2290.00');
    });

    it('should handle zero balance correctly', () => {
      const grossCharges = new Prisma.Decimal('6160.00');
      const totalPaid = new Prisma.Decimal('6160.00');

      const balance = grossCharges.minus(totalPaid);
      expect(balance.toFixed(2)).toBe('0.00');
      expect(balance.lessThanOrEqualTo(new Prisma.Decimal(0))).toBe(true);
    });

    it('should handle negative balance (overpayment) correctly', () => {
      const grossCharges = new Prisma.Decimal('5000.00');
      const totalPaid = new Prisma.Decimal('6000.00');

      const balance = grossCharges.minus(totalPaid);
      expect(balance.toFixed(2)).toBe('-1000.00');
      expect(balance.lessThan(new Prisma.Decimal(0))).toBe(true);
    });

    it('should sum multiple payments correctly', () => {
      const payments = [
        new Prisma.Decimal('1840.00'),
        new Prisma.Decimal('3000.00'),
        new Prisma.Decimal('1320.00'),
      ];

      let total = new Prisma.Decimal(0);
      for (const p of payments) {
        total = total.plus(p);
      }

      expect(total.toFixed(2)).toBe('6160.00');
    });

    it('should calculate percentage using Decimal', () => {
      const amount = new Prisma.Decimal('300.00');
      const taxRate = new Prisma.Decimal('0.18');
      const tax = amount.mul(taxRate).toDecimalPlaces(2);
      expect(tax.toFixed(2)).toBe('54.00');
    });
  });
});

// ==========================================
// D. TIMELINE TESTS
// ==========================================
describe('Guest Database - Timeline', () => {
  describe('D1. Timeline event ordering', () => {
    it('should sort timeline events chronologically', () => {
      const events = [
        { date: '2026-09-07T10:18:00Z', type: 'CHECK_OUT', description: 'Checked out' },
        { date: '2026-09-05T14:12:00Z', type: 'CHECK_IN', description: 'Checked in' },
        { date: '2026-09-05T20:10:00Z', type: 'RESTAURANT', description: 'Dinner' },
        { date: '2026-09-06T10:30:00Z', type: 'SERVICE', description: 'Laundry' },
      ];

      events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      expect(events[0].type).toBe('CHECK_IN');
      expect(events[1].type).toBe('RESTAURANT');
      expect(events[2].type).toBe('SERVICE');
      expect(events[3].type).toBe('CHECK_OUT');
    });
  });
});

// ==========================================
// E. VALIDATION SCHEMA TESTS
// ==========================================
describe('Guest Database - Validation Schemas', () => {
  describe('E1. Guest search validation', () => {
    it('should reject invalid page number', async () => {
      const { GuestSearchInputSchema } = await import('@/validations/guest-db');
      const result = GuestSearchInputSchema.safeParse({ page: -1 });
      expect(result.success).toBe(false);
    });

    it('should accept valid search input', async () => {
      const { GuestSearchInputSchema } = await import('@/validations/guest-db');
      const result = GuestSearchInputSchema.safeParse({ query: 'Rajesh', page: 1, pageSize: 25 });
      expect(result.success).toBe(true);
    });
  });

  describe('E2. Stay investigation validation', () => {
    it('should accept dateFrom as a string', async () => {
      const { StayInvestigationInputSchema } = await import('@/validations/guest-db');
      const result = StayInvestigationInputSchema.safeParse({ dateFrom: '' });
      expect(result.success).toBe(true);
    });

    it('should accept valid date format', async () => {
      const { StayInvestigationInputSchema } = await import('@/validations/guest-db');
      const result = StayInvestigationInputSchema.safeParse({ dateFrom: '2026-09-05', status: 'all' });
      expect(result.success).toBe(true);
    });

    it('should default status to all', async () => {
      const { StayInvestigationInputSchema } = await import('@/validations/guest-db');
      const result = StayInvestigationInputSchema.safeParse({ dateFrom: '2026-09-05' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('all');
      }
    });
  });

  describe('E3. Post charge validation', () => {
    it('should reject negative amount', async () => {
      const { PostStayChargeInputSchema } = await import('@/validations/guest-db');
      const result = PostStayChargeInputSchema.safeParse({
        stayId: 'clx0abc1234567890abcdefg',
        description: 'Test charge',
        amount: -100,
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty description', async () => {
      const { PostStayChargeInputSchema } = await import('@/validations/guest-db');
      const result = PostStayChargeInputSchema.safeParse({
        stayId: 'clx0abc1234567890abcdefg',
        description: '',
        amount: 100,
      });
      expect(result.success).toBe(false);
    });

    it('should accept valid charge data', async () => {
      const { PostStayChargeInputSchema } = await import('@/validations/guest-db');
      const result = PostStayChargeInputSchema.safeParse({
        stayId: 'clx0abc1234567890abcdefg',
        description: 'Laundry - 2 shirts',
        amount: 300,
      });
      expect(result.success).toBe(true);
    });
  });
});

// ==========================================
// F. RBAC PERMISSION TESTS
// ==========================================
describe('Guest Database - RBAC Permissions', () => {
  describe('F1. Required permissions', () => {
    it('should have guest:read permission defined', async () => {
      const { hasPermission } = await import('@/lib/permissions/rbac');
      const superAdmin = { role: 'SUPER_ADMIN' };
      expect(hasPermission(superAdmin, 'guest:read')).toBe(true);
    });

    it('should have guest:view_sensitive permission defined', async () => {
      const { hasPermission } = await import('@/lib/permissions/rbac');
      const superAdmin = { role: 'SUPER_ADMIN' };
      expect(hasPermission(superAdmin, 'guest:view_sensitive')).toBe(true);
    });

    it('should grant guest:read to RECEPTIONIST', async () => {
      const { hasPermission } = await import('@/lib/permissions/rbac');
      const receptionist = { role: 'RECEPTIONIST' };
      expect(hasPermission(receptionist, 'guest:read')).toBe(true);
    });

    it('should NOT grant guest:view_sensitive to RECEPTIONIST', async () => {
      const { hasPermission } = await import('@/lib/permissions/rbac');
      const receptionist = { role: 'RECEPTIONIST' };
      expect(hasPermission(receptionist, 'guest:view_sensitive')).toBe(false);
    });

    it('should grant guest:view_sensitive to ADMIN', async () => {
      const { hasPermission } = await import('@/lib/permissions/rbac');
      const admin = { role: 'ADMIN' };
      expect(hasPermission(admin, 'guest:view_sensitive')).toBe(true);
    });
  });
});

// ==========================================
// G. PDF TEMPLATE TESTS
// ==========================================
describe('Guest Database - PDF Template', () => {
  describe('G1. HTML generation', () => {
    it('should generate stay report HTML with correct structure', async () => {
      const { generateStayReportHTML } = await import('@/lib/guest-db/pdf');
      const mockStay = {
        stayId: 'test',
        stayNumber: 'STY-20260905-1234',
        status: 'COMPLETED',
        actualCheckIn: '2026-09-05T14:12:00Z',
        expectedCheckOut: '2026-09-07T00:00:00Z',
        actualCheckOut: '2026-09-07T10:18:00Z',
        notes: null,
        createdAt: '2026-09-05T14:12:00Z',
        primaryGuest: { id: 'g1', firstName: 'Rajesh', lastName: 'Sharma', phone: '9876543210', email: null },
        reservation: { id: 'r1', reservationNumber: 'RES-20260905-1234', source: 'DIRECT_WEBSITE' },
        roomAssignments: [{ id: 'ra1', roomNumber: 'D-2004', roomTypeName: 'Deluxe Heritage Suite', assignedAt: '2026-09-05T14:12:00Z', releasedAt: '2026-09-07T10:18:00Z', status: 'ENDED' }],
        accompanyingGuests: [],
        financialSummary: {
          accommodationCharges: '6160.00', additionalCharges: '340.00', restaurantCharges: '1300.00',
          serviceCharges: '0.00', taxCharges: '500.00', discountCredits: '0.00',
          grossCharges: '8300.00', totalPaid: '6160.00', totalRefunds: '0.00', outstandingBalance: '2140.00',
          lineItems: [], payments: [],
        },
        restaurantOrders: [], serviceRequests: [],
        timeline: [{ date: '2026-09-05T14:12:00Z', type: 'CHECK_IN', description: 'Checked in', amount: null, icon: 'door-open' }],
      };

      const html = generateStayReportHTML(mockStay);
      expect(html).toContain('Infinity Resort & Restaurant');
      expect(html).toContain('STY-20260905-1234');
      expect(html).toContain('Rajesh Sharma');
      expect(html).toContain('D-2004');
    });

    it('should generate guest history HTML with correct structure', async () => {
      const { generateGuestHistoryHTML } = await import('@/lib/guest-db/pdf');
      const mockProfile = {
        guest: {
          id: 'g1', firstName: 'Rajesh', lastName: 'Sharma', email: null, phone: '9876543210',
          alternatePhone: null, address: null, city: 'Mhow', state: 'MP', postalCode: null,
          country: 'India', dateOfBirth: null, nationality: 'Indian', vip: false, blacklisted: false,
          notes: null, createdAt: '2026-09-05T14:12:00Z', stayCount: 2, totalSpent: '15350.00', totalPaid: '13000.00',
          outstandingBalance: '2350.00', averageStayDuration: 2, totalRoomNights: 4,
          lastStayDate: '2026-09-05T14:12:00Z', lastStayRoom: 'D-2004',
        },
        photo: null,
        documents: [],
        stays: [{
          stayId: 's1', stayNumber: 'STY-20260905-1234', reservationNumber: 'RES-20260905-1234',
          roomNumber: 'D-2004', roomTypeName: 'Deluxe Heritage Suite',
          actualCheckIn: '2026-09-05T14:12:00Z', expectedCheckOut: '2026-09-07T00:00:00Z',
          actualCheckOut: '2026-09-07T10:18:00Z', status: 'CHECKED_OUT',
          folioBalance: '0.00', totalPaid: '8450.00', nights: 2,
        }],
        upcomingBookings: [],
        financialSummary: {
          totalBilled: '15350.00', totalPaid: '13000.00', outstandingBalance: '2350.00',
          averageBillPerStay: '7675.00', highestBill: '8450.00', lowestBill: '6900.00',
          totalTaxPaid: '1800.00', totalRefunds: '0.00',
        },
      };

      const html = generateGuestHistoryHTML(mockProfile);
      expect(html).toContain('Infinity Resort & Restaurant');
      expect(html).toContain('Guest History Report');
      expect(html).toContain('Rajesh Sharma');
      expect(html).toContain('STY-20260905-1234');
    });
  });
});
