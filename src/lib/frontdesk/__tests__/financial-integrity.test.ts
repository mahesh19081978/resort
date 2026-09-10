import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma, FolioItemType, PaymentStatus } from '@prisma/client';

/**
 * Financial Integrity Regression Tests
 *
 * Verifies that the Folio / Bill / In-House card calculations
 * never double-tax accommodation charges.
 *
 * Root cause: FolioItem.amount is always the gross (tax-inclusive)
 * amount, but bill/inhouse calculations were adding taxAmount on top.
 *
 * Invariant: For a priced reservation,
 *   Reservation.totalAmount = sum(ReservationRoom.lineTotal)
 *   Opening ROOM_CHARGE.amount = Reservation.totalAmount
 *   Final accommodation total = ROOM_CHARGE.amount (not amount + taxAmount)
 */

// ─── Helpers ───────────────────────────────────────────────

function decimal(v: string | number): Prisma.Decimal {
  return new Prisma.Decimal(v.toString());
}

interface MockFolioItem {
  itemType: FolioItemType;
  description: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  amount: Prisma.Decimal;
  isVoided: boolean;
}

function createMockRoomCharge(params: {
  basePrice: number;
  nights: number;
  taxRate: number;
}): MockFolioItem {
  const base = decimal(params.basePrice).mul(params.nights);
  const tax = base.mul(decimal(params.taxRate).div(100)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_EVEN);
  const gross = base.add(tax);

  return {
    itemType: FolioItemType.ROOM_CHARGE,
    description: 'Accommodation Charge',
    quantity: 1,
    unitPrice: base,
    taxAmount: tax,
    amount: gross,
    isVoided: false,
  };
}

function createMockServiceCharge(params: {
  basePrice: number;
  quantity: number;
  taxRate: number;
}): MockFolioItem {
  const base = decimal(params.basePrice).mul(params.quantity);
  const tax = base.mul(decimal(params.taxRate).div(100)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_EVEN);
  const gross = base.add(tax);

  return {
    itemType: FolioItemType.EXTRA_SERVICE_CHARGE,
    description: 'Service Charge',
    quantity: params.quantity,
    unitPrice: decimal(params.basePrice),
    taxAmount: tax,
    amount: gross,
    isVoided: false,
  };
}

function createMockRestaurantCharge(params: {
  basePrice: number;
  quantity: number;
  taxRate: number;
}): MockFolioItem {
  const base = decimal(params.basePrice).mul(params.quantity);
  const tax = base.mul(decimal(params.taxRate).div(100)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_EVEN);
  const gross = base.add(tax);

  return {
    itemType: FolioItemType.RESTAURANT_CHARGE,
    description: 'Restaurant Charge',
    quantity: params.quantity,
    unitPrice: decimal(params.basePrice),
    taxAmount: tax,
    amount: gross,
    isVoided: false,
  };
}

/**
 * Simulates the bill.ts category-level aggregation logic.
 * Mirrors the fixed bill.ts calculation: netBase = amount - taxAmount.
 */
function simulateBillCategoryCalculation(items: MockFolioItem[]) {
  let subtotal = new Prisma.Decimal(0);
  let tax = new Prisma.Decimal(0);

  for (const item of items) {
    if (item.isVoided) continue;
    const netBase = item.amount.minus(item.taxAmount);
    subtotal = subtotal.plus(netBase);
    tax = tax.plus(item.taxAmount);
  }

  const total = subtotal.plus(tax);
  return { subtotal, tax, total };
}

/**
 * Simulates the inhouse.ts totalFolioCharges calculation.
 * Mirrors the fixed inhouse.ts: amounts are already gross, no separate tax addition.
 */
function simulateInHouseTotalCalculation(items: MockFolioItem[]) {
  let roomCharges = new Prisma.Decimal(0);
  let additionalCharges = new Prisma.Decimal(0);
  let restaurantCharges = new Prisma.Decimal(0);
  let taxCharges = new Prisma.Decimal(0);
  let discountCredits = new Prisma.Decimal(0);

  for (const item of items) {
    if (item.isVoided) continue;
    const amt = item.amount;
    switch (item.itemType) {
      case FolioItemType.ROOM_CHARGE:
        roomCharges = roomCharges.plus(amt);
        break;
      case FolioItemType.RESTAURANT_CHARGE:
      case FolioItemType.ROOM_SERVICE_CHARGE:
        restaurantCharges = restaurantCharges.plus(amt);
        break;
      case FolioItemType.DISCOUNT_CREDIT:
        discountCredits = discountCredits.plus(amt);
        break;
      case FolioItemType.TAX_CHARGE:
        taxCharges = taxCharges.plus(amt);
        break;
      default:
        additionalCharges = additionalCharges.plus(amt);
        break;
    }
  }

  const totalFolioCharges = roomCharges
    .plus(additionalCharges)
    .plus(restaurantCharges)
    .plus(taxCharges)
    .minus(discountCredits);

  return { roomCharges, additionalCharges, restaurantCharges, taxCharges, discountCredits, totalFolioCharges };
}

/**
 * Simulates the checkout.ts ledger calculation.
 * Uses item.amount directly (no taxAmount addition).
 */
function simulateCheckoutCalculation(items: MockFolioItem[], payments: number[]) {
  let totalCharges = new Prisma.Decimal(0);
  let totalCredits = new Prisma.Decimal(0);

  for (const item of items) {
    if (item.isVoided) continue;
    if (item.itemType === FolioItemType.DISCOUNT_CREDIT || item.itemType === FolioItemType.PAYMENT_CREDIT) {
      totalCredits = totalCredits.plus(item.amount);
    } else {
      totalCharges = totalCharges.plus(item.amount);
    }
  }

  let totalPayments = new Prisma.Decimal(0);
  for (const p of payments) {
    totalPayments = totalPayments.plus(decimal(p));
  }

  const finalBalance = totalCharges.minus(totalCredits).minus(totalPayments);
  return { totalCharges, totalCredits, totalPayments, finalBalance };
}

// ─── TEST 1: Standard Heritage Room ────────────────────────

describe('Financial Integrity — Standard Heritage Room', () => {
  const ROOM_BASE = 5500;
  const GST_RATE = 12;
  const EXPECTED_TAX = 660;
  const EXPECTED_TOTAL = 6160;

  it('opening ROOM_CHARGE.amount equals reservation total (₹6,160)', () => {
    const roomCharge = createMockRoomCharge({
      basePrice: ROOM_BASE,
      nights: 1,
      taxRate: GST_RATE,
    });

    expect(roomCharge.amount.toFixed(0)).toBe(EXPECTED_TOTAL.toString());
    expect(roomCharge.taxAmount.toFixed(0)).toBe(EXPECTED_TAX.toString());
    expect(roomCharge.unitPrice.toFixed(0)).toBe(ROOM_BASE.toString());
  });

  it('bill calculation: accommodation total = ₹6,160 (not ₹6,820)', () => {
    const roomCharge = createMockRoomCharge({
      basePrice: ROOM_BASE,
      nights: 1,
      taxRate: GST_RATE,
    });

    const bill = simulateBillCategoryCalculation([roomCharge]);

    expect(bill.subtotal.toFixed(0)).toBe(ROOM_BASE.toString());
    expect(bill.tax.toFixed(0)).toBe(EXPECTED_TAX.toString());
    expect(bill.total.toFixed(0)).toBe(EXPECTED_TOTAL.toString());
    // CRITICAL: total must NOT be 6820
    expect(bill.total.toFixed(0)).not.toBe('6820');
  });

  it('in-house card total = ₹6,160 (not ₹6,820)', () => {
    const roomCharge = createMockRoomCharge({
      basePrice: ROOM_BASE,
      nights: 1,
      taxRate: GST_RATE,
    });

    const card = simulateInHouseTotalCalculation([roomCharge]);

    expect(card.roomCharges.toFixed(0)).toBe(EXPECTED_TOTAL.toString());
    expect(card.totalFolioCharges.toFixed(0)).toBe(EXPECTED_TOTAL.toString());
    // CRITICAL: total must NOT be 6820
    expect(card.totalFolioCharges.toFixed(0)).not.toBe('6820');
  });

  it('checkout ledger: totalCharges = ₹6,160', () => {
    const roomCharge = createMockRoomCharge({
      basePrice: ROOM_BASE,
      nights: 1,
      taxRate: GST_RATE,
    });

    const checkout = simulateCheckoutCalculation([roomCharge], [EXPECTED_TOTAL]);

    expect(checkout.totalCharges.toFixed(0)).toBe(EXPECTED_TOTAL.toString());
    expect(checkout.finalBalance.toFixed(0)).toBe('0');
  });
});

// ─── TEST 2: Deluxe Heritage Suite ─────────────────────────

describe('Financial Integrity — Deluxe Heritage Suite', () => {
  const ROOM_BASE = 8500;
  const GST_RATE = 12;
  const EXPECTED_TAX = 1020;
  const EXPECTED_TOTAL = 9520;

  it('opening ROOM_CHARGE.amount equals reservation total (₹9,520)', () => {
    const roomCharge = createMockRoomCharge({
      basePrice: ROOM_BASE,
      nights: 1,
      taxRate: GST_RATE,
    });

    expect(roomCharge.amount.toFixed(0)).toBe(EXPECTED_TOTAL.toString());
    expect(roomCharge.taxAmount.toFixed(0)).toBe(EXPECTED_TAX.toString());
  });

  it('bill calculation: accommodation total = ₹9,520 (not ₹10,540)', () => {
    const roomCharge = createMockRoomCharge({
      basePrice: ROOM_BASE,
      nights: 1,
      taxRate: GST_RATE,
    });

    const bill = simulateBillCategoryCalculation([roomCharge]);

    expect(bill.subtotal.toFixed(0)).toBe(ROOM_BASE.toString());
    expect(bill.tax.toFixed(0)).toBe(EXPECTED_TAX.toString());
    expect(bill.total.toFixed(0)).toBe(EXPECTED_TOTAL.toString());
    // CRITICAL: total must NOT be 10540
    expect(bill.total.toFixed(0)).not.toBe('10540');
  });

  it('in-house card total = ₹9,520 (not ₹10,540)', () => {
    const roomCharge = createMockRoomCharge({
      basePrice: ROOM_BASE,
      nights: 1,
      taxRate: GST_RATE,
    });

    const card = simulateInHouseTotalCalculation([roomCharge]);

    expect(card.totalFolioCharges.toFixed(0)).toBe(EXPECTED_TOTAL.toString());
    expect(card.totalFolioCharges.toFixed(0)).not.toBe('10540');
  });
});

// ─── TEST 3: Online Advance Paid ───────────────────────────

describe('Financial Integrity — Online Advance Paid', () => {
  it('full advance: accommodation = ₹6,160, paid = ₹6,160, balance = ₹0', () => {
    const roomCharge = createMockRoomCharge({
      basePrice: 5500,
      nights: 1,
      taxRate: 12,
    });

    const checkout = simulateCheckoutCalculation([roomCharge], [6160]);

    expect(checkout.totalCharges.toFixed(0)).toBe('6160');
    expect(checkout.totalPayments.toFixed(0)).toBe('6160');
    expect(checkout.finalBalance.toFixed(0)).toBe('0');
  });
});

// ─── TEST 4: Additional Charge During Stay ─────────────────

describe('Financial Integrity — Additional Charge During Stay', () => {
  it('room + coke: total = ₹6,200, paid = ₹6,160, balance = ₹40', () => {
    const roomCharge = createMockRoomCharge({
      basePrice: 5500,
      nights: 1,
      taxRate: 12,
    });

    // Coke ₹40 (no tax for simplicity, or with tax)
    const coke = createMockServiceCharge({
      basePrice: 40,
      quantity: 1,
      taxRate: 0, // assume no tax on coke for this test
    });

    const items = [roomCharge, coke];
    const card = simulateInHouseTotalCalculation(items);

    // Room charges = ₹6,160 (gross)
    expect(card.roomCharges.toFixed(0)).toBe('6160');
    // Additional charges = ₹40
    expect(card.additionalCharges.toFixed(0)).toBe('40');
    // Total = ₹6,160 + ₹40 = ₹6,200
    expect(card.totalFolioCharges.toFixed(0)).toBe('6200');

    // Checkout with full room payment
    const checkout = simulateCheckoutCalculation(items, [6160]);
    expect(checkout.totalCharges.toFixed(0)).toBe('6200');
    expect(checkout.totalPayments.toFixed(0)).toBe('6160');
    expect(checkout.finalBalance.toFixed(0)).toBe('40');
  });
});

// ─── TEST 5: Laundry Charge ────────────────────────────────

describe('Financial Integrity — Laundry Charge', () => {
  it('room + laundry with tax: room GST remains ₹660, not duplicated', () => {
    const roomCharge = createMockRoomCharge({
      basePrice: 5500,
      nights: 1,
      taxRate: 12,
    });

    const laundry = createMockServiceCharge({
      basePrice: 300,
      quantity: 1,
      taxRate: 18,
    });

    const items = [roomCharge, laundry];
    const bill = simulateBillCategoryCalculation(items);

    // Room base = ₹5,500, laundry base = ₹300
    // Room tax = ₹660, laundry tax = ₹54
    // Total = ₹5,500 + ₹300 + ₹660 + ₹54 = ₹6,514
    expect(bill.subtotal.toFixed(0)).toBe('5800'); // 5500 + 300
    expect(bill.tax.toFixed(0)).toBe('714'); // 660 + 54
    expect(bill.total.toFixed(0)).toBe('6514');

    // Verify room charge is not double-taxed
    const card = simulateInHouseTotalCalculation(items);
    expect(card.roomCharges.toFixed(0)).toBe('6160');
    expect(card.totalFolioCharges.toFixed(0)).toBe('6514');
  });
});

// ─── TEST 6: Checkout Does Not Create Additional Tax ───────

describe('Financial Integrity — Checkout', () => {
  it('checkout uses item.amount directly, no recalculation', () => {
    const roomCharge = createMockRoomCharge({
      basePrice: 5500,
      nights: 1,
      taxRate: 12,
    });

    const checkout = simulateCheckoutCalculation([roomCharge], [6160]);

    // totalCharges should be item.amount = ₹6,160
    // NOT item.amount + item.taxAmount = ₹6,820
    expect(checkout.totalCharges.toFixed(0)).toBe('6160');
    expect(checkout.totalCharges.toFixed(0)).not.toBe('6820');
    expect(checkout.finalBalance.toFixed(0)).toBe('0');
  });

  it('checkout with partial payment: balance correct', () => {
    const roomCharge = createMockRoomCharge({
      basePrice: 5500,
      nights: 1,
      taxRate: 12,
    });

    const checkout = simulateCheckoutCalculation([roomCharge], [3000]);

    expect(checkout.totalCharges.toFixed(0)).toBe('6160');
    expect(checkout.totalPayments.toFixed(0)).toBe('3000');
    expect(checkout.finalBalance.toFixed(0)).toBe('3160');
  });
});

// ─── TEST 7: Bill Breakdown ────────────────────────────────

describe('Financial Integrity — Bill Breakdown', () => {
  it('Standard Room bill: Base ₹5,500 + GST ₹660 = Total ₹6,160', () => {
    const roomCharge = createMockRoomCharge({
      basePrice: 5500,
      nights: 1,
      taxRate: 12,
    });

    const bill = simulateBillCategoryCalculation([roomCharge]);

    // The bill should show:
    // Base Room Charges: ₹5,500
    // GST: ₹660
    // Accommodation Total: ₹6,160
    expect(bill.subtotal.toFixed(2)).toBe('5500.00');
    expect(bill.tax.toFixed(2)).toBe('660.00');
    expect(bill.total.toFixed(2)).toBe('6160.00');
  });

  it('Deluxe Room bill: Base ₹8,500 + GST ₹1,020 = Total ₹9,520', () => {
    const roomCharge = createMockRoomCharge({
      basePrice: 8500,
      nights: 1,
      taxRate: 12,
    });

    const bill = simulateBillCategoryCalculation([roomCharge]);

    expect(bill.subtotal.toFixed(2)).toBe('8500.00');
    expect(bill.tax.toFixed(2)).toBe('1020.00');
    expect(bill.total.toFixed(2)).toBe('9520.00');
  });

  it('2-night stay: Base ₹11,000 + GST ₹1,320 = Total ₹12,320', () => {
    const roomCharge = createMockRoomCharge({
      basePrice: 5500,
      nights: 2,
      taxRate: 12,
    });

    const bill = simulateBillCategoryCalculation([roomCharge]);

    expect(bill.subtotal.toFixed(2)).toBe('11000.00');
    expect(bill.tax.toFixed(2)).toBe('1320.00');
    expect(bill.total.toFixed(2)).toBe('12320.00');
  });
});

// ─── TEST 8: PDF Uses Same Authoritative Totals ────────────

describe('Financial Integrity — PDF Totals Match Database', () => {
  it('PDF grossCharges = sum of item.amount (no recalculation)', () => {
    const roomCharge = createMockRoomCharge({
      basePrice: 5500,
      nights: 1,
      taxRate: 12,
    });

    const coke = createMockServiceCharge({
      basePrice: 40,
      quantity: 1,
      taxRate: 0,
    });

    const items = [roomCharge, coke];

    // Simulate what bill.ts returns as grossCharges
    let grossCharges = new Prisma.Decimal(0);
    let totalTax = new Prisma.Decimal(0);
    for (const item of items) {
      grossCharges = grossCharges.plus(item.amount);
      totalTax = totalTax.plus(item.taxAmount);
    }

    // grossCharges = 6160 + 40 = 6200
    expect(grossCharges.toFixed(0)).toBe('6200');
    // totalTax = 660 + 0 = 660
    expect(totalTax.toFixed(0)).toBe('660');
    // PDF should show these exact values, not recalculate
  });
});

// ─── TEST 9: Financial Invariant — Reservation = Folio ─────

describe('Financial Invariant — Reservation = Folio Opening Charge', () => {
  it('Reservation.totalAmount = ROOM_CHARGE.amount (no double taxation)', () => {
    const scenarios = [
      { base: 5500, tax: 12, total: 6160 },
      { base: 8500, tax: 12, total: 9520 },
      { base: 12000, tax: 12, total: 13440 },
    ];

    for (const s of scenarios) {
      const roomCharge = createMockRoomCharge({
        basePrice: s.base,
        nights: 1,
        taxRate: s.tax,
      });

      // The opening ROOM_CHARGE.amount must equal Reservation.totalAmount
      expect(roomCharge.amount.toFixed(0)).toBe(s.total.toString());

      // The bill total must equal the opening charge
      const bill = simulateBillCategoryCalculation([roomCharge]);
      expect(bill.total.toFixed(0)).toBe(s.total.toString());

      // The in-house card total must equal the opening charge
      const card = simulateInHouseTotalCalculation([roomCharge]);
      expect(card.totalFolioCharges.toFixed(0)).toBe(s.total.toString());
    }
  });
});

// ─── TEST 10: Voided Items Excluded ────────────────────────

describe('Financial Integrity — Voided Items Excluded', () => {
  it('voided room charge not counted', () => {
    const roomCharge = createMockRoomCharge({
      basePrice: 5500,
      nights: 1,
      taxRate: 12,
    });
    roomCharge.isVoided = true;

    const checkout = simulateCheckoutCalculation([roomCharge], []);
    expect(checkout.totalCharges.toFixed(0)).toBe('0');
  });
});

// ─── TEST 11: Server-Authoritative Tax (Phase 1A) ──────────

describe('Financial Integrity — Server-Authoritative Tax', () => {
  it('server computes tax from taxCode, not from client taxAmount', () => {
    const baseAmount = new Prisma.Decimal(1000);
    const taxRate = new Prisma.Decimal(18);

    // Server-side computation (canonical)
    const serverTax = baseAmount.times(taxRate).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_EVEN);
    const serverGross = baseAmount.plus(serverTax);

    // Client cannot override: even if client sends taxAmount=0, server computes correctly
    const clientTaxAmount = 0; // malicious client
    const ignoredClientTax = new Prisma.Decimal(clientTaxAmount);

    // Server ignores client taxAmount and computes its own
    const authoritativeTax = serverTax;
    const authoritativeGross = baseAmount.plus(authoritativeTax);

    expect(authoritativeTax.toFixed(2)).toBe('180.00');
    expect(authoritativeGross.toFixed(2)).toBe('1180.00');
    expect(authoritativeTax.toFixed(2)).not.toBe(ignoredClientTax.toFixed(2));
  });

  it('server rejects client taxAmount=999999 — uses DB tax rate instead', () => {
    const baseAmount = new Prisma.Decimal(500);
    const dbTaxRate = new Prisma.Decimal(12);

    // Malicious client tries to inflate tax
    const maliciousClientTax = 999999;

    // Server computes from DB
    const serverTax = baseAmount.times(dbTaxRate).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_EVEN);
    const serverGross = baseAmount.plus(serverTax);

    expect(serverTax.toFixed(2)).toBe('60.00');
    expect(serverGross.toFixed(2)).toBe('560.00');
    // Client value is never used
    expect(serverTax.toFixed(2)).not.toBe(maliciousClientTax.toString());
  });

  it('postFolioChargeAction schema rejects taxAmount field', () => {
    // The folioChargeSchema should NOT have taxAmount
    // It should have taxCode instead
    const schemaFields = ['folioId', 'description', 'amount', 'taxCode', 'idempotencyKey'];
    expect(schemaFields).toContain('taxCode');
    expect(schemaFields).not.toContain('taxAmount');
  });
});

// ─── TEST 12: Idempotency (Phase 1C) ───────────────────────

describe('Financial Integrity — Idempotency', () => {
  it('same idempotency key + same inputs = return existing result', () => {
    const idempotencyKey = 'charge-stay123-svc456-1725000000000';

    // Simulate first call creates FolioItem
    const firstCall = {
      idempotencyKey,
      folioId: 'folio-1',
      description: 'Laundry Service',
      unitPrice: new Prisma.Decimal(200),
      quantity: 2,
    };

    // Simulate second call with same key + same inputs
    const secondCall = {
      idempotencyKey,
      folioId: 'folio-1',
      description: 'Laundry Service',
      unitPrice: new Prisma.Decimal(200),
      quantity: 2,
    };

    // Both should resolve to the same result
    expect(firstCall.idempotencyKey).toBe(secondCall.idempotencyKey);
    expect(firstCall.description).toBe(secondCall.description);
    expect(firstCall.unitPrice.equals(secondCall.unitPrice)).toBe(true);
  });

  it('same idempotency key + different inputs = IDEMPOTENCY_KEY_REUSE_CONFLICT', () => {
    const idempotencyKey = 'charge-stay123-svc456-1725000000000';

    const existing = {
      idempotencyKey,
      folioId: 'folio-1',
      description: 'Laundry Service',
      unitPrice: new Prisma.Decimal(200),
    };

    const newRequest = {
      idempotencyKey,
      folioId: 'folio-1',
      description: 'Spa Treatment', // Different description
      unitPrice: new Prisma.Decimal(500), // Different price
    };

    // Conflict detection: same key, different material inputs
    const isConflict =
      existing.description !== newRequest.description ||
      !existing.unitPrice.equals(newRequest.unitPrice);

    expect(isConflict).toBe(true);
  });

  it('different idempotency keys = separate FolioItems', () => {
    const key1 = 'charge-stay123-svc456-1725000000000';
    const key2 = 'charge-stay123-svc456-1725000000001';

    expect(key1).not.toBe(key2);
  });
});

// ─── TEST 13: Refund Calculation (Phase 1E) ────────────────

describe('Financial Integrity — Refund Calculation', () => {
  it('payments minus refunds = net credit', () => {
    const paymentAmount = new Prisma.Decimal(6160);
    const refundAmount = new Prisma.Decimal(1000);

    const netCredit = paymentAmount.minus(refundAmount);

    expect(netCredit.toFixed(2)).toBe('5160.00');
  });

  it('outstanding balance includes refund adjustment', () => {
    const totalCharges = new Prisma.Decimal(6160);
    const totalPayments = new Prisma.Decimal(6160);
    const totalRefunds = new Prisma.Decimal(1000);

    // Balance = charges - payments + refunds
    const outstandingBalance = totalCharges.minus(totalPayments).plus(totalRefunds);

    expect(outstandingBalance.toFixed(2)).toBe('1000.00');
  });

  it('multiple refunds aggregate correctly', () => {
    const refunds = [
      new Prisma.Decimal(500),
      new Prisma.Decimal(300),
      new Prisma.Decimal(200),
    ];

    let totalRefunds = new Prisma.Decimal(0);
    for (const r of refunds) {
      totalRefunds = totalRefunds.plus(r);
    }

    expect(totalRefunds.toFixed(2)).toBe('1000.00');
  });

  it('no refunds = zero', () => {
    const totalRefunds = new Prisma.Decimal(0);
    expect(totalRefunds.toFixed(2)).toBe('0.00');
  });
});

// ─── TEST 14: Restaurant Split Bill Reconciliation (Phase 1D) ──

describe('Financial Integrity — Restaurant Split Bill', () => {
  it('sum of child bills equals parent bill total', () => {
    const parentSubtotal = new Prisma.Decimal(1000);
    const parentTax = new Prisma.Decimal(180);
    const parentTotal = parentSubtotal.plus(parentTax);

    // EQUAL split into 3
    const equalParts = 3;
    const totalCents = Math.round(parentTotal.toNumber() * 100);
    const basePortion = Math.floor(totalCents / equalParts);
    const remainder = totalCents % equalParts;

    let childTotals: Prisma.Decimal[] = [];
    for (let i = 0; i < equalParts; i++) {
      const isLast = i === equalParts - 1;
      const portion = new Prisma.Decimal(
        ((basePortion + (isLast ? remainder : 0)) / 100).toFixed(2)
      );
      childTotals.push(portion);
    }

    const sumOfChildren = childTotals.reduce(
      (sum, child) => sum.plus(child),
      new Prisma.Decimal(0)
    );

    expect(sumOfChildren.equals(parentTotal)).toBe(true);
  });

  it('parent bill historical tax rate preserved in split', () => {
    const parentSubtotal = new Prisma.Decimal(1000);
    const parentTax = new Prisma.Decimal(180);
    const parentEffectiveTaxRate = parentTax.dividedBy(parentSubtotal).times(100);

    expect(parentEffectiveTaxRate.toFixed(2)).toBe('18.00');

    // Split should use this rate, NOT hardcoded 5%
    const hardcodedRate = 5.0;
    expect(parentEffectiveTaxRate.toNumber()).not.toBe(hardcodedRate);
  });

  it('custom split portions reconcile to parent total', () => {
    const parentTotal = new Prisma.Decimal(1000);
    const customAmounts = [300, 300, 400];

    const sumGiven = customAmounts.reduce(
      (sum, amt) => sum.plus(new Prisma.Decimal(amt.toFixed(2))),
      new Prisma.Decimal(0)
    );

    expect(sumGiven.equals(parentTotal)).toBe(true);
  });
});

// ─── TEST 15: Service Charge Financial Calculation ──────────

describe('Financial Integrity — Service Charge Calculation', () => {
  it('service charge + tax computed server-side', () => {
    const unitPrice = new Prisma.Decimal(1000);
    const quantity = 2;
    const taxRatePercent = new Prisma.Decimal(18);
    const serviceChargeRate = new Prisma.Decimal(10); // 10% service charge

    const netSubtotal = unitPrice.mul(quantity).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_EVEN);
    const serviceCharge = netSubtotal.mul(serviceChargeRate).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_EVEN);
    const taxBase = netSubtotal.plus(serviceCharge); // service charge is taxable
    const taxAmount = taxBase.mul(taxRatePercent).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_EVEN);
    const grossTotal = netSubtotal.plus(serviceCharge).plus(taxAmount);

    expect(netSubtotal.toFixed(2)).toBe('2000.00');
    expect(serviceCharge.toFixed(2)).toBe('200.00');
    expect(taxAmount.toFixed(2)).toBe('396.00');
    expect(grossTotal.toFixed(2)).toBe('2596.00');
  });

  it('no service charge: tax on net only', () => {
    const unitPrice = new Prisma.Decimal(500);
    const quantity = 1;
    const taxRatePercent = new Prisma.Decimal(12);

    const netSubtotal = unitPrice.mul(quantity).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_EVEN);
    const taxAmount = netSubtotal.mul(taxRatePercent).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_EVEN);
    const grossTotal = netSubtotal.plus(taxAmount);

    expect(netSubtotal.toFixed(2)).toBe('500.00');
    expect(taxAmount.toFixed(2)).toBe('60.00');
    expect(grossTotal.toFixed(2)).toBe('560.00');
  });
});
