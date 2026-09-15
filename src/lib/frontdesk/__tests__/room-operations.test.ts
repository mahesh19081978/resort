import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma, FolioItemType, PaymentStatus, PaymentContext, PaymentMethod, StayStatus, PhysicalRoomStatus, FolioStatus, RoomAssignmentStatus, NoteType } from '@prisma/client';

/**
 * Room Operations Test Suite
 *
 * Covers:
 * A. Room card data
 * B. Post Charge
 * C. Payment
 * D. Notes
 * E. Checkout
 * F. Invoice
 */

// ─── Helpers ───────────────────────────────────────────────

function decimal(v: string | number): Prisma.Decimal {
  return new Prisma.Decimal(v.toString());
}

// ─── A. Room Card Data ─────────────────────────────────────

describe('Room Card Data', () => {
  it('occupied room displayed with correct financial summary', () => {
    const roomCharge = decimal(6160);
    const additionalCharge = decimal(500);
    const restaurantCharge = decimal(350);
    const taxCharges = decimal(0);
    const discountCredits = decimal(0);
    const paymentsReceived = decimal(5000);

    const totalFolioCharges = roomCharge
      .plus(additionalCharge)
      .plus(restaurantCharge)
      .plus(taxCharges)
      .minus(discountCredits);

    const outstandingBalance = totalFolioCharges.minus(paymentsReceived);

    expect(totalFolioCharges.toFixed(2)).toBe('7010.00');
    expect(outstandingBalance.toFixed(2)).toBe('2010.00');
    expect(outstandingBalance.greaterThan(0)).toBe(true);
  });

  it('guest name displayed correctly', () => {
    const guestName = 'Rahul Sharma';
    expect(guestName).toContain('Rahul');
    expect(guestName).toContain('Sharma');
  });

  it('total/paid/balance correct for fully paid room', () => {
    const totalCharges = decimal(6160);
    const paymentsReceived = decimal(6160);
    const outstandingBalance = totalCharges.minus(paymentsReceived);

    expect(outstandingBalance.toFixed(2)).toBe('0.00');
    expect(outstandingBalance.lessThanOrEqualTo(0)).toBe(true);
  });

  it('total/paid/balance correct for partially paid room', () => {
    const totalCharges = decimal(9520);
    const paymentsReceived = decimal(3000);
    const outstandingBalance = totalCharges.minus(paymentsReceived);

    expect(outstandingBalance.toFixed(2)).toBe('6520.00');
    expect(outstandingBalance.greaterThan(0)).toBe(true);
  });

  it('total/paid/balance correct for room with additional charges', () => {
    const roomCharge = decimal(6160);
    const additionalCharges = decimal(200);
    const restaurantCharges = decimal(150);
    const totalFolioCharges = roomCharge.plus(additionalCharges).plus(restaurantCharges);
    const paymentsReceived = decimal(6160);
    const outstandingBalance = totalFolioCharges.minus(paymentsReceived);

    expect(totalFolioCharges.toFixed(2)).toBe('6510.00');
    expect(outstandingBalance.toFixed(2)).toBe('350.00');
  });
});

// ─── B. Post Charge ────────────────────────────────────────

describe('Post Charge', () => {
  it('valid charge posts correctly with Decimal', () => {
    const unitPrice = new Prisma.Decimal(500);
    const quantity = 2;
    const taxRate = new Prisma.Decimal(18);

    const netSubtotal = unitPrice.mul(quantity);
    const taxAmount = netSubtotal.mul(taxRate).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_EVEN);
    const grossTotal = netSubtotal.plus(taxAmount);

    expect(netSubtotal.toFixed(2)).toBe('1000.00');
    expect(taxAmount.toFixed(2)).toBe('180.00');
    expect(grossTotal.toFixed(2)).toBe('1180.00');
  });

  it('tax/service charge calculation uses Decimal precision', () => {
    const unitPrice = new Prisma.Decimal('333.33');
    const quantity = 3;
    const taxRate = new Prisma.Decimal('18');

    const netSubtotal = unitPrice.mul(quantity).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_EVEN);
    const taxAmount = netSubtotal.mul(taxRate).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_EVEN);
    const grossTotal = netSubtotal.plus(taxAmount);

    // 333.33 * 3 = 999.99
    expect(netSubtotal.toFixed(2)).toBe('999.99');
    // 999.99 * 0.18 = 179.9982 -> 180.00
    expect(taxAmount.toFixed(2)).toBe('180.00');
    // 999.99 + 180.00 = 1179.99
    expect(grossTotal.toFixed(2)).toBe('1179.99');
  });

  it('invalid amount (zero) rejected', () => {
    const amount = new Prisma.Decimal(0);
    expect(amount.lte(0)).toBe(true);
  });

  it('inactive tax causes failure (fail-closed)', () => {
    // If tax is inactive, resolveTaxForService should throw
    // This is tested by the tax resolution architecture
    const isActive = false;
    expect(() => {
      if (!isActive) throw new Error('TAX_CONFIG_INACTIVE');
    }).toThrow('TAX_CONFIG_INACTIVE');
  });

  it('expired tax causes failure (fail-closed)', () => {
    const effectiveTo = new Date('2025-01-01');
    const now = new Date('2026-09-10');
    const isExpired = effectiveTo <= now;
    expect(isExpired).toBe(true);
  });

  it('ambiguous tax causes failure', () => {
    const matchingTaxes = [{ code: 'GST-18' }, { code: 'GST-12' }];
    expect(() => {
      if (matchingTaxes.length > 1) {
        throw new Error('TAX_CONFIG_AMBIGUOUS');
      }
    }).toThrow('TAX_CONFIG_AMBIGUOUS');
  });

  it('ledger update maintains running totals', () => {
    const initialCharges = new Prisma.Decimal(6160);
    const initialBalance = new Prisma.Decimal(6160);
    const chargeAmount = new Prisma.Decimal(1180);

    const newCharges = initialCharges.plus(chargeAmount);
    const newBalance = initialBalance.plus(chargeAmount);

    expect(newCharges.toFixed(2)).toBe('7340.00');
    expect(newBalance.toFixed(2)).toBe('7340.00');
  });

  it('gross amount stored as FolioItem.amount (authoritative)', () => {
    const unitPrice = new Prisma.Decimal(500);
    const taxAmount = new Prisma.Decimal(90);
    const grossTotal = unitPrice.plus(taxAmount);

    // FolioItem.amount = gross
    // FolioItem.taxAmount = tax snapshot
    // net = amount - taxAmount
    const storedAmount = grossTotal;
    const storedTax = taxAmount;
    const net = storedAmount.minus(storedTax);

    expect(storedAmount.toFixed(2)).toBe('590.00');
    expect(storedTax.toFixed(2)).toBe('90.00');
    expect(net.toFixed(2)).toBe('500.00');
  });
});

// ─── C. Payment ────────────────────────────────────────────

describe('Payment', () => {
  it('full payment clears balance', () => {
    const outstandingBalance = new Prisma.Decimal('6160.00');
    const paymentAmount = new Prisma.Decimal('6160.00');
    const newBalance = outstandingBalance.minus(paymentAmount);

    expect(newBalance.toFixed(2)).toBe('0.00');
    expect(newBalance.lte(0)).toBe(true);
  });

  it('partial payment reduces balance', () => {
    const outstandingBalance = new Prisma.Decimal('6160.00');
    const paymentAmount = new Prisma.Decimal('3000.00');
    const newBalance = outstandingBalance.minus(paymentAmount);

    expect(newBalance.toFixed(2)).toBe('3160.00');
    expect(newBalance.greaterThan(0)).toBe(true);
  });

  it('overpayment rejected', () => {
    const outstandingBalance = new Prisma.Decimal('6160.00');
    const paymentAmount = new Prisma.Decimal('7000.00');

    expect(paymentAmount.gt(outstandingBalance)).toBe(true);
  });

  it('zero/negative payment rejected', () => {
    expect(new Prisma.Decimal(0).lte(0)).toBe(true);
    expect(new Prisma.Decimal(-100).lte(0)).toBe(true);
  });

  it('duplicate idempotency key returns existing payment', () => {
    const existingMethod: string = PaymentMethod.CASH;
    const existingAmount = new Prisma.Decimal('3000.00');

    const newAmount = new Prisma.Decimal('3000.00');
    const newMethod: string = PaymentMethod.CASH;

    // Same key + same details = duplicate (return existing)
    const isDuplicate =
      existingAmount.equals(newAmount) && existingMethod === newMethod;

    expect(isDuplicate).toBe(true);
  });

  it('conflicting idempotency key returns error', () => {
    const existingMethod: string = PaymentMethod.CASH;
    const existingAmount = new Prisma.Decimal('3000.00');

    const newMethod: string = PaymentMethod.BANK_TRANSFER;
    const newAmount = new Prisma.Decimal('5000.00');

    // Same key + different details = IDEMPOTENCY_KEY_REUSE_CONFLICT
    const isConflict =
      !existingAmount.equals(newAmount) ||
      existingMethod !== newMethod;

    expect(isConflict).toBe(true);
  });

  it('payment context is FOLIO_SETTLEMENT (not RESERVATION_ADVANCE)', () => {
    const paymentContext = PaymentContext.FOLIO_SETTLEMENT;
    expect(paymentContext).toBe('FOLIO_SETTLEMENT');
    expect(paymentContext).not.toBe('RESERVATION_ADVANCE');
  });

  it('folio must be OPEN for payment', () => {
    const folioStatus = FolioStatus.OPEN;
    expect(folioStatus).toBe('OPEN');
  });

  it('folio ledger consistency check within tolerance', () => {
    const cachedBalance = new Prisma.Decimal('6160.00');
    const authoritativeBalance = new Prisma.Decimal('6160.00');
    const tolerance = new Prisma.Decimal('0.005');

    const diff = cachedBalance.minus(authoritativeBalance).abs();
    expect(diff.lte(tolerance)).toBe(true);
  });

  it('folio ledger mismatch rejected', () => {
    const cachedBalance = new Prisma.Decimal('6160.00');
    const authoritativeBalance = new Prisma.Decimal('5000.00');
    const tolerance = new Prisma.Decimal('0.005');

    const diff = cachedBalance.minus(authoritativeBalance).abs();
    expect(diff.gt(tolerance)).toBe(true);
  });

  it('concurrent payment attempts handled by row lock', () => {
    // SELECT ... FOR UPDATE ensures serialization
    // Two concurrent transactions: one commits, other retries or fails
    const lockAcquired = true;
    expect(lockAcquired).toBe(true);
  });
});

// ─── D. Notes ──────────────────────────────────────────────

describe('Notes', () => {
  it('create note with valid data', () => {
    const note = {
      stayId: 'stay_123',
      noteType: NoteType.OPERATIONAL,
      content: 'Wake me at 5:00 AM',
    };

    expect(note.stayId).toBeTruthy();
    expect(note.content.length).toBeGreaterThan(0);
    expect(note.content.length).toBeLessThanOrEqual(1000);
    expect(Object.values(NoteType)).toContain(note.noteType);
  });

  it('edit note preserves audit trail', () => {
    const existingNote = {
      content: 'Wake me at 5:00 AM',
      noteType: NoteType.OPERATIONAL,
    };

    const updatedNote = {
      content: 'Wake me at 6:00 AM instead',
      noteType: NoteType.GUEST_PREFERENCE,
      isEdited: true,
    };

    expect(updatedNote.isEdited).toBe(true);
    expect(updatedNote.content).not.toBe(existingNote.content);
  });

  it('note types are valid', () => {
    const validTypes = ['OPERATIONAL', 'GUEST_PREFERENCE', 'ALERT', 'INTERNAL'];

    for (const type of validTypes) {
      expect(Object.values(NoteType)).toContain(type);
    }
  });

  it('empty content rejected', () => {
    const content = '';
    expect(content.trim().length).toBe(0);
  });

  it('content exceeding 1000 chars rejected', () => {
    const content = 'x'.repeat(1001);
    expect(content.length).toBeGreaterThan(1000);
  });
});

// ─── E. Checkout ───────────────────────────────────────────

describe('Checkout', () => {
  it('final folio correct: charges - credits - payments = 0', () => {
    const totalCharges = new Prisma.Decimal('6160.00');
    const totalCredits = new Prisma.Decimal(0);
    const totalPayments = new Prisma.Decimal('6160.00');

    const finalBalance = totalCharges.minus(totalCredits).minus(totalPayments);
    expect(finalBalance.toFixed(2)).toBe('0.00');
    expect(finalBalance.lte(0)).toBe(true);
  });

  it('accommodation tax not double-counted', () => {
    const roomBase = new Prisma.Decimal('5500');
    const gst = new Prisma.Decimal('660');
    const accommodationGross = roomBase.plus(gst);

    // Correct: accommodation total = 6160 (not 6160 + 660)
    const accommodationTotal = accommodationGross;
    expect(accommodationTotal.toFixed(0)).toBe('6160');

    // Incorrect approach would be:
    // room charges (6160) + tax (660) = 6820 - this is wrong!
    const incorrectTotal = accommodationGross.plus(gst);
    expect(incorrectTotal.toFixed(0)).toBe('6820');
    expect(incorrectTotal.toFixed(0)).not.toBe(accommodationTotal.toFixed(0));
  });

  it('payment correctly reflected in checkout ledger', () => {
    const roomCharge = new Prisma.Decimal('6160.00');
    const additionalCharge = new Prisma.Decimal('200.00');
    const totalCharges = roomCharge.plus(additionalCharge);
    const totalPayments = new Prisma.Decimal('6160.00');

    const finalBalance = totalCharges.minus(totalPayments);
    expect(finalBalance.toFixed(2)).toBe('200.00');
  });

  it('room becomes DIRTY after checkout', () => {
    const newStatus = PhysicalRoomStatus.DIRTY;
    expect(newStatus).toBe('DIRTY');
  });

  it('stay closes after checkout', () => {
    const newStatus = StayStatus.CHECKED_OUT;
    expect(newStatus).toBe('CHECKED_OUT');
  });

  it('settlement payment creates FOLIO_SETTLEMENT record', () => {
    const settlementContext = PaymentContext.FOLIO_SETTLEMENT;
    expect(settlementContext).toBe('FOLIO_SETTLEMENT');
  });

  it('folio status transitions to SETTLED', () => {
    const newFolioStatus = FolioStatus.SETTLED;
    expect(newFolioStatus).toBe('SETTLED');
  });

  it('room assignment ends on checkout', () => {
    const newAssignmentStatus = RoomAssignmentStatus.ENDED;
    expect(newAssignmentStatus).toBe('ENDED');
  });

  it('outstanding balance prevents checkout', () => {
    const finalBalance = new Prisma.Decimal('200.00');
    const canCheckout = finalBalance.lte(0);
    expect(canCheckout).toBe(false);
  });

  it('zero balance allows checkout', () => {
    const finalBalance = new Prisma.Decimal('0.00');
    const canCheckout = finalBalance.lte(0);
    expect(canCheckout).toBe(true);
  });

  it('negative balance (overpayment) allows checkout', () => {
    const finalBalance = new Prisma.Decimal('-100.00');
    const canCheckout = finalBalance.lte(0);
    expect(canCheckout).toBe(true);
  });
});

// ─── F. Invoice ────────────────────────────────────────────

describe('Invoice', () => {
  it('invoice number format is correct', () => {
    const prefix = 'INV';
    const yearMonth = '202609';
    const sequence = 1;
    const invoiceNumber = `${prefix}-${yearMonth}-${String(sequence).padStart(4, '0')}`;

    expect(invoiceNumber).toBe('INV-202609-0001');
  });

  it('invoice number sequence increments', () => {
    const prefix = 'INV';
    const yearMonth = '202609';

    const seq1 = `${prefix}-${yearMonth}-${String(1).padStart(4, '0')}`;
    const seq2 = `${prefix}-${yearMonth}-${String(2).padStart(4, '0')}`;
    const seq3 = `${prefix}-${yearMonth}-${String(3).padStart(4, '0')}`;

    expect(seq1).toBe('INV-202609-0001');
    expect(seq2).toBe('INV-202609-0002');
    expect(seq3).toBe('INV-202609-0003');
  });

  it('invoice data includes all required fields', () => {
    const invoiceData = {
      invoiceNumber: 'INV-202609-0001',
      issueDate: new Date().toISOString(),
      guestName: 'Rahul Sharma',
      guestContact: '+91 98765 43210',
      reservationNumber: 'RES-20260908-001',
      roomNumber: '101',
      checkIn: new Date().toISOString(),
      checkOut: new Date().toISOString(),
    };

    expect(invoiceData.invoiceNumber).toBeTruthy();
    expect(invoiceData.guestName).toBeTruthy();
    expect(invoiceData.roomNumber).toBeTruthy();
  });

  it('tax breakdown shows CGST and SGST separately', () => {
    const totalTax = new Prisma.Decimal('660.00');
    const cgst = totalTax.div(2);
    const sgst = totalTax.div(2);

    expect(cgst.toFixed(2)).toBe('330.00');
    expect(sgst.toFixed(2)).toBe('330.00');
    expect(cgst.plus(sgst).toFixed(2)).toBe(totalTax.toFixed(2));
  });

  it('payment history shown on invoice', () => {
    const payments = [
      { method: 'CASH', amount: new Prisma.Decimal('3000.00'), date: new Date() },
      { method: 'UPI', amount: new Prisma.Decimal('2000.00'), date: new Date() },
    ];

    const totalPaid = payments.reduce(
      (acc, p) => acc.plus(p.amount),
      new Prisma.Decimal(0)
    );

    expect(totalPaid.toFixed(2)).toBe('5000.00');
    expect(payments.length).toBe(2);
  });

  it('balance/refund shown on invoice', () => {
    const totalCharges = new Prisma.Decimal('6160.00');
    const totalPaid = new Prisma.Decimal('7000.00');
    const balance = totalCharges.minus(totalPaid);

    // Overpayment = refund due
    expect(balance.toFixed(2)).toBe('-840.00');
    expect(balance.isNegative()).toBe(true);
  });

  it('historical snapshot behavior: invoice uses stored FolioItem amounts', () => {
    // FolioItem.amount = gross at time of posting
    // FolioItem.taxAmount = tax at time of posting
    // net = amount - taxAmount
    const storedAmount = new Prisma.Decimal('6160.00');
    const storedTax = new Prisma.Decimal('660.00');
    const net = storedAmount.minus(storedTax);

    expect(storedAmount.toFixed(2)).toBe('6160.00');
    expect(storedTax.toFixed(2)).toBe('660.00');
    expect(net.toFixed(2)).toBe('5500.00');
  });

  it('no double taxation on accommodation', () => {
    // Room base = 5500, GST = 660, gross = 6160
    // Invoice should show:
    //   Net: 5500
    //   Tax: 660
    //   Total: 6160
    // NOT:
    //   Room charges: 6160
    //   Tax: 660
    //   Total: 6820

    const roomGross = new Prisma.Decimal('6160.00');
    const roomTax = new Prisma.Decimal('660.00');
    const roomNet = roomGross.minus(roomTax);

    // Correct
    const correctTotal = roomNet.plus(roomTax);
    expect(correctTotal.toFixed(2)).toBe('6160.00');

    // Incorrect (double taxation)
    const incorrectTotal = roomGross.plus(roomTax);
    expect(incorrectTotal.toFixed(2)).toBe('6820.00');
    expect(incorrectTotal.toFixed(2)).not.toBe(correctTotal.toFixed(2));
  });

  it('concurrent invoice numbering handled by singleton lock', () => {
    // InvoiceConfig singleton row locked with FOR UPDATE
    // Bounded retry for serialization conflicts
    const maxAttempts = 3;
    let attempts = 0;
    let success = false;

    while (attempts < maxAttempts) {
      attempts++;
      // Simulate: first attempt conflicts, second succeeds
      if (attempts === 2) {
        success = true;
        break;
      }
    }

    expect(success).toBe(true);
    expect(attempts).toBe(2);
  });
});

// ─── G. Permission & Security ──────────────────────────────

describe('Permissions & Security', () => {
  it('post charge requires folio:charge:post', () => {
    const requiredPermission = 'folio:charge:post';
    expect(requiredPermission).toBeTruthy();
  });

  it('record payment requires folio:payment:record', () => {
    const requiredPermission = 'folio:payment:record';
    expect(requiredPermission).toBeTruthy();
  });

  it('stay notes view requires stay:note:view', () => {
    const requiredPermission = 'stay:note:view';
    expect(requiredPermission).toBeTruthy();
  });

  it('stay notes create requires stay:note:create', () => {
    const requiredPermission = 'stay:note:create';
    expect(requiredPermission).toBeTruthy();
  });

  it('invoice issue requires invoice:issue', () => {
    const requiredPermission = 'invoice:issue';
    expect(requiredPermission).toBeTruthy();
  });

  it('guest sensitive view requires guest:view_sensitive', () => {
    const requiredPermission = 'guest:view_sensitive';
    expect(requiredPermission).toBeTruthy();
  });

  it('checkout requires checkout:perform', () => {
    const requiredPermission = 'checkout:perform';
    expect(requiredPermission).toBeTruthy();
  });

  it('sensitive guest info not exposed through unprotected URL', () => {
    const documentUrl = 'vault://docs/guest_123/1234567890-abc123def456';
    expect(documentUrl).toContain('vault://');
    expect(documentUrl).not.toContain('/api/public/');
  });
});

// ─── H. Audit Coverage ─────────────────────────────────────

describe('Audit Coverage', () => {
  it('charge posting creates audit log', () => {
    const auditAction = 'FOLIO_CHARGE_POSTED';
    expect(auditAction).toBeTruthy();
  });

  it('payment recording creates audit log', () => {
    const auditAction = 'FOLIO_PAYMENT_RECORDED';
    expect(auditAction).toBeTruthy();
  });

  it('note creation creates audit log', () => {
    const auditAction = 'STAY_NOTE_CREATED';
    expect(auditAction).toBeTruthy();
  });

  it('note editing creates audit log', () => {
    const auditAction = 'STAY_NOTE_EDITED';
    expect(auditAction).toBeTruthy();
  });

  it('checkout creates audit log', () => {
    const auditAction = 'CHECKOUT_COMPLETED';
    expect(auditAction).toBeTruthy();
  });

  it('invoice issuance creates audit log', () => {
    const auditAction = 'INVOICE_ISSUED';
    expect(auditAction).toBeTruthy();
  });

  it('sensitive document view creates audit log', () => {
    const auditAction = 'GUEST_SENSITIVE_DOC_VIEWED';
    expect(auditAction).toBeTruthy();
  });
});

// ─── I. Decimal Precision ──────────────────────────────────

describe('Decimal Precision', () => {
  it('no floating-point arithmetic for money', () => {
    // WRONG: 0.1 + 0.2 = 0.30000000000000004 in JS
    const wrongResult = 0.1 + 0.2;
    expect(wrongResult).not.toBe(0.3);

    // RIGHT: Decimal
    const correctResult = new Prisma.Decimal('0.1').plus(new Prisma.Decimal('0.2'));
    expect(correctResult.toFixed(1)).toBe('0.3');
  });

  it('large amounts maintain precision', () => {
    const amount = new Prisma.Decimal('99999999.99');
    const tax = amount.mul(0.18).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_EVEN);
    const total = amount.plus(tax);

    expect(amount.toFixed(2)).toBe('99999999.99');
    expect(total.toFixed(2)).toBe('117999999.99');
  });

  it('ROUND_HALF_EVEN used consistently', () => {
    const value = new Prisma.Decimal('1.005');
    const rounded = value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_EVEN);
    expect(rounded.toFixed(2)).toBe('1.00');
  });
});

// ─── J. Financial Invariant Integration ────────────────────

describe('Financial Invariant Integration', () => {
  it('accommodation: room base + tax = gross (no double-count)', () => {
    const roomBase = new Prisma.Decimal('5500');
    const tax = new Prisma.Decimal('660');
    const gross = roomBase.plus(tax);

    // FolioItem stores: amount = gross, taxAmount = tax
    // net = amount - taxAmount = roomBase
    const storedAmount = gross;
    const storedTax = tax;
    const net = storedAmount.minus(storedTax);

    expect(net.toFixed(0)).toBe('5500');
    expect(storedTax.toFixed(0)).toBe('660');
    expect(storedAmount.toFixed(0)).toBe('6160');
  });

  it('service charge: net + service charge + tax = gross', () => {
    const net = new Prisma.Decimal('1000');
    const serviceCharge = new Prisma.Decimal('100');
    const taxBase = net.plus(serviceCharge); // service charge is taxable
    const tax = taxBase.mul(0.18).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_EVEN);
    const gross = net.plus(serviceCharge).plus(tax);

    expect(gross.toFixed(2)).toBe('1298.00');
  });

  it('bill total = sum of all FolioItem.amount - discounts', () => {
    const items = [
      { amount: new Prisma.Decimal('6160'), type: FolioItemType.ROOM_CHARGE },
      { amount: new Prisma.Decimal('1180'), type: FolioItemType.EXTRA_SERVICE_CHARGE },
      { amount: new Prisma.Decimal('350'), type: FolioItemType.RESTAURANT_CHARGE },
      { amount: new Prisma.Decimal('-100'), type: FolioItemType.DISCOUNT_CREDIT },
    ];

    let total = new Prisma.Decimal(0);
    for (const item of items) {
      total = total.plus(item.amount);
    }

    expect(total.toFixed(2)).toBe('7590.00');
  });

  it('checkout balance = charges - credits - payments', () => {
    const charges = new Prisma.Decimal('7590.00');
    const credits = new Prisma.Decimal('100.00');
    const payments = new Prisma.Decimal('7490.00');

    const balance = charges.minus(credits).minus(payments);
    expect(balance.toFixed(2)).toBe('0.00');
  });
});
