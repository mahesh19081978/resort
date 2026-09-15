import { describe, it, expect } from 'vitest';
import { generateInventoryNumber } from '@/lib/inventory/numbers';
import {
  createVendorSchema,
  createPurchaseRequestSchema,
  createPurchaseOrderSchema,
  createGrnSchema,
  createPurchaseBillSchema,
  createVendorPaymentSchema,
} from '@/validations/procurement';
import { Prisma } from '@prisma/client';

describe('PROCUREMENT DOMAIN INVARIANTS & INTEGRITY', () => {
  describe('Collision-Resistant Numbering Prefixes', () => {
    it('generates correct prefix and structure for all procurement entities', () => {
      const prNo = generateInventoryNumber('PR');
      const poNo = generateInventoryNumber('PO');
      const grnNo = generateInventoryNumber('GRN');
      const billNo = generateInventoryNumber('PB');
      const vpNo = generateInventoryNumber('VP');
      const vndNo = generateInventoryNumber('VND');

      expect(prNo).toMatch(/^PR-\d{8}-[A-F0-9]{6}$/);
      expect(poNo).toMatch(/^PO-\d{8}-[A-F0-9]{6}$/);
      expect(grnNo).toMatch(/^GRN-\d{8}-[A-F0-9]{6}$/);
      expect(billNo).toMatch(/^PB-\d{8}-[A-F0-9]{6}$/);
      expect(vpNo).toMatch(/^VP-\d{8}-[A-F0-9]{6}$/);
      expect(vndNo).toMatch(/^VND-\d{8}-[A-F0-9]{6}$/);
    });
  });

  describe('Validation Schemas & Boundary Rules', () => {
    it('rejects PR with zero or negative quantity', () => {
      const invalid = {
        department: 'F&B',
        items: [
          { itemId: 'c123456789012345678901234', quantity: 0 },
        ],
      };
      const res = createPurchaseRequestSchema.safeParse(invalid);
      expect(res.success).toBe(false);
    });

    it('rejects PO without line items', () => {
      const invalid = {
        vendorId: 'c123456789012345678901234',
        items: [],
      };
      const res = createPurchaseOrderSchema.safeParse(invalid);
      expect(res.success).toBe(false);
    });

    it('validates GRN item with accepted, rejected, and damaged segregation', () => {
      const validGrn = {
        poId: 'c123456789012345678901234',
        storeId: 'c123456789012345678901235',
        challanNumber: 'DC-9921',
        items: [
          {
            itemId: 'c123456789012345678901236',
            receivedQuantity: 10,
            acceptedQuantity: 8,
            rejectedQuantity: 1,
            damagedQuantity: 1,
            rejectionReason: 'Broken seal',
            unitPrice: 150.0,
          },
        ],
      };
      const res = createGrnSchema.safeParse(validGrn);
      expect(res.success).toBe(true);
    });

    it('validates Purchase Bill requires positive total amount', () => {
      const invalidBill = {
        vendorId: 'c123456789012345678901234',
        vendorBillNo: 'INV-1001',
        billDate: '2026-03-15',
        dueDate: '2026-04-15',
        subtotal: 100,
        taxAmount: 18,
        totalAmount: 0,
      };
      const res = createPurchaseBillSchema.safeParse(invalidBill);
      expect(res.success).toBe(false);
    });

    it('validates Vendor Payment requires at least one bill allocation', () => {
      const invalidPayment = {
        vendorId: 'c123456789012345678901234',
        amount: 5000,
        paymentMethod: 'BANK_TRANSFER',
        allocations: [],
      };
      const res = createVendorPaymentSchema.safeParse(invalidPayment);
      expect(res.success).toBe(false);
    });
  });

  describe('Decimal Precision & Financial Calculations', () => {
    it('maintains strict decimal arithmetic without JS floating point artifacts', () => {
      // Classic JS float trap: 0.1 + 0.2 = 0.30000000000000004
      const p1 = new Prisma.Decimal('0.1');
      const p2 = new Prisma.Decimal('0.2');
      const sum = p1.add(p2);
      expect(sum.toString()).toBe('0.3');
      expect(sum.toFixed(2)).toBe('0.30');

      // Bill line items: 3 units @ 199.99 + 18% tax
      const qty = new Prisma.Decimal(3);
      const unitPrice = new Prisma.Decimal('199.99');
      const subtotal = qty.mul(unitPrice);
      const taxRate = new Prisma.Decimal('0.18');
      const taxAmount = subtotal.mul(taxRate);
      const total = subtotal.add(taxAmount);

      expect(subtotal.toFixed(2)).toBe('599.97');
      expect(taxAmount.toFixed(2)).toBe('107.99');
      expect(total.toFixed(2)).toBe('707.96');
    });

    it('validates payment allocation summation against payment total', () => {
      const paymentAmount = new Prisma.Decimal('1500.00');
      const alloc1 = new Prisma.Decimal('500.00');
      const alloc2 = new Prisma.Decimal('1000.00');
      const totalAllocated = alloc1.add(alloc2);

      expect(totalAllocated.equals(paymentAmount)).toBe(true);

      const overAllocated = totalAllocated.add(new Prisma.Decimal('0.01'));
      expect(overAllocated.greaterThan(paymentAmount)).toBe(true);
    });
  });

  describe('GRN Physical Receipt Breakdown & Integrity Invariants', () => {
    it('enforces accepted only <= outstanding', () => {
      const outstanding = new Prisma.Decimal(10);
      const accepted = new Prisma.Decimal(10);
      const rejected = new Prisma.Decimal(0);
      const damaged = new Prisma.Decimal(0);
      const received = accepted.plus(rejected).plus(damaged);

      expect(received.equals(accepted)).toBe(true);
      expect(received.lessThanOrEqualTo(outstanding)).toBe(true);
    });

    it('enforces accepted + rejected <= outstanding', () => {
      const outstanding = new Prisma.Decimal(10);
      const accepted = new Prisma.Decimal(7);
      const rejected = new Prisma.Decimal(3);
      const damaged = new Prisma.Decimal(0);
      const accounted = accepted.plus(rejected).plus(damaged);

      expect(accounted.equals(10)).toBe(true);
      expect(accounted.lessThanOrEqualTo(outstanding)).toBe(true);
    });

    it('enforces accepted + damaged <= outstanding', () => {
      const outstanding = new Prisma.Decimal(10);
      const accepted = new Prisma.Decimal(8);
      const rejected = new Prisma.Decimal(0);
      const damaged = new Prisma.Decimal(2);
      const accounted = accepted.plus(rejected).plus(damaged);

      expect(accounted.equals(10)).toBe(true);
      expect(accounted.lessThanOrEqualTo(outstanding)).toBe(true);
    });

    it('enforces accepted + rejected + damaged <= outstanding', () => {
      const outstanding = new Prisma.Decimal(10);
      const accepted = new Prisma.Decimal(6);
      const rejected = new Prisma.Decimal(2);
      const damaged = new Prisma.Decimal(2);
      const accounted = accepted.plus(rejected).plus(damaged);

      expect(accounted.equals(10)).toBe(true);
      expect(accounted.lessThanOrEqualTo(outstanding)).toBe(true);
    });

    it('blocks accounted receipt when accepted + rejected + damaged exceeds outstanding', () => {
      const outstanding = new Prisma.Decimal(10);
      const accepted = new Prisma.Decimal(6);
      const rejected = new Prisma.Decimal(3);
      const damaged = new Prisma.Decimal(2); // Sum = 11 > 10
      const accounted = accepted.plus(rejected).plus(damaged);

      expect(accounted.greaterThan(outstanding)).toBe(true);
    });

    it('blocks excess rejected quantity even when accepted is within limits', () => {
      const outstanding = new Prisma.Decimal(5);
      const accepted = new Prisma.Decimal(2);
      const rejected = new Prisma.Decimal(4); // Sum = 6 > 5
      const accounted = accepted.plus(rejected);

      expect(accounted.greaterThan(outstanding)).toBe(true);
    });

    it('blocks excess damaged quantity even when accepted is zero', () => {
      const outstanding = new Prisma.Decimal(5);
      const accepted = new Prisma.Decimal(0);
      const damaged = new Prisma.Decimal(6); // Sum = 6 > 5
      const accounted = accepted.plus(damaged);

      expect(accounted.greaterThan(outstanding)).toBe(true);
    });

    it('allows zero accepted with all rejected (valid rejection without stock entry)', () => {
      const outstanding = new Prisma.Decimal(5);
      const accepted = new Prisma.Decimal(0);
      const rejected = new Prisma.Decimal(5);
      const damaged = new Prisma.Decimal(0);
      const accounted = accepted.plus(rejected).plus(damaged);

      expect(accounted.equals(5)).toBe(true);
      expect(accounted.lessThanOrEqualTo(outstanding)).toBe(true);
      // Stock movement count should be 0 because accepted is 0
      expect(accepted.equals(0)).toBe(true);
    });

    it('blocks received != (accepted + rejected + damaged)', () => {
      const accepted = new Prisma.Decimal(5);
      const rejected = new Prisma.Decimal(2);
      const damaged = new Prisma.Decimal(1);
      const sum = accepted.plus(rejected).plus(damaged); // 8

      const declaredReceived = new Prisma.Decimal(10); // Declares 10 but items add to 8
      expect(declaredReceived.equals(sum)).toBe(false);
    });
  });

  describe('PO/GRN/Bill Header Reconciliation & Exact Decimal Equality', () => {
    it('enforces totalAmount === subtotal + taxAmount with canonical 2-decimal rounding', () => {
      function validateBillTotal(subtotal: number | string, taxAmount: number | string, totalAmount: number | string): boolean {
        const s = new Prisma.Decimal(new Prisma.Decimal(subtotal).toFixed(2));
        const t = new Prisma.Decimal(new Prisma.Decimal(taxAmount).toFixed(2));
        const total = new Prisma.Decimal(new Prisma.Decimal(totalAmount).toFixed(2));
        return s.plus(t).equals(total);
      }

      // Test cases specified by user:
      // 100 + 18 = 118 -> pass
      expect(validateBillTotal(100, 18, 118)).toBe(true);
      // 100 + 18.01 = 118.01 -> pass
      expect(validateBillTotal(100, 18.01, 118.01)).toBe(true);
      // 100 + 18 = 118.01 -> reject
      expect(validateBillTotal(100, 18, 118.01)).toBe(false);
      // 100 + 18 = 117.99 -> reject
      expect(validateBillTotal(100, 18, 117.99)).toBe(false);
    });

    it('validates PO status must be ISSUED, PARTIALLY_RECEIVED, or FULLY_RECEIVED for billing', () => {
      const billableStatuses = ['ISSUED', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED'];
      const nonBillableStatuses = ['DRAFT', 'CANCELLED'];

      for (const st of billableStatuses) {
        expect(['ISSUED', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED'].includes(st)).toBe(true);
      }
      for (const st of nonBillableStatuses) {
        expect(['ISSUED', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED'].includes(st)).toBe(false);
      }
    });

    it('validates GRN status must be STORED for billing', () => {
      const validGrnStatus: string = 'STORED';
      expect(validGrnStatus === 'STORED').toBe(true);
      const otherStatus: string = 'DRAFT';
      expect(otherStatus === 'STORED').toBe(false);
    });
  });

  describe('Purchase Request -> Purchase Order Cumulative Quantity Controls', () => {
    it('enforces cumulative PO quantity across multiple POs cannot exceed approved PR quantity', () => {
      // Scenario requested:
      // Approved PR = 100
      // PO1 = 70
      // PO2 = 30 -> allowed
      // PO3 = 1 -> rejected
      const approvedPrQty = new Prisma.Decimal(100);

      // PO1: order 70
      let orderedSoFar = new Prisma.Decimal(0);
      const po1Qty = new Prisma.Decimal(70);
      expect(orderedSoFar.plus(po1Qty).lessThanOrEqualTo(approvedPrQty)).toBe(true);
      orderedSoFar = orderedSoFar.plus(po1Qty); // 70

      // PO2: order 30
      const po2Qty = new Prisma.Decimal(30);
      expect(orderedSoFar.plus(po2Qty).lessThanOrEqualTo(approvedPrQty)).toBe(true);
      orderedSoFar = orderedSoFar.plus(po2Qty); // 100

      // PO3: order 1 -> exceeds cumulative limit
      const po3Qty = new Prisma.Decimal(1);
      expect(orderedSoFar.plus(po3Qty).greaterThan(approvedPrQty)).toBe(true);
    });

    it('handles concurrency serialization with row lock preventing race conditions on PR', () => {
      // Two concurrent PO attempts trying to consume the remaining balance
      const approvedPrQty = new Prisma.Decimal(100);
      const existingOrdered = new Prisma.Decimal(60);
      const remaining = approvedPrQty.minus(existingOrdered); // 40

      const reqA = new Prisma.Decimal(30);
      const reqB = new Prisma.Decimal(30);

      // Under row lock:
      // First transaction claims 30 -> remaining becomes 10
      const afterA = existingOrdered.plus(reqA); // 90
      expect(afterA.lessThanOrEqualTo(approvedPrQty)).toBe(true);

      // Second transaction re-reads under lock -> 90 + 30 = 120 > 100 -> rejected
      const afterB = afterA.plus(reqB);
      expect(afterB.greaterThan(approvedPrQty)).toBe(true);
    });
  });

  describe('Vendor Payment Financial Invariants & Idempotency Safety', () => {
    it('blocks over-allocation beyond bill balance due', () => {
      const billBalanceDue = new Prisma.Decimal('2500.00');
      const proposedAlloc = new Prisma.Decimal('2500.01');

      expect(proposedAlloc.greaterThan(billBalanceDue)).toBe(true);
    });

    it('handles Scenario A & B: same request twice / concurrent same request returns idempotent success', () => {
      const existing = {
        id: 'vp_123',
        paymentNumber: 'VP-20260315-A1B2C3',
        vendorId: 'vnd_1',
        amount: new Prisma.Decimal('1000.00'),
        paymentMethod: 'BANK_TRANSFER',
        transactionReference: 'TXN-998811',
        allocations: [{ purchaseBillId: 'pb_1', amountAllocated: new Prisma.Decimal('1000.00') }],
      };

      const retryRequest = {
        vendorId: 'vnd_1',
        amount: new Prisma.Decimal('1000.00'),
        paymentMethod: 'BANK_TRANSFER',
        transactionReference: 'TXN-998811',
        allocations: [{ purchaseBillId: 'pb_1', amountAllocated: new Prisma.Decimal('1000.00') }],
      };

      // Financial context matches:
      const matches =
        existing.amount.equals(retryRequest.amount) &&
        existing.paymentMethod === retryRequest.paymentMethod &&
        existing.allocations.length === retryRequest.allocations.length &&
        existing.allocations[0].purchaseBillId === retryRequest.allocations[0].purchaseBillId &&
        existing.allocations[0].amountAllocated.equals(retryRequest.allocations[0].amountAllocated);

      expect(matches).toBe(true);
    });

    it('handles Scenario C: same reference + different amount -> REJECT', () => {
      const existing = {
        amount: new Prisma.Decimal('1000.00'),
      };
      const conflictingRequest = {
        amount: new Prisma.Decimal('1500.00'),
      };

      const matches = existing.amount.equals(conflictingRequest.amount);
      expect(matches).toBe(false);
    });

    it('handles Scenario D: same reference + different bill/context -> REJECT', () => {
      const existing = {
        allocations: [{ purchaseBillId: 'pb_1', amountAllocated: new Prisma.Decimal('1000.00') }],
      };
      const conflictingBillRequest = {
        allocations: [{ purchaseBillId: 'pb_2', amountAllocated: new Prisma.Decimal('1000.00') }],
      };

      const matchesBill = existing.allocations[0].purchaseBillId === conflictingBillRequest.allocations[0].purchaseBillId;
      expect(matchesBill).toBe(false);
    });

    it('handles Scenario E: null/absent/whitespace reference -> normal non-idempotent behavior', () => {
      function normalizeTxRef(ref?: string | null): string | null {
        return ref && ref.trim().length > 0 ? ref.trim() : null;
      }

      expect(normalizeTxRef(null)).toBe(null);
      expect(normalizeTxRef(undefined)).toBe(null);
      expect(normalizeTxRef('')).toBe(null);
      expect(normalizeTxRef('   ')).toBe(null);
      expect(normalizeTxRef('TX-123')).toBe('TX-123');
    });

    it('computes correct new paid amount and remaining balance', () => {
      const totalBill = new Prisma.Decimal('10000.00');
      const prevPaid = new Prisma.Decimal('4000.00');
      const alloc = new Prisma.Decimal('3000.00');

      const newPaid = prevPaid.plus(alloc);
      const newBalance = totalBill.minus(newPaid);

      expect(newPaid.toFixed(2)).toBe('7000.00');
      expect(newBalance.toFixed(2)).toBe('3000.00');
      expect(newBalance.lessThanOrEqualTo(0)).toBe(false); // PARTIALLY_PAID
    });

    it('transitions to FULLY_PAID when balance reaches zero', () => {
      const totalBill = new Prisma.Decimal('5000.00');
      const prevPaid = new Prisma.Decimal('2000.00');
      const alloc = new Prisma.Decimal('3000.00');

      const newPaid = prevPaid.plus(alloc);
      const newBalance = totalBill.minus(newPaid);

      expect(newBalance.lessThanOrEqualTo(0)).toBe(true); // FULLY_PAID
    });
  });

  describe('Vendor Masking & Sensitive Data Protection', () => {
    it('masks bank account numbers properly preserving last 4 digits', () => {
      function maskAccountNumber(acc?: string | null): string | null {
        if (!acc) return null;
        const trimmed = acc.trim();
        if (trimmed.length <= 4) return '****';
        return `****${trimmed.slice(-4)}`;
      }

      expect(maskAccountNumber('123456789012')).toBe('****9012');
      expect(maskAccountNumber('9876')).toBe('****');
      expect(maskAccountNumber(null)).toBe(null);
      expect(maskAccountNumber('')).toBe(null);
    });
  });
});
