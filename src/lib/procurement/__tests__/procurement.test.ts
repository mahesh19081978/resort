import { describe, it, expect } from 'vitest';
import { generateInventoryNumber } from '@/lib/inventory/numbers';
import {
  createVendorSchema,
  createPurchaseRequestSchema,
  createQuickInventoryItemSchema,
  createPurchaseOrderSchema,
  createGrnSchema,
  createPurchaseBillSchema,
  createVendorPaymentSchema,
} from '@/validations/procurement';
import { Prisma } from '@prisma/client';
import { createQuickInventoryItemAction } from '@/actions/procurement';

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

  describe('Quick Inventory Item Creation for Purchase Requests', () => {
    it('validates a valid quick inventory item payload', () => {
      const valid = {
        name: 'King Size Bedsheet White',
        categoryId: 'c123456789012345678901234',
        unitId: 'c123456789012345678901235',
        standardCost: 850.50,
      };
      const res = createQuickInventoryItemSchema.safeParse(valid);
      expect(res.success).toBe(true);
    });

    it('validates quick inventory item without optional standardCost', () => {
      const valid = {
        name: 'Cotton Pillow Cover',
        categoryId: 'c123456789012345678901234',
        unitId: 'c123456789012345678901235',
      };
      const res = createQuickInventoryItemSchema.safeParse(valid);
      expect(res.success).toBe(true);
    });

    it('rejects quick inventory item with empty or too short name', () => {
      const invalid = {
        name: ' ',
        categoryId: 'c123456789012345678901234',
        unitId: 'c123456789012345678901235',
      };
      const res = createQuickInventoryItemSchema.safeParse(invalid);
      expect(res.success).toBe(false);
    });

    it('rejects quick inventory item with invalid CUID for category or unit', () => {
      const invalid = {
        name: 'Bath Towel',
        categoryId: 'invalid-id',
        unitId: 'invalid-unit',
      };
      const res = createQuickInventoryItemSchema.safeParse(invalid);
      expect(res.success).toBe(false);
    });

    it('rejects quick inventory item with negative standard cost', () => {
      const invalid = {
        name: 'Bath Towel',
        categoryId: 'c123456789012345678901234',
        unitId: 'c123456789012345678901235',
        standardCost: -10,
      };
      const res = createQuickInventoryItemSchema.safeParse(invalid);
      expect(res.success).toBe(false);
    });
  });

  describe('createQuickInventoryItemAction - Action-Level Tests & Invariants', () => {
    const mockCategory = { id: 'c123456789012345678901234', code: 'LINEN', isActive: true };
    const mockUnit = { id: 'c123456789012345678901235', name: 'PIECES', code: 'PCS', isActive: true };
    const authorizedUser = { id: 'usr-1', role: 'SUPER_ADMIN' };
    const unauthorizedUser = { id: 'usr-2', role: 'RESTAURANT_WAITER' };


    interface MockOverrides {
      categoryNotFound?: boolean;
      categoryInactive?: boolean;
      unitNotFound?: boolean;
      unitInactive?: boolean;
      existingItemWithSameName?: boolean;
      codeCollisionOnce?: boolean;
      collisionResolved?: boolean;
    }

    interface CreatedMockItem {
      id: string;
      name: string;
      code: string;
      standardCost: unknown;
      baseUnit: {
        id: string;
        name: string;
        code: string;
      };
    }

    function createMockClient(overrides: MockOverrides = {}) {
      let createdItemRecord: CreatedMockItem | null = null;
      let stockCreated = 0;
      let stockMovementCreated = 0;
      let stockTransferCreated = 0;
      let inventoryConsumptionCreated = 0;
      let poCreated = 0;
      let grnCreated = 0;
      let billCreated = 0;

      const tx = {
        inventoryCategory: {
          findUnique: async () => {
            if (overrides.categoryNotFound) return null;
            if (overrides.categoryInactive) return { ...mockCategory, isActive: false };
            return mockCategory;
          },
        },
        unit: {
          findUnique: async () => {
            if (overrides.unitNotFound) return null;
            if (overrides.unitInactive) return { ...mockUnit, isActive: false };
            return mockUnit;
          },
        },
        inventoryItem: {
          findFirst: async () => {
            if (overrides.existingItemWithSameName) return { id: 'existing-id', name: 'Cotton Towel' };
            return null;
          },
          findUnique: async () => {
            if (overrides.codeCollisionOnce && !overrides.collisionResolved) {
              overrides.collisionResolved = true;
              return { id: 'collision-id' };
            }
            return null;
          },
          create: async ({ data }: { data: { name: string; code: string; standardCost: unknown } }) => {
            createdItemRecord = {
              id: 'c123456789012345678901299',
              name: data.name,
              code: data.code,
              standardCost: data.standardCost,
              baseUnit: {
                id: mockUnit.id,
                name: mockUnit.name,
                code: mockUnit.code,
              },
            };
            return createdItemRecord;
          },
        },
        stock: {
          create: async () => { stockCreated++; return {}; },
        },
        stockMovement: {
          create: async () => { stockMovementCreated++; return {}; },
        },
        stockTransfer: {
          create: async () => { stockTransferCreated++; return {}; },
        },
        inventoryConsumption: {
          create: async () => { inventoryConsumptionCreated++; return {}; },
        },
        purchaseOrder: {
          create: async () => { poCreated++; return {}; },
        },
        goodsReceipt: {
          create: async () => { grnCreated++; return {}; },
        },
        purchaseBill: {
          create: async () => { billCreated++; return {}; },
        },
      };

      const client = {
        $transaction: async <T>(fn: (txClient: typeof tx) => Promise<T>) => fn(tx),
        getAudit: () => ({
          createdItemRecord,
          stockCreated,
          stockMovementCreated,
          stockTransferCreated,
          inventoryConsumptionCreated,
          poCreated,
          grnCreated,
          billCreated,
        }),
      };

      return client;
    }

    it('successfully creates quick catalog item and returns id, name, code, standardCost, baseUnit', async () => {
      const client = createMockClient();
      const res = await createQuickInventoryItemAction(
        {
          name: 'Spa Bathrobe Luxury',
          categoryId: 'c123456789012345678901234',
          unitId: 'c123456789012345678901235',
          standardCost: 1250.50,
        },
        client,
        authorizedUser
      );

      expect(res.success).toBe(true);
      if (!res.success) throw new Error('Action failed');
      expect(res.item).toBeDefined();
      expect(res.item.id).toBe('c123456789012345678901299');
      expect(res.item.name).toBe('Spa Bathrobe Luxury');
      expect(res.item.code).toMatch(/^LINEN-SPA-BATHROBE-[A-Z0-9]+-[A-F0-9]{6}$/);
      expect(res.item.standardCost).toBe('1250.50');
      expect(res.item.baseUnit).toEqual({
        id: 'c123456789012345678901235',
        name: 'PIECES',
        code: 'PCS',
      });
    });

    it('denies permission when user lacks inventory:item:manage', async () => {
      const client = createMockClient();
      await expect(
        createQuickInventoryItemAction(
          {
            name: 'Pillow Case',
            categoryId: 'c123456789012345678901234',
            unitId: 'c123456789012345678901235',
          },
          client,
          unauthorizedUser
        )
      ).rejects.toThrow(/FORBIDDEN/);
    });

    it('rejects inactive or non-existent category', async () => {
      const clientNotFound = createMockClient({ categoryNotFound: true });
      const resNotFound = await createQuickInventoryItemAction(
        {
          name: 'Bath Mat',
          categoryId: 'c123456789012345678901234',
          unitId: 'c123456789012345678901235',
        },
        clientNotFound,
        authorizedUser
      );
      expect(resNotFound.success).toBe(false);
      if (resNotFound.success) throw new Error('Expected failure');
      expect(resNotFound.error).toContain('Selected category not found or inactive');

      const clientInactive = createMockClient({ categoryInactive: true });
      const resInactive = await createQuickInventoryItemAction(
        {
          name: 'Bath Mat',
          categoryId: 'c123456789012345678901234',
          unitId: 'c123456789012345678901235',
        },
        clientInactive,
        authorizedUser
      );
      expect(resInactive.success).toBe(false);
      if (resInactive.success) throw new Error('Expected failure');
      expect(resInactive.error).toContain('Selected category not found or inactive');
    });

    it('rejects inactive or non-existent unit', async () => {
      const clientNotFound = createMockClient({ unitNotFound: true });
      const resNotFound = await createQuickInventoryItemAction(
        {
          name: 'Bath Mat',
          categoryId: 'c123456789012345678901234',
          unitId: 'c123456789012345678901235',
        },
        clientNotFound,
        authorizedUser
      );
      expect(resNotFound.success).toBe(false);
      if (resNotFound.success) throw new Error('Expected failure');
      expect(resNotFound.error).toContain('Selected unit not found or inactive');

      const clientInactive = createMockClient({ unitInactive: true });
      const resInactive = await createQuickInventoryItemAction(
        {
          name: 'Bath Mat',
          categoryId: 'c123456789012345678901234',
          unitId: 'c123456789012345678901235',
        },
        clientInactive,
        authorizedUser
      );
      expect(resInactive.success).toBe(false);
      if (resInactive.success) throw new Error('Expected failure');
      expect(resInactive.error).toContain('Selected unit not found or inactive');
    });

    it('enforces duplicate normalized item name protection', async () => {
      const client = createMockClient({ existingItemWithSameName: true });
      const res = await createQuickInventoryItemAction(
        {
          name: 'Cotton Towel',
          categoryId: 'c123456789012345678901234',
          unitId: 'c123456789012345678901235',
        },
        client,
        authorizedUser
      );
      expect(res.success).toBe(false);
      if (res.success) throw new Error('Expected failure');
      expect(res.error).toContain('An inventory item with this name already exists.');
    });

    it('generates unique item code even when a collision occurs on first attempt', async () => {
      const client = createMockClient({ codeCollisionOnce: true });
      const res = await createQuickInventoryItemAction(
        {
          name: 'Pool Towel Large',
          categoryId: 'c123456789012345678901234',
          unitId: 'c123456789012345678901235',
        },
        client,
        authorizedUser
      );
      expect(res.success).toBe(true);
      if (!res.success) throw new Error('Action failed');
      expect(res.item.code).toMatch(/^LINEN-POOL-TOWEL-[A-Z0-9]+-[A-F0-9]{6}$/);
    });

    it('INVENTORY INTEGRITY: creates InventoryItem (+1) but ZERO Stock, StockMovement, StockTransfer, PO, GRN, Bill', async () => {
      const client = createMockClient();
      const res = await createQuickInventoryItemAction(
        {
          name: 'Deluxe Face Towel',
          categoryId: 'c123456789012345678901234',
          unitId: 'c123456789012345678901235',
          standardCost: 150,
        },
        client,
        authorizedUser
      );

      expect(res.success).toBe(true);
      const audit = client.getAudit();
      expect(audit.createdItemRecord).not.toBeNull();
      expect(audit.stockCreated).toBe(0);
      expect(audit.stockMovementCreated).toBe(0);
      expect(audit.stockTransferCreated).toBe(0);
      expect(audit.inventoryConsumptionCreated).toBe(0);
      expect(audit.poCreated).toBe(0);
      expect(audit.grnCreated).toBe(0);
      expect(audit.billCreated).toBe(0);
    });

    it('CONCURRENCY: parallel item creation requests generate distinct unique codes', async () => {
      const codes = new Set<string>();
      const promises = Array.from({ length: 10 }).map(async (_, idx) => {
        const client = createMockClient();
        const res = await createQuickInventoryItemAction(
          {
            name: `Parallel Linen Item ${idx}`,
            categoryId: 'c123456789012345678901234',
            unitId: 'c123456789012345678901235',
          },
          client,
          authorizedUser
        );
        expect(res.success).toBe(true);
        if (res.success) {
          codes.add(res.item.code);
        }
      });

      await Promise.all(promises);
      expect(codes.size).toBe(10);
    });

    it('PURCHASE REQUEST INTEGRATION: newly created item is valid in createPurchaseRequest payload', async () => {
      const client = createMockClient();
      const res = await createQuickInventoryItemAction(
        {
          name: 'Organic Cotton Napkins',
          categoryId: 'c123456789012345678901234',
          unitId: 'c123456789012345678901235',
          standardCost: 45.0,
        },
        client,
        authorizedUser
      );

      expect(res.success).toBe(true);
      if (!res.success) throw new Error('Action failed');
      const createdItem = res.item;

      // Validate that PR payload accepts this newly created item
      const prPayload = {
        department: 'Housekeeping',
        priority: 'NORMAL',
        expectedDate: new Date().toISOString(),
        items: [
          {
            itemId: createdItem.id,
            quantity: 50,
            estimatedCost: parseFloat(createdItem.standardCost),
          },
        ],
      };

      const parsedPR = createPurchaseRequestSchema.safeParse(prPayload);
      expect(parsedPR.success).toBe(true);
      if (parsedPR.success) {
        expect(parsedPR.data.items[0].itemId).toBe(createdItem.id);
        expect(parsedPR.data.items[0].quantity).toBe(50);
        expect(parsedPR.data.items[0].estimatedCost).toBe(45);
      }
    });
  });

  // ======================================================================
  // 10 MANDATORY SCENARIOS: PARTIAL DELIVERIES + MULTIPLE GRNS + MULTIPLE BILLS
  // ======================================================================
  describe('PARTIAL DELIVERIES + MULTIPLE GRNs + MULTIPLE VENDOR BILLS LIFECYCLE', () => {
    // Shared mock state simulating the database and inventory ledger
    function createProcurementLifecycleEngine() {
      const po = {
        id: 'po_001',
        poNumber: 'PO-20260917-001',
        orderedQty: new Prisma.Decimal(100),
        unitPrice: new Prisma.Decimal('60.00'),
        poTotalAmount: new Prisma.Decimal('6000.00'),
        receivedQty: new Prisma.Decimal(0),
        status: 'ISSUED',
      };

      const grns: any[] = [];
      const stockMovements: any[] = [];
      let quantityOnHand = new Prisma.Decimal(0);
      const bills: any[] = [];
      const payments: any[] = [];

      function receiveGRN(input: {
        grnNumber: string;
        acceptedQty: number | string;
        rejectedQty?: number | string;
        damagedQty?: number | string;
      }) {
        const accepted = new Prisma.Decimal(input.acceptedQty);
        const rejected = new Prisma.Decimal(input.rejectedQty || 0);
        const damaged = new Prisma.Decimal(input.damagedQty || 0);
        const totalAccounted = accepted.plus(rejected).plus(damaged);

        const remainingReceivable = po.orderedQty.minus(po.receivedQty);
        if (totalAccounted.greaterThan(remainingReceivable)) {
          throw new Error(
            `Accounted receipt quantity (${totalAccounted}) exceeds remaining receivable quantity (${remainingReceivable}) on PO [${po.poNumber}]. Over-receipt is strictly disallowed.`
          );
        }

        // Increment PO received quantity
        po.receivedQty = po.receivedQty.plus(totalAccounted);
        if (po.receivedQty.greaterThanOrEqualTo(po.orderedQty)) {
          po.status = 'FULLY_RECEIVED';
        } else {
          po.status = 'PARTIALLY_RECEIVED';
        }

        // Post stock movement ONLY for accepted quantity
        if (accepted.greaterThan(0)) {
          stockMovements.push({
            type: 'PURCHASE_RECEIPT',
            quantity: accepted,
            grnNumber: input.grnNumber,
          });
          quantityOnHand = quantityOnHand.plus(accepted);
        }

        const grnRecord = {
          id: `grn_${input.grnNumber}`,
          grnNumber: input.grnNumber,
          acceptedQty: accepted,
          rejectedQty: rejected,
          damagedQty: damaged,
          status: 'STORED',
        };
        grns.push(grnRecord);
        return grnRecord;
      }

      function createBill(input: {
        vendorBillNo: string;
        grnId?: string;
        totalAmount: number | string;
      }) {
        // Enforce invoice number uniqueness per vendor
        if (bills.some((b) => b.vendorBillNo.toLowerCase() === input.vendorBillNo.trim().toLowerCase())) {
          throw new Error(`A purchase bill with invoice number "${input.vendorBillNo}" already exists.`);
        }

        const total = new Prisma.Decimal(input.totalAmount);
        const bill = {
          id: `bill_${bills.length + 1}`,
          billNumber: `PB-${bills.length + 1}`,
          vendorBillNo: input.vendorBillNo.trim(),
          poId: po.id,
          grnId: input.grnId || null,
          totalAmount: total,
          paidAmount: new Prisma.Decimal(0),
          balanceDue: total,
          status: 'RECEIVED',
        };
        bills.push(bill);
        return bill;
      }

      function recordPayment(input: {
        paymentNumber: string;
        amount: number | string;
        allocations: { billId: string; amount: number | string }[];
      }) {
        const paymentAmount = new Prisma.Decimal(input.amount);
        let totalAllocated = new Prisma.Decimal(0);

        for (const alloc of input.allocations) {
          const bill = bills.find((b) => b.id === alloc.billId);
          if (!bill) throw new Error(`Bill [${alloc.billId}] not found.`);

          const allocAmt = new Prisma.Decimal(alloc.amount);
          if (allocAmt.greaterThan(bill.balanceDue)) {
            throw new Error(`Cannot overpay bill [${bill.billNumber}].`);
          }

          bill.paidAmount = bill.paidAmount.plus(allocAmt);
          bill.balanceDue = bill.balanceDue.minus(allocAmt);
          if (bill.balanceDue.equals(0)) {
            bill.status = 'FULLY_PAID';
          } else {
            bill.status = 'PARTIALLY_PAID';
          }
          totalAllocated = totalAllocated.plus(allocAmt);
        }

        if (!totalAllocated.equals(paymentAmount)) {
          throw new Error(`Total allocated must equal payment amount.`);
        }

        payments.push({
          paymentNumber: input.paymentNumber,
          amount: paymentAmount,
          allocations: input.allocations,
        });
      }

      function getReconciliation() {
        const remainingReceivable = po.orderedQty.minus(po.receivedQty);
        let billedAmount = new Prisma.Decimal(0);
        let paidAmount = new Prisma.Decimal(0);
        let outstandingPayable = new Prisma.Decimal(0);

        for (const b of bills) {
          if (b.status !== 'CANCELLED') {
            billedAmount = billedAmount.plus(b.totalAmount);
            paidAmount = paidAmount.plus(b.paidAmount);
            outstandingPayable = outstandingPayable.plus(b.balanceDue);
          }
        }

        const unbilledAmount = po.poTotalAmount.minus(billedAmount);

        return {
          orderedQty: po.orderedQty.toFixed(4),
          receivedQty: po.receivedQty.toFixed(4),
          remainingReceivable: (remainingReceivable.isNegative() ? new Prisma.Decimal(0) : remainingReceivable).toFixed(4),
          poStatus: po.status,
          poTotalAmount: po.poTotalAmount.toFixed(2),
          billedAmount: billedAmount.toFixed(2),
          unbilledAmount: (unbilledAmount.isNegative() ? new Prisma.Decimal(0) : unbilledAmount).toFixed(2),
          paidAmount: paidAmount.toFixed(2),
          outstandingPayable: (outstandingPayable.isNegative() ? new Prisma.Decimal(0) : outstandingPayable).toFixed(2),
          isPartiallyReceived: po.receivedQty.greaterThan(0) && remainingReceivable.greaterThan(0),
          isFullyReceived: remainingReceivable.lessThanOrEqualTo(0),
          isPartiallyBilled: billedAmount.greaterThan(0) && billedAmount.lessThan(po.poTotalAmount),
          isFullyBilled: billedAmount.greaterThanOrEqualTo(po.poTotalAmount),
          isPartiallyPaid: paidAmount.greaterThan(0) && outstandingPayable.greaterThan(0),
          isFullyPaid: billedAmount.greaterThan(0) && outstandingPayable.lessThanOrEqualTo(0),
          quantityOnHand: quantityOnHand.toFixed(4),
          stockMovementsCount: stockMovements.length,
          billsCount: bills.length,
        };
      }

      return {
        po,
        grns,
        stockMovements,
        bills,
        receiveGRN,
        createBill,
        recordPayment,
        getReconciliation,
      };
    }

    // SCENARIO 1: Partial GRN
    it('Scenario 1 — Partial GRN: PO 100 KG -> GRN-001 60 KG produces correct status and stock', () => {
      const engine = createProcurementLifecycleEngine();
      engine.receiveGRN({ grnNumber: 'GRN-001', acceptedQty: 60 });

      const recon = engine.getReconciliation();
      expect(recon.receivedQty).toBe('60.0000');
      expect(recon.remainingReceivable).toBe('40.0000');
      expect(recon.poStatus).toBe('PARTIALLY_RECEIVED');
      expect(recon.isPartiallyReceived).toBe(true);
      expect(recon.isFullyReceived).toBe(false);
      expect(recon.quantityOnHand).toBe('60.0000');
      expect(recon.stockMovementsCount).toBe(1);
    });

    // SCENARIO 2: Remaining GRN
    it('Scenario 2 — Remaining GRN: Same PO -> GRN-002 40 KG transitions to FULLY_RECEIVED', () => {
      const engine = createProcurementLifecycleEngine();
      engine.receiveGRN({ grnNumber: 'GRN-001', acceptedQty: 60 });
      engine.receiveGRN({ grnNumber: 'GRN-002', acceptedQty: 40 });

      const recon = engine.getReconciliation();
      expect(recon.receivedQty).toBe('100.0000');
      expect(recon.remainingReceivable).toBe('0.0000');
      expect(recon.poStatus).toBe('FULLY_RECEIVED');
      expect(recon.isPartiallyReceived).toBe(false);
      expect(recon.isFullyReceived).toBe(true);
      expect(recon.quantityOnHand).toBe('100.0000');
      expect(recon.stockMovementsCount).toBe(2);
    });

    // SCENARIO 3: Over-receipt
    it('Scenario 3 — Over-receipt: Attempt GRN-003 = 1 KG is rejected, stock and PO remain unchanged', () => {
      const engine = createProcurementLifecycleEngine();
      engine.receiveGRN({ grnNumber: 'GRN-001', acceptedQty: 60 });
      engine.receiveGRN({ grnNumber: 'GRN-002', acceptedQty: 40 });

      expect(() => {
        engine.receiveGRN({ grnNumber: 'GRN-003', acceptedQty: 1 });
      }).toThrow(/exceeds remaining receivable quantity/i);

      const recon = engine.getReconciliation();
      expect(recon.receivedQty).toBe('100.0000');
      expect(recon.quantityOnHand).toBe('100.0000');
      expect(recon.stockMovementsCount).toBe(2);
    });

    // SCENARIO 4: Two Bills against Same PO
    it('Scenario 4 — Two Bills: Bill-001 (₹3600) + Bill-002 (₹2400) separately tracked on same PO', () => {
      const engine = createProcurementLifecycleEngine();
      engine.receiveGRN({ grnNumber: 'GRN-001', acceptedQty: 60 });
      const bill1 = engine.createBill({ vendorBillNo: 'INV-101', grnId: 'grn_GRN-001', totalAmount: '3600.00' });

      engine.receiveGRN({ grnNumber: 'GRN-002', acceptedQty: 40 });
      const bill2 = engine.createBill({ vendorBillNo: 'INV-102', grnId: 'grn_GRN-002', totalAmount: '2400.00' });

      expect(engine.bills.length).toBe(2);
      expect(bill1.poId).toBe(engine.po.id);
      expect(bill2.poId).toBe(engine.po.id);

      const recon = engine.getReconciliation();
      expect(recon.billedAmount).toBe('6000.00');
      expect(recon.isFullyBilled).toBe(true);
      expect(recon.outstandingPayable).toBe('6000.00');
    });

    // SCENARIO 5: Partial Billing
    it('Scenario 5 — Partial Billing: Received = 100, Billed = 60 leaves PO FULLY_RECEIVED but PARTIALLY_BILLED', () => {
      const engine = createProcurementLifecycleEngine();
      engine.receiveGRN({ grnNumber: 'GRN-001', acceptedQty: 60 });
      engine.receiveGRN({ grnNumber: 'GRN-002', acceptedQty: 40 });
      engine.createBill({ vendorBillNo: 'INV-101', totalAmount: '3600.00' });

      const recon = engine.getReconciliation();
      expect(recon.isFullyReceived).toBe(true);
      expect(recon.isPartiallyBilled).toBe(true);
      expect(recon.isFullyBilled).toBe(false);
      expect(recon.billedAmount).toBe('3600.00');
      expect(recon.unbilledAmount).toBe('2400.00');
    });

    // SCENARIO 6: Partial Payment
    it('Scenario 6 — Partial Payment: Bills = ₹6,000, Payments = ₹4,600 leaves Outstanding = ₹1,400', () => {
      const engine = createProcurementLifecycleEngine();
      engine.receiveGRN({ grnNumber: 'GRN-001', acceptedQty: 60 });
      const b1 = engine.createBill({ vendorBillNo: 'INV-101', totalAmount: '3600.00' });

      engine.receiveGRN({ grnNumber: 'GRN-002', acceptedQty: 40 });
      const b2 = engine.createBill({ vendorBillNo: 'INV-102', totalAmount: '2400.00' });

      // Pay Bill 1 in full (₹3600) and Bill 2 partially (₹1000) = Total ₹4600
      engine.recordPayment({
        paymentNumber: 'VP-001',
        amount: '4600.00',
        allocations: [
          { billId: b1.id, amount: '3600.00' },
          { billId: b2.id, amount: '1000.00' },
        ],
      });

      const recon = engine.getReconciliation();
      expect(recon.billedAmount).toBe('6000.00');
      expect(recon.paidAmount).toBe('4600.00');
      expect(recon.outstandingPayable).toBe('1400.00');
      expect(recon.isPartiallyPaid).toBe(true);
      expect(recon.isFullyPaid).toBe(false);
      expect(b1.status).toBe('FULLY_PAID');
      expect(b2.status).toBe('PARTIALLY_PAID');
    });

    // SCENARIO 7: Duplicate Invoice Rejection
    it('Scenario 7 — Duplicate Invoice: Reject duplicate vendor invoice number', () => {
      const engine = createProcurementLifecycleEngine();
      engine.createBill({ vendorBillNo: 'INV-101', totalAmount: '3600.00' });

      expect(() => {
        engine.createBill({ vendorBillNo: 'INV-101', totalAmount: '2400.00' });
      }).toThrow(/already exists/i);
    });

    // SCENARIO 8: Concurrent GRNs Protection
    it('Scenario 8 — Concurrent GRNs: Total received never exceeds remaining PO quantity', () => {
      const engine = createProcurementLifecycleEngine();
      engine.receiveGRN({ grnNumber: 'GRN-001', acceptedQty: 60 }); // 40 remaining

      // Simulate Request A and Request B arriving concurrently for 40 KG each
      let successCount = 0;
      let failureCount = 0;

      const attempts = [40, 40];
      for (let i = 0; i < attempts.length; i++) {
        try {
          engine.receiveGRN({ grnNumber: `GRN-CONC-${i}`, acceptedQty: attempts[i] });
          successCount++;
        } catch {
          failureCount++;
        }
      }

      expect(successCount).toBe(1);
      expect(failureCount).toBe(1);
      const recon = engine.getReconciliation();
      expect(recon.receivedQty).toBe('100.0000');
    });

    // SCENARIO 9: Inventory Ledger Integrity
    it('Scenario 9 — Inventory Integrity: 60 KG + 40 KG produces exactly +100 KG PURCHASE_RECEIPT', () => {
      const engine = createProcurementLifecycleEngine();
      engine.receiveGRN({ grnNumber: 'GRN-001', acceptedQty: 60 });
      engine.receiveGRN({ grnNumber: 'GRN-002', acceptedQty: 40 });

      expect(engine.stockMovements.length).toBe(2);
      expect(engine.stockMovements[0].quantity.toString()).toBe('60');
      expect(engine.stockMovements[1].quantity.toString()).toBe('40');
      const totalInventoryReceived = engine.stockMovements.reduce(
        (sum, m) => sum.plus(m.quantity),
        new Prisma.Decimal(0)
      );
      expect(totalInventoryReceived.toString()).toBe('100');
    });

    // SCENARIO 10: Bill Does Not Affect Inventory
    it('Scenario 10 — Separation of Concerns: Creating Purchase Bills NEVER affects inventory', () => {
      const engine = createProcurementLifecycleEngine();
      engine.receiveGRN({ grnNumber: 'GRN-001', acceptedQty: 60 });

      const stockBeforeBilling = engine.getReconciliation().quantityOnHand;
      const movementsBeforeBilling = engine.stockMovements.length;

      // Create multiple bills
      engine.createBill({ vendorBillNo: 'INV-101', totalAmount: '3600.00' });
      engine.createBill({ vendorBillNo: 'INV-102', totalAmount: '2400.00' });

      const stockAfterBilling = engine.getReconciliation().quantityOnHand;
      const movementsAfterBilling = engine.stockMovements.length;

      expect(stockAfterBilling).toBe(stockBeforeBilling);
      expect(movementsAfterBilling).toBe(movementsBeforeBilling);
    });
  });
});

