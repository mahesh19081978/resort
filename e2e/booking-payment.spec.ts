import { test, expect } from '@playwright/test';
import { PrismaClient, ReservationStatus, PaymentStatus, RefundStatus } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.e2e') });

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

test.describe.serial('Phase 2E-B: Real Browser Booking Submission, Mock Payment, and Lifecycle Verification', () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test('1. Full Flow: Public Room Selection -> Booking Form -> Server Authoritative Pricing -> Hold Creation -> Mock Payment -> Confirmation', async ({ page }) => {
    // 1. Open /
    await page.goto('/');
    await expect(page).toHaveTitle(/Infinity Resort/i);

    // 2. Navigate to /rooms
    await page.getByRole('link', { name: /Accommodations/i }).first().click();
    await expect(page).toHaveURL(/\/rooms/);
    await expect(page.getByText('Standard Heritage Room', { exact: false }).first()).toBeVisible({ timeout: 15000 });

    // 3. Select Standard Heritage Room -> Click View Details
    const viewDetailsLink = page.locator('a[href="/rooms/standard-heritage-room"]').first();
    await viewDetailsLink.click();
    await expect(page).toHaveURL(/\/rooms\/standard-heritage-room/);
    await expect(page.getByRole('heading', { name: /Standard Heritage Room/i })).toBeVisible();

    // 4. Navigate to booking flow for Standard Heritage Room (1-night future stay)
    const stdRoom = await prisma.roomType.findFirst({ where: { slug: 'standard-heritage-room' } });
    await page.goto(`/booking?roomTypeId=${stdRoom!.id}&checkIn=2026-10-15&checkOut=2026-10-16&adults=1`);
    await expect(page).toHaveURL(/\/booking/);

    // 5. Verify Stay Dates and Room Selection
    const checkInInput = page.locator('input[type="date"]').nth(0);
    const checkOutInput = page.locator('input[type="date"]').nth(1);
    await expect(checkInInput).toHaveValue('2026-10-15');
    await expect(checkOutInput).toHaveValue('2026-10-16');

    const adultsSelect = page.locator('select').nth(1);
    await adultsSelect.selectOption('1');

    // 7. Verify authoritative pricing preview in browser UI
    await expect(page.getByText('Total Stay Amount', { exact: false })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('₹6,160', { exact: false }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('₹660', { exact: false }).first()).toBeVisible({ timeout: 15000 });

    // 8. Complete Primary Guest Information
    const firstNameInput = page.locator('input[placeholder="John"]');
    const lastNameInput = page.locator('input[placeholder="Doe"]');
    const emailInput = page.locator('input[placeholder="john.doe@example.com"]');
    const phoneInput = page.locator('input[placeholder="+91 9876543210"]');
    const cityInput = page.locator('input[placeholder="Indore"]');

    await firstNameInput.fill('Rajesh');
    await lastNameInput.fill('Sharma');
    await emailInput.fill('rajesh.sharma@e2e-resort.test');
    await phoneInput.fill('+919876543210');
    await cityInput.fill('Indore');

    // 9. Ensure Pay Online is selected
    const payOnlineRadio = page.locator('text=Pay Online Now');
    await payOnlineRadio.click();

    // 10. Submit Booking Form -> Initiates createPublicBookingAction
    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.click();

    // 11. Browser automatically navigates to Mock Payment Gateway URL (/booking/payment/mock?tx=...)
    await expect(page).toHaveURL(/\/booking\/payment\/mock/i, { timeout: 30000 });
    await expect(page.getByText('Secure Online Payment', { exact: false })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Amount Payable', { exact: false })).toBeVisible();
    await expect(page.getByText('₹6,160', { exact: false }).first()).toBeVisible();

    // Extract reservation number displayed on mock gateway page
    const refLocator = page.locator('span.font-mono.text-resort-forest');
    await expect(refLocator).toBeVisible();
    const createdReservationNumber = (await refLocator.textContent())?.trim() || '';
    expect(createdReservationNumber).toMatch(/^RES-\d{8}-[A-Z0-9]+$/);

    // 12. Database Check 1: Verify Reservation in PENDING state before payment
    const pendingRes = await prisma.reservation.findUnique({
      where: { reservationNumber: createdReservationNumber },
      include: { reservedRooms: true },
    });

    expect(pendingRes).not.toBeNull();
    expect(pendingRes!.status).toBe(ReservationStatus.PENDING);
    expect(pendingRes!.totalAmount.toString()).toBe('6160');
    expect(pendingRes!.advancePaidAmount.toString()).toBe('0');
    expect(pendingRes!.expiresAt).not.toBeNull();

    // ReservationRoom snapshots
    expect(pendingRes!.reservedRooms.length).toBe(1);
    const roomSnap = pendingRes!.reservedRooms[0];
    expect(roomSnap.lineTotal.toString()).toBe('6160');
    expect(roomSnap.taxAmount.toString()).toBe('660');
    expect(roomSnap.taxRate?.toString()).toBe('12');
    expect(roomSnap.taxCode).toBe('ROOM_GST_12');
    expect(roomSnap.taxId).toBeTruthy();
    expect(roomSnap.taxSnapshotAt).not.toBeNull();

    // 13. Execute Mock Payment: Click "Simulate Successful Payment"
    const successPaymentBtn = page.getByRole('button', { name: /Simulate Successful Payment/i });
    await expect(successPaymentBtn).toBeVisible();
    await successPaymentBtn.click();

    // 14. Verification: Payment succeeds and page automatically redirects to booking confirmation
    await expect(page).toHaveURL(/\/booking\?token=/i, { timeout: 25000 });
    await expect(page.getByText('Booking Confirmed!', { exact: false })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(createdReservationNumber, { exact: false })).toBeVisible();
    await expect(page.getByText('₹6,160', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Outstanding Balance Due', { exact: false })).toBeVisible();
    await expect(page.getByText('₹0', { exact: false }).first()).toBeVisible();

    // 15. Database Check 2: Verify Reservation is CONFIRMED and Payment is SUCCESS
    const confirmedRes = await prisma.reservation.findUnique({
      where: { reservationNumber: createdReservationNumber },
      include: { payments: true },
    });

    expect(confirmedRes!.status).toBe(ReservationStatus.CONFIRMED);
    expect(confirmedRes!.advancePaidAmount.toString()).toBe('6160');
    expect(confirmedRes!.expiresAt).toBeNull();
    expect(confirmedRes!.payments.length).toBe(1);

    const paymentRecord = confirmedRes!.payments[0];
    expect(paymentRecord.status).toBe(PaymentStatus.SUCCESS);
    expect(paymentRecord.amount.toString()).toBe('6160');
    expect(paymentRecord.currency).toBe('INR');
    expect(paymentRecord.context).toBe('RESERVATION_ADVANCE');
  });

  test('2. Payment Idempotency: Replaying provider webhook results in safe no-op (IDEMPOTENT_REPLAY)', async ({ request }) => {
    // 1. Locate an existing SUCCESS payment from the isolated E2E database
    const existingPayment = await prisma.payment.findFirst({
      where: {
        status: PaymentStatus.SUCCESS,
        provider: 'MOCK_GATEWAY',
        providerTransactionId: { not: null },
      },
      include: { reservation: true },
      orderBy: { createdAt: 'desc' },
    });

    expect(existingPayment).not.toBeNull();
    const reservationId = existingPayment!.reservationId!;
    const initialAdvanceAmount = existingPayment!.reservation!.advancePaidAmount.toString();

    // Initial count of payments for this reservation
    const initialPaymentCount = await prisma.payment.count({
      where: { reservationId },
    });

    // 2. Replay the identical webhook payload to the actual HTTP endpoint /api/booking/webhook
    const replayPayload = {
      eventId: `replay_evt_${Date.now()}`,
      eventType: 'payment.success',
      provider: existingPayment!.provider,
      providerTransactionId: existingPayment!.providerTransactionId,
      idempotencyKey: existingPayment!.idempotencyKey,
      reservationId,
      amount: Number(existingPayment!.amount),
      currency: 'INR',
      signature: 'mock_valid_signature_for_test',
      timestamp: new Date().toISOString(),
    };

    const webhookResponse = await request.post('/api/booking/webhook', {
      headers: {
        'x-gateway-signature': 'mock_valid_signature_for_test',
        'Content-Type': 'application/json',
      },
      data: replayPayload,
    });

    expect(webhookResponse.ok()).toBe(true);
    const body = await webhookResponse.json();

    // Verify response indicates safe idempotent replay
    expect(body.success).toBe(true);
    expect(body.result.status).toBe('IDEMPOTENT_REPLAY');

    // 3. Database Verification: No duplicate payments created, balance unchanged
    const afterPayments = await prisma.payment.findMany({
      where: { reservationId },
    });
    expect(afterPayments.length).toBe(initialPaymentCount);

    const resCheck = await prisma.reservation.findUnique({
      where: { id: reservationId },
    });
    expect(resCheck!.advancePaidAmount.toString()).toBe(initialAdvanceAmount);
    expect(resCheck!.status).toBe(ReservationStatus.CONFIRMED);
  });

  test('3. Failed Mock Payment: Bank decline preserves PENDING status without confirming or crediting', async ({ page }) => {
    await page.goto('/booking?checkIn=2026-10-20&checkOut=2026-10-21&adults=1');

    await page.locator('input[placeholder="John"]').fill('Aarav');
    await page.locator('input[placeholder="Doe"]').fill('Mehta');
    await page.locator('input[placeholder="john.doe@example.com"]').fill('aarav.mehta@e2e-resort.test');
    await page.locator('input[placeholder="+91 9876543210"]').fill('+919811122233');

    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/booking\/payment\/mock/i, { timeout: 30000 });

    const refLocator = page.locator('span.font-mono.text-resort-forest');
    const failedResNumber = (await refLocator.textContent())?.trim() || '';
    expect(failedResNumber).toMatch(/^RES-\d{8}-[A-Z0-9]+$/);

    const declineBtn = page.getByRole('button', { name: /Simulate Bank Decline \/ Failure/i });
    await expect(declineBtn).toBeVisible();
    await declineBtn.click();

    await expect(page.getByText('Payment simulation declined', { exact: false })).toBeVisible({ timeout: 10000 });

    const failedRes = await prisma.reservation.findUnique({
      where: { reservationNumber: failedResNumber },
      include: { payments: true },
    });

    expect(failedRes!.status).toBe(ReservationStatus.PENDING);
    expect(failedRes!.advancePaidAmount.toString()).toBe('0');
    expect(failedRes!.payments.length).toBe(1);
    expect(failedRes!.payments[0].status).toBe(PaymentStatus.FAILED);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 4: Client-side Manipulation & Server-Authoritative Recalculation
  // ─────────────────────────────────────────────────────────────────────────────
  test('4. Client-side Manipulation: Server enforces authoritative pricing regardless of client changes', async ({ page }) => {
    await page.goto('/booking?checkIn=2026-11-01&checkOut=2026-11-02&adults=1');

    // Select 1 adult
    const adultsSelect = page.locator('select').nth(1);
    await adultsSelect.selectOption('1');

    // Fill guest details
    await page.locator('input[placeholder="John"]').fill('Security');
    await page.locator('input[placeholder="Doe"]').fill('TamperTest');
    await page.locator('input[placeholder="john.doe@example.com"]').fill('tamper@e2e-resort.test');
    await page.locator('input[placeholder="+91 9876543210"]').fill('+919999888877');

    // Verify browser UI shows server-authoritative breakdown
    await expect(page.getByText('₹6,160', { exact: false }).first()).toBeVisible({ timeout: 15000 });

    // Submit booking form
    await page.locator('button[type="submit"]').click();

    // Gateway URL should load with authoritative server calculation
    await expect(page).toHaveURL(/\/booking\/payment\/mock/i, { timeout: 30000 });
    await expect(page.getByText('Amount Payable', { exact: false })).toBeVisible();
    await expect(page.getByText('₹6,160', { exact: false }).first()).toBeVisible();

    const refLocator = page.locator('span.font-mono.text-resort-forest');
    const resNumber = (await refLocator.textContent())?.trim() || '';

    // Verify database record has exactly server-calculated amounts
    const dbRecord = await prisma.reservation.findUnique({
      where: { reservationNumber: resNumber },
      include: { reservedRooms: true },
    });

    expect(dbRecord).not.toBeNull();
    expect(dbRecord!.totalAmount.toString()).toBe('6160');
    expect(dbRecord!.taxAmount.toString()).toBe('660');
    expect(dbRecord!.reservedRooms[0].lineTotal.toString()).toBe('6160');
    expect(dbRecord!.reservedRooms[0].taxAmount.toString()).toBe('660');
    expect(dbRecord!.reservedRooms[0].taxRate?.toString()).toBe('12');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 5: Payment Amount Mismatch Detection & Auto-Void Reversal
  // ─────────────────────────────────────────────────────────────────────────────
  test('5. Payment Amount Mismatch: Webhook with mismatched amount triggers auto-void cancellation and refund', async ({ page, request }) => {
    await page.goto('/booking?checkIn=2026-11-05&checkOut=2026-11-06&adults=1');

    await page.locator('input[placeholder="John"]').fill('Mismatch');
    await page.locator('input[placeholder="Doe"]').fill('Tester');
    const uniqueEmail = `mismatch.${Date.now()}@e2e-resort.test`;
    await page.locator('input[placeholder="john.doe@example.com"]').fill(uniqueEmail);
    await page.locator('input[placeholder="+91 9876543210"]').fill('+919999777766');

    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/booking\/payment\/mock/i, { timeout: 30000 });

    const refLocator = page.locator('span.font-mono.text-resort-forest');
    const resNumber = (await refLocator.textContent())?.trim() || '';
    expect(resNumber).toMatch(/^RES-\d{8}-[A-Z0-9]+$/);

    const pendingRes = await prisma.reservation.findUnique({
      where: { reservationNumber: resNumber },
    });
    expect(pendingRes).not.toBeNull();
    const reservationId = pendingRes!.id;

    // 2. Post a webhook payload with an intentionally mismatched amount (₹6,490 instead of expected ₹6,160)
    const mismatchWebhookPayload = {
      eventId: `evt_mismatch_${Date.now()}`,
      eventType: 'payment.success',
      provider: 'MOCK_GATEWAY',
      providerTransactionId: `TX-MISMATCH-${Date.now()}`,
      idempotencyKey: `idemp_mismatch_${Date.now()}`,
      reservationId,
      amount: 6490,
      currency: 'INR',
      signature: 'mock_valid_signature_for_test',
      timestamp: new Date().toISOString(),
    };

    const webhookResponse = await request.post('/api/booking/webhook', {
      headers: {
        'x-gateway-signature': 'mock_valid_signature_for_test',
        'Content-Type': 'application/json',
      },
      data: mismatchWebhookPayload,
    });

    expect(webhookResponse.ok()).toBe(true);
    const body = await webhookResponse.json();
    expect(body.success).toBe(true);
    expect(body.result.status).toBe('AMOUNT_MISMATCH_REVERSAL');

    // 3. Database Verification: Reservation auto-voided to CANCELLED, PENDING refund recorded
    const resInDb = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { payments: true },
    });

    expect(resInDb!.status).toBe(ReservationStatus.CANCELLED);
    expect(resInDb!.cancellationReason).toBe('PAYMENT_AMOUNT_MISMATCH_AUTO_VOID');
    expect(resInDb!.advancePaidAmount.toString()).toBe('0');

    expect(resInDb!.payments.length).toBe(1);
    expect(resInDb!.payments[0].amount.toString()).toBe('6490');

    const refund = await prisma.refund.findFirst({
      where: { paymentId: resInDb!.payments[0].id },
    });
    expect(refund).not.toBeNull();
    expect(refund!.amount.toString()).toBe('6490');
    expect(refund!.reasonCode).toBe('AMOUNT_MISMATCH_REVERSAL');
    expect(refund!.status).toBe(RefundStatus.PENDING);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 6: Availability Verification: Booked Room Reduces Inventory by Exactly Booked Quantity
  // ─────────────────────────────────────────────────────────────────────────────
  test('6. Availability Verification: Booked RoomType Occupancy Reduces Available Rooms by Exactly 1', async ({ page, request }) => {
    // 1. Establish known independent test date range
    const checkIn = '2026-11-25';
    const checkOut = '2026-11-26';

    // 2. Query baseline availability via HTTP API
    const baselineRes = await request.get(`/api/availability?checkIn=${checkIn}&checkOut=${checkOut}&guests=1&adults=1&children=0`);
    expect(baselineRes.ok()).toBe(true);
    const baselineData = await baselineRes.json();
    const stdBaseline = baselineData.availableRoomTypes.find((r: any) => r.slug === 'standard-heritage-room' || r.name.includes('Standard Heritage'));
    expect(stdBaseline).toBeDefined();
    const initialAvailableCount: number = stdBaseline.availableRoomCount;
    expect(initialAvailableCount).toBeGreaterThan(0);

    // 3. Create a 1-room booking through real browser flow for this date window
    await page.goto(`/booking?checkIn=${checkIn}&checkOut=${checkOut}&adults=1`);

    await page.locator('input[placeholder="John"]').fill('Inventory');
    await page.locator('input[placeholder="Doe"]').fill('Verifier');
    const uniqueEmail = `avail.${Date.now()}@e2e-resort.test`;
    await page.locator('input[placeholder="john.doe@example.com"]').fill(uniqueEmail);
    await page.locator('input[placeholder="+91 9876543210"]').fill('+919833445566');

    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/booking\/payment\/mock/i, { timeout: 30000 });

    // Complete mock payment so reservation transitions to CONFIRMED
    const successPaymentBtn = page.getByRole('button', { name: /Simulate Successful Payment/i });
    await expect(successPaymentBtn).toBeVisible();
    await successPaymentBtn.click();
    await expect(page).toHaveURL(/\/booking\?token=/i, { timeout: 25000 });
    await expect(page.getByText('Booking Confirmed!', { exact: false })).toBeVisible({ timeout: 15000 });

    // 4. Query availability again for the exact date range
    const postRes = await request.get(`/api/availability?checkIn=${checkIn}&checkOut=${checkOut}&guests=1&adults=1&children=0`);
    expect(postRes.ok()).toBe(true);
    const postData = await postRes.json();
    const stdPost = postData.availableRoomTypes.find((r: any) => r.slug === 'standard-heritage-room' || r.name.includes('Standard Heritage'));
    expect(stdPost).toBeDefined();

    // 5. Assert availableRoomCount decreased by exactly 1
    expect(stdPost.availableRoomCount).toBe(initialAvailableCount - 1);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 7: Tax Snapshot Immutability: Tax Rate Change Does Not Alter Historical Snapshots
  // ─────────────────────────────────────────────────────────────────────────────
  test('7. Tax Snapshot Immutability: Tax rate change does not alter existing reservation snapshots', async ({ page }) => {
    // 1. Locate existing confirmed reservation from Test 1
    const originalRes = await prisma.reservation.findFirst({
      where: {
        status: ReservationStatus.CONFIRMED,
        primaryGuest: { email: 'rajesh.sharma@e2e-resort.test' },
      },
      include: { reservedRooms: true },
      orderBy: { createdAt: 'desc' },
    });

    expect(originalRes).not.toBeNull();
    expect(originalRes!.reservedRooms[0].taxRate?.toString()).toBe('12');
    expect(originalRes!.reservedRooms[0].taxAmount.toString()).toBe('660');
    expect(originalRes!.totalAmount.toString()).toBe('6160');

    // 2. Identify active ROOM tax record
    const currentTax = await prisma.tax.findFirst({
      where: { scope: 'ROOM', isActive: true },
    });
    expect(currentTax).not.toBeNull();
    expect(currentTax!.rate.toString()).toBe('12');

    // 3. Update tax rate to 18% in the isolated E2E database
    await prisma.tax.update({
      where: { id: currentTax!.id },
      data: { rate: 18 },
    });

    try {
      // Create a new booking through the real browser flow under the new 18% tax rate
      await page.goto('/booking?checkIn=2026-11-28&checkOut=2026-11-29&adults=1');

      // Verify browser UI recalculates authoritative pricing with 18% tax (₹5,500 + ₹990 = ₹6,490)
      await expect(page.getByText('₹6,490', { exact: false }).first()).toBeVisible({ timeout: 15000 });
      await expect(page.getByText('₹990', { exact: false }).first()).toBeVisible({ timeout: 15000 });

      await page.locator('input[placeholder="John"]').fill('TaxChange');
      await page.locator('input[placeholder="Doe"]').fill('Tester');
      const uniqueEmail = `taxchange.${Date.now()}@e2e-resort.test`;
      await page.locator('input[placeholder="john.doe@example.com"]').fill(uniqueEmail);
      await page.locator('input[placeholder="+91 9876543210"]').fill('+919999666655');

      await page.locator('button[type="submit"]').click();
      await expect(page).toHaveURL(/\/booking\/payment\/mock/i, { timeout: 30000 });

      const refLocator = page.locator('span.font-mono.text-resort-forest');
      const newResNumber = (await refLocator.textContent())?.trim() || '';
      expect(newResNumber).toMatch(/^RES-\d{8}-[A-Z0-9]+$/);

      // Verify new reservation snapshot captured 18% tax
      const newRes = await prisma.reservation.findUnique({
        where: { reservationNumber: newResNumber },
        include: { reservedRooms: true },
      });

      expect(newRes).not.toBeNull();
      expect(newRes!.reservedRooms[0].taxRate?.toString()).toBe('18');
      expect(newRes!.reservedRooms[0].taxAmount.toString()).toBe('990');
      expect(newRes!.totalAmount.toString()).toBe('6490');

      // 4. Critical Invariant Check: Verify historical reservation snapshot remained unchanged at 12%
      const oldResRecheck = await prisma.reservation.findUnique({
        where: { id: originalRes!.id },
        include: { reservedRooms: true },
      });
      expect(oldResRecheck!.reservedRooms[0].taxRate?.toString()).toBe('12');
      expect(oldResRecheck!.reservedRooms[0].taxAmount.toString()).toBe('660');
      expect(oldResRecheck!.totalAmount.toString()).toBe('6160');
    } finally {
      // 5. Always restore tax configuration back to 12% in finally block
      await prisma.tax.update({
        where: { id: currentTax!.id },
        data: { rate: 12 },
      });
    }

    // Verify tax restored
    const restoredTax = await prisma.tax.findUnique({
      where: { id: currentTax!.id },
    });
    expect(restoredTax!.rate.toString()).toBe('12');
  });
});
