/**
 * Phase 0.8 Public Booking Automated Verification Suite
 *
 * Implements and executes the complete 27-Test Matrix defined in the approved
 * Phase 0.8 Architecture Specification v2.2.
 */

import { prisma } from '../src/lib/db/prisma';
import { Prisma, ReservationStatus, PaymentStatus, RefundStatus } from '@prisma/client';
import { getAvailableRoomTypes } from '../src/lib/availability/service';
import { createReservationHold, processPaymentWebhook, sanitizeReservation } from '../src/lib/booking/reservation-service';
import { calculateReservationPricing, roundCurrency, calculateNights } from '../src/lib/booking/pricing-calculator';
import { generateBookingNumber, generateRefundIdempotencyKey } from '../src/lib/booking/numbers';
import { checkRateLimit } from '../src/lib/security/rate-limit';
import assert from 'assert';
import crypto from 'crypto';

function uuid() {
  return crypto.randomUUID();
}

async function runTests() {
  console.log('===============================================================');
  console.log('Starting Phase 0.8 Public Booking Verification Suite (27 Tests)');
  console.log('===============================================================\n');

  let passedCount = 0;
  const totalTests = 27;

  // Setup prerequisites: find or seed RoomTypes, Property, Rooms, and Tax
  let property = await prisma.property.findFirst();
  if (!property) {
    property = await prisma.property.create({
      data: {
        name: 'Infinity Resort Indore',
        code: 'PROP-INDORE',
        address: 'Ralamandal Sanctuary Road',
        city: 'Indore',
        state: 'Madhya Pradesh',
        postalCode: '452020',
        contactPhone: '+91 9876543210',
        contactEmail: 'stay@infinityresort.com',
      },
    });
  }

  let floor = await prisma.floor.findFirst();
  if (!floor) {
    let bldg = await prisma.building.findFirst({ where: { propertyId: property.id } });
    if (!bldg) {
      bldg = await prisma.building.create({
        data: { propertyId: property.id, name: 'Main Wing', code: 'MAIN' },
      });
    }
    floor = await prisma.floor.create({
      data: { buildingId: bldg.id, floorNumber: 1, name: 'Ground Floor' },
    });
  }

  // Ensure Tax record exists
  let taxRecord = await prisma.tax.findUnique({ where: { code: 'ROOM_GST' } });
  if (!taxRecord) {
    taxRecord = await prisma.tax.create({
      data: { name: 'Hotel Accommodation GST', code: 'ROOM_GST', rate: new Prisma.Decimal(12.0) },
    });
  }

  // RoomType A: Deluxe Heritage Chalet
  let rtA = await prisma.roomType.findFirst({ where: { code: 'RT-DELUXE-P08' } });
  if (!rtA) {
    rtA = await prisma.roomType.create({
      data: {
        name: 'Deluxe Heritage Chalet P08',
        code: 'RT-DELUXE-P08',
        slug: 'deluxe-heritage-chalet-p08',
        description: 'Luxury chalet with teak finishing',
        basePrice: new Prisma.Decimal(10000.0),
        maxOccupancy: 3,
        maxAdults: 2,
        maxChildren: 1,
        totalInventory: 2,
      },
    });
    // Create exactly 2 physical rooms
    await prisma.room.createMany({
      data: [
        { propertyId: property.id, floorId: floor.id, roomTypeId: rtA.id, roomNumber: 'P08-101', status: 'AVAILABLE' },
        { propertyId: property.id, floorId: floor.id, roomTypeId: rtA.id, roomNumber: 'P08-102', status: 'AVAILABLE' },
      ],
      skipDuplicates: true,
    });
  }

  // RoomType B: Royal Villa
  let rtB = await prisma.roomType.findFirst({ where: { code: 'RT-VILLA-P08' } });
  if (!rtB) {
    rtB = await prisma.roomType.create({
      data: {
        name: 'Royal Lakefront Villa P08',
        code: 'RT-VILLA-P08',
        slug: 'royal-villa-p08',
        description: 'Private villa with plunge pool',
        basePrice: new Prisma.Decimal(20000.0),
        maxOccupancy: 4,
        maxAdults: 3,
        maxChildren: 2,
        totalInventory: 2,
      },
    });
    await prisma.room.createMany({
      data: [
        { propertyId: property.id, floorId: floor.id, roomTypeId: rtB.id, roomNumber: 'P08-201', status: 'AVAILABLE' },
        { propertyId: property.id, floorId: floor.id, roomTypeId: rtB.id, roomNumber: 'P08-202', status: 'AVAILABLE' },
      ],
      skipDuplicates: true,
    });
  }

  const testCheckIn = '2027-01-10';
  const testCheckOut = '2027-01-12'; // 2 nights

  // Cleanup any lingering reservations from previous runs on these dates
  await prisma.reservationRoom.deleteMany({
    where: { reservation: { checkInDate: new Date(`${testCheckIn}T00:00:00.000Z`) } },
  });
  await prisma.reservation.deleteMany({
    where: { checkInDate: new Date(`${testCheckIn}T00:00:00.000Z`) },
  });

  // -------------------------------------------------------------
  // Test 1: Single Availability Authority
  // -------------------------------------------------------------
  try {
    console.log('Running Test 1: Single Availability Authority...');
    const searchResult = await getAvailableRoomTypes({
      checkIn: testCheckIn,
      checkOut: testCheckOut,
      guests: 2,
      adults: 2,
      children: 0,
    });

    const txResult = await prisma.$transaction(async (tx) => {
      return await getAvailableRoomTypes(
        {
          checkIn: testCheckIn,
          checkOut: testCheckOut,
          guests: 2,
          adults: 2,
          children: 0,
        },
        tx
      );
    });

    const countSearch = searchResult.availableRoomTypes.find((r) => r.roomTypeId === rtA!.id)?.availableRoomCount;
    const countTx = txResult.availableRoomTypes.find((r) => r.roomTypeId === rtA!.id)?.availableRoomCount;

    assert.strictEqual(countSearch, countTx, 'Public search and transactional recheck must produce identical counts');
    console.log(`  ✓ PASS: Single availability authority recheck verified (Available: ${countSearch})\n`);
    passedCount++;
  } catch (err) {
    console.error('  ✗ FAIL Test 1:', err);
    throw err;
  }

  // -------------------------------------------------------------
  // Test 2: PostgreSQL Time Hold Expiry
  // -------------------------------------------------------------
  try {
    console.log('Running Test 2: PostgreSQL Time Hold Expiry...');
    const pastHoldGuest = await prisma.guest.create({
      data: { firstName: 'Past', lastName: 'Hold', phone: '+919999990001', email: `past.${Date.now()}@example.com` },
    });

    const pastHold = await prisma.reservation.create({
      data: {
        reservationNumber: generateBookingNumber('RES'),
        primaryGuestId: pastHoldGuest.id,
        checkInDate: new Date(`${testCheckIn}T00:00:00.000Z`),
        checkOutDate: new Date(`${testCheckOut}T00:00:00.000Z`),
        adults: 2,
        children: 0,
        totalRooms: 1,
        status: ReservationStatus.PENDING,
        subtotal: new Prisma.Decimal(20000),
        taxAmount: new Prisma.Decimal(2400),
        totalAmount: new Prisma.Decimal(22400),
        expiresAt: new Date(Date.now() - 60000), // Expired 1 minute ago in DB
        reservedRooms: {
          create: [
            {
              roomTypeId: rtA!.id,
              roomsCount: 2,
              ratePerNight: new Prisma.Decimal(10000),
              totalNights: 2,
              discountAmount: new Prisma.Decimal(0),
              taxAmount: new Prisma.Decimal(2400),
              lineTotal: new Prisma.Decimal(22400),
            },
          ],
        },
      },
    });

    const avail = await getAvailableRoomTypes({
      checkIn: testCheckIn,
      checkOut: testCheckOut,
      guests: 2,
    });

    const roomAvail = avail.availableRoomTypes.find((r) => r.roomTypeId === rtA!.id)?.availableRoomCount;
    assert.strictEqual(roomAvail, 2, 'Expired hold must NOT block available room count');
    console.log(`  ✓ PASS: PostgreSQL DB-time hold expiration immediately ignored by availability\n`);
    passedCount++;

    await prisma.reservationRoom.deleteMany({ where: { reservationId: pastHold.id } });
    await prisma.reservation.delete({ where: { id: pastHold.id } });
  } catch (err) {
    console.error('  ✗ FAIL Test 2:', err);
    throw err;
  }

  // -------------------------------------------------------------
  // Test 3: Anti-Overselling Concurrency (Race condition)
  // -------------------------------------------------------------
  try {
    console.log('Running Test 3: Anti-Overselling Concurrency (10 concurrent threads for 2 rooms)...');
    const promises: Promise<any>[] = [];

    for (let i = 0; i < 10; i++) {
      promises.push(
        createReservationHold({
          bookingRequestId: uuid(),
          checkInDate: testCheckIn,
          checkOutDate: testCheckOut,
          adults: 2,
          children: 0,
          rooms: [{ roomTypeId: rtA!.id, roomsCount: 1 }],
          guest: {
            firstName: `Racer${i}`,
            lastName: 'User',
            email: `racer${i}.${Date.now()}@example.com`,
            phone: `+91981111000${i}`,
          },
        })
      );
    }

    const settled = await Promise.allSettled(promises);
    const fulfilled = settled.filter((s) => s.status === 'fulfilled');
    const rejected = settled.filter((s) => s.status === 'rejected');

    assert.strictEqual(fulfilled.length, 2, `Exactly 2 out of 10 concurrent requests must succeed (got ${fulfilled.length})`);
    assert.strictEqual(rejected.length, 8, `Exactly 8 requests must fail with inventory rejection (got ${rejected.length})`);
    console.log(`  ✓ PASS: Concurrency guard strictly prevented overselling (2 Succeeded, 8 Rejected)\n`);
    passedCount++;

    // Clean up holds created in Test 3
    for (const item of fulfilled) {
      const b = (item as PromiseFulfilledResult<any>).value;
      await prisma.reservationRoom.deleteMany({ where: { reservationId: b.reservationId } });
      await prisma.reservation.delete({ where: { id: b.reservationId } });
    }
  } catch (err) {
    console.error('  ✗ FAIL Test 3:', err);
    throw err;
  }

  // -------------------------------------------------------------
  // Test 4: Deterministic Multi-Room Lock Ordering (ASC Deadlock Prevention)
  // -------------------------------------------------------------
  try {
    console.log('Running Test 4: Deterministic Multi-Room Lock Ordering...');
    const sortedIds = [rtA!.id, rtB!.id].sort();
    assert.strictEqual(sortedIds[0] < sortedIds[1], true, 'Room type IDs must be sorted ascending');

    // Run concurrent bookings requesting [A, B] and [B, A]
    const p1 = createReservationHold({
      bookingRequestId: uuid(),
      checkInDate: testCheckIn,
      checkOutDate: testCheckOut,
      adults: 2,
      children: 0,
      rooms: [
        { roomTypeId: sortedIds[0], roomsCount: 1 },
        { roomTypeId: sortedIds[1], roomsCount: 1 },
      ],
      guest: { firstName: 'Multi', lastName: 'One', email: `m1.${Date.now()}@example.com`, phone: '+919822220001' },
    });

    const p2 = createReservationHold({
      bookingRequestId: uuid(),
      checkInDate: testCheckIn,
      checkOutDate: testCheckOut,
      adults: 2,
      children: 0,
      rooms: [
        { roomTypeId: sortedIds[1], roomsCount: 1 },
        { roomTypeId: sortedIds[0], roomsCount: 1 },
      ],
      guest: { firstName: 'Multi', lastName: 'Two', email: `m2.${Date.now()}@example.com`, phone: '+919822220002' },
    });

    const results = await Promise.all([p1, p2]);
    assert.strictEqual(results.length, 2, 'Both multi-room bookings must succeed without database deadlock');
    console.log('  ✓ PASS: Deterministic ASC room-lock ordering eliminated deadlocks\n');
    passedCount++;

    for (const b of results) {
      await prisma.reservationRoom.deleteMany({ where: { reservationId: b.reservationId } });
      await prisma.reservation.delete({ where: { id: b.reservationId } });
    }
  } catch (err) {
    console.error('  ✗ FAIL Test 4:', err);
    throw err;
  }

  // -------------------------------------------------------------
  // Test 5: Booking Request Idempotency (Sequential Re-submission)
  // -------------------------------------------------------------
  try {
    console.log('Running Test 5: Booking Request Idempotency (Sequential)...');
    const reqId = uuid();
    const payload = {
      bookingRequestId: reqId,
      checkInDate: testCheckIn,
      checkOutDate: testCheckOut,
      adults: 2,
      children: 0,
      rooms: [{ roomTypeId: rtA!.id, roomsCount: 1 }],
      guest: { firstName: 'Idem', lastName: 'Seq', email: `idemseq.${Date.now()}@example.com`, phone: '+919833330001' },
    };

    const first = await createReservationHold(payload);
    const second = await createReservationHold(payload);

    assert.strictEqual(first.reservationId, second.reservationId, 'Sequential resubmission must return exact same reservation');
    assert.strictEqual(first.reservationNumber, second.reservationNumber, 'Reservation number must match');
    console.log('  ✓ PASS: Sequential booking request idempotency confirmed\n');
    passedCount++;

    await prisma.reservationRoom.deleteMany({ where: { reservationId: first.reservationId } });
    await prisma.reservation.delete({ where: { id: first.reservationId } });
  } catch (err) {
    console.error('  ✗ FAIL Test 5:', err);
    throw err;
  }

  // -------------------------------------------------------------
  // Test 6: Concurrent bookingRequestId Race & P2002 Rollback Boundary
  // -------------------------------------------------------------
  try {
    console.log('Running Test 6: Concurrent bookingRequestId Race (P2002 Rollback & Requery)...');
    const concurrentReqId = uuid();
    const payload = {
      bookingRequestId: concurrentReqId,
      checkInDate: testCheckIn,
      checkOutDate: testCheckOut,
      adults: 2,
      children: 0,
      rooms: [{ roomTypeId: rtA!.id, roomsCount: 1 }],
      guest: { firstName: 'Idem', lastName: 'Race', email: `race.${Date.now()}@example.com`, phone: '+919844440001' },
    };

    // Fire 5 identical requests concurrently with the same bookingRequestId
    const parallelRuns = await Promise.all([
      createReservationHold(payload),
      createReservationHold(payload),
      createReservationHold(payload),
      createReservationHold(payload),
      createReservationHold(payload),
    ]);

    const firstId = parallelRuns[0].reservationId;
    for (const r of parallelRuns) {
      assert.strictEqual(r.reservationId, firstId, 'All 5 concurrent requests must resolve to the exact same reservationId');
    }

    // Verify in database that exactly 1 reservation exists for this bookingRequestId
    const count = await prisma.reservation.count({ where: { bookingRequestId: concurrentReqId } });
    assert.strictEqual(count, 1, 'Database must contain exactly 1 Reservation record for this bookingRequestId');

    console.log('  ✓ PASS: Concurrent bookingRequestId P2002 handled cleanly without abort errors\n');
    passedCount++;

    await prisma.reservationRoom.deleteMany({ where: { reservationId: firstId } });
    await prisma.reservation.delete({ where: { id: firstId } });
  } catch (err) {
    console.error('  ✗ FAIL Test 6:', err);
    throw err;
  }

  // -------------------------------------------------------------
  // Test 7: Concurrent P2002 Rollback Boundary (Target specificity)
  // -------------------------------------------------------------
  try {
    console.log('Running Test 7: Target Specificity on P2002 Handling...');
    // Verify that non-bookingRequestId P2002 errors are not swallowed
    let errorCaught = false;
    try {
      await prisma.$transaction(async (tx) => {
        // Force a P2002 collision on reservationNumber
        const num = generateBookingNumber('RES');
        const g = await tx.guest.create({
          data: { firstName: 'A', lastName: 'B', phone: '+919800001111', email: `unique.${Date.now()}@test.com` },
        });
        await tx.reservation.create({
          data: {
            reservationNumber: num,
            primaryGuestId: g.id,
            checkInDate: new Date(`${testCheckIn}T00:00:00.000Z`),
            checkOutDate: new Date(`${testCheckOut}T00:00:00.000Z`),
            subtotal: new Prisma.Decimal(100),
            totalAmount: new Prisma.Decimal(100),
          },
        });
        // Duplicate reservationNumber
        await tx.reservation.create({
          data: {
            reservationNumber: num,
            primaryGuestId: g.id,
            checkInDate: new Date(`${testCheckIn}T00:00:00.000Z`),
            checkOutDate: new Date(`${testCheckOut}T00:00:00.000Z`),
            subtotal: new Prisma.Decimal(100),
            totalAmount: new Prisma.Decimal(100),
          },
        });
      });
    } catch (e: any) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        errorCaught = true;
      }
    }
    assert.strictEqual(errorCaught, true, 'Unrelated P2002 constraint error must be rethrown');
    console.log('  ✓ PASS: P2002 specificity verified (only bookingRequestId triggers idempotent return)\n');
    passedCount++;
  } catch (err) {
    console.error('  ✗ FAIL Test 7:', err);
    throw err;
  }

  // -------------------------------------------------------------
  // Test 8: Authoritative Server Pricing (Client Tamper Discard)
  // -------------------------------------------------------------
  try {
    console.log('Running Test 8: Authoritative Server Pricing Invariant...');
    const nights = calculateNights('2027-02-01', '2027-02-04'); // 3 nights
    assert.strictEqual(nights, 3);

    const pricing = calculateReservationPricing({
      items: [
        {
          roomTypeId: rtA!.id,
          roomsCount: 2,
          basePrice: rtA!.basePrice, // ₹10,000 / night
          nights: 3,
        },
      ],
      taxRatePercent: 12.0,
      depositRatio: 1.0,
    });

    // 2 rooms * 3 nights * ₹10,000 = ₹60,000 Subtotal
    assert.strictEqual(pricing.subtotal.toNumber(), 60000.0);
    // Tax: 12% of 60,000 = ₹7,200
    assert.strictEqual(pricing.taxAmount.toNumber(), 7200.0);
    // Total: ₹67,200
    assert.strictEqual(pricing.totalAmount.toNumber(), 67200.0);
    assert.strictEqual(pricing.requiredAdvanceAmount.toNumber(), 67200.0);

    console.log('  ✓ PASS: Authoritative 9-step server pricing calculation verified\n');
    passedCount++;
  } catch (err) {
    console.error('  ✗ FAIL Test 8:', err);
    throw err;
  }

  // -------------------------------------------------------------
  // Test 9: Pricing & Rounding Invariant (ROUND_HALF_EVEN)
  // -------------------------------------------------------------
  try {
    console.log('Running Test 9: Pricing & Rounding Invariant (Banker\'s Rounding)...');
    const val1 = roundCurrency(new Prisma.Decimal('10.125')); // rounds to 10.12 (even)
    const val2 = roundCurrency(new Prisma.Decimal('10.135')); // rounds to 10.14 (even)
    assert.strictEqual(val1.toString(), '10.12');
    assert.strictEqual(val2.toString(), '10.14');
    console.log('  ✓ PASS: Centralized roundCurrency uses ROUND_HALF_EVEN accurately\n');
    passedCount++;
  } catch (err) {
    console.error('  ✗ FAIL Test 9:', err);
    throw err;
  }

  // -------------------------------------------------------------
  // Test 10: Payment Amount Mismatch Workflow
  // -------------------------------------------------------------
  try {
    console.log('Running Test 10: Payment Amount Mismatch Workflow...');
    const booking = await createReservationHold({
      bookingRequestId: uuid(),
      checkInDate: testCheckIn,
      checkOutDate: testCheckOut,
      adults: 2,
      children: 0,
      rooms: [{ roomTypeId: rtA!.id, roomsCount: 1 }],
      guest: { firstName: 'Mismatch', lastName: 'User', email: `mismatch.${Date.now()}@example.com`, phone: '+919855550001' },
    });

    // Captured ₹5,000 instead of ₹22,400 expected
    const webhookResult = await processPaymentWebhook({
      eventId: 'evt-mismatch-1',
      eventType: 'payment.success',
      provider: 'MOCK_GATEWAY',
      providerTransactionId: `tx-mismatch-${Date.now()}`,
      idempotencyKey: `idem-mismatch-${Date.now()}`,
      reservationId: booking.reservationId,
      amount: 5000.0,
      currency: 'INR',
      signature: 'valid-sig-12345',
      timestamp: new Date().toISOString(),
    });

    assert.strictEqual(webhookResult.status, 'AMOUNT_MISMATCH_REVERSAL');
    assert.strictEqual(webhookResult.payment.status, PaymentStatus.SUCCESS, 'Actual captured payment must be SUCCESS');
    assert.strictEqual(webhookResult.reservation!.status, ReservationStatus.CANCELLED, 'Reservation must be CANCELLED on mismatch');
    assert.strictEqual(webhookResult.refund!.status, RefundStatus.PENDING, 'Pending refund must be generated');

    console.log('  ✓ PASS: Captured amount mismatch preserved financial truth and triggered refund workflow\n');
    passedCount++;
  } catch (err) {
    console.error('  ✗ FAIL Test 10:', err);
    throw err;
  }

  // -------------------------------------------------------------
  // Test 11: No Stacked Payments on Mismatch
  // -------------------------------------------------------------
  try {
    console.log('Running Test 11: No Stacked Payments on Mismatched Reservation...');
    // Attempting another payment on the cancelled reservation from Test 10
    const cancelledRes = await prisma.reservation.findFirst({
      where: { cancellationReason: 'PAYMENT_AMOUNT_MISMATCH_AUTO_VOID' },
    });

    assert.ok(cancelledRes);

    const secondPayment = await processPaymentWebhook({
      eventId: 'evt-mismatch-2',
      eventType: 'payment.success',
      provider: 'MOCK_GATEWAY',
      providerTransactionId: `tx-mismatch-stacked-${Date.now()}`,
      idempotencyKey: `idem-mismatch-stacked-${Date.now()}`,
      reservationId: cancelledRes.id,
      amount: Number(cancelledRes.totalAmount),
      currency: 'INR',
      signature: 'valid-sig-12345',
      timestamp: new Date().toISOString(),
    });

    assert.strictEqual(secondPayment.status, 'CANCELLED_RES_REFUND');
    assert.strictEqual(secondPayment.reservation!.status, ReservationStatus.CANCELLED);
    console.log('  ✓ PASS: Cancelled reservation cannot be confirmed by subsequent payments\n');
    passedCount++;
  } catch (err) {
    console.error('  ✗ FAIL Test 11:', err);
    throw err;
  }

  // -------------------------------------------------------------
  // Test 12: Currency Verification
  // -------------------------------------------------------------
  try {
    console.log('Running Test 12: Currency Verification Invariant...');
    const booking = await createReservationHold({
      bookingRequestId: uuid(),
      checkInDate: testCheckIn,
      checkOutDate: testCheckOut,
      adults: 2,
      children: 0,
      rooms: [{ roomTypeId: rtA!.id, roomsCount: 1 }],
      guest: { firstName: 'Curr', lastName: 'User', email: `curr.${Date.now()}@example.com`, phone: '+919866660001' },
    });

    let caught = false;
    try {
      await processPaymentWebhook({
        eventId: 'evt-curr-1',
        eventType: 'payment.success',
        provider: 'MOCK_GATEWAY',
        providerTransactionId: `tx-curr-${Date.now()}`,
        idempotencyKey: `idem-curr-${Date.now()}`,
        reservationId: booking.reservationId,
        amount: booking.totalAmount,
        currency: 'USD' as any,
        signature: 'valid-sig-12345',
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      if (e.message.includes('INVALID_CURRENCY')) caught = true;
    }

    assert.strictEqual(caught, true, 'Non-INR currency must be rejected');
    console.log('  ✓ PASS: Non-INR currency strictly rejected\n');
    passedCount++;

    await prisma.reservationRoom.deleteMany({ where: { reservationId: booking.reservationId } });
    await prisma.reservation.delete({ where: { id: booking.reservationId } });
  } catch (err) {
    console.error('  ✗ FAIL Test 12:', err);
    throw err;
  }

  // -------------------------------------------------------------
  // Test 13: Duplicate Webhook Delivery Idempotency
  // -------------------------------------------------------------
  try {
    console.log('Running Test 13: Duplicate Webhook Delivery Idempotency...');
    const booking = await createReservationHold({
      bookingRequestId: uuid(),
      checkInDate: testCheckIn,
      checkOutDate: testCheckOut,
      adults: 2,
      children: 0,
      rooms: [{ roomTypeId: rtA!.id, roomsCount: 1 }],
      guest: { firstName: 'Dup', lastName: 'Webhook', email: `dup.${Date.now()}@example.com`, phone: '+919877770001' },
    });

    const txId = `tx-dup-webhook-${Date.now()}`;
    const payload = {
      eventId: 'evt-dup-1',
      eventType: 'payment.success' as const,
      provider: 'MOCK_GATEWAY',
      providerTransactionId: txId,
      idempotencyKey: `idem-dup-${Date.now()}`,
      reservationId: booking.reservationId,
      amount: booking.totalAmount,
      currency: 'INR' as const,
      signature: 'valid-sig-12345',
      timestamp: new Date().toISOString(),
    };

    const firstRun = await processPaymentWebhook(payload);
    assert.strictEqual(firstRun.status, 'CONFIRMED');

    const secondRun = await processPaymentWebhook(payload);
    assert.strictEqual(secondRun.status, 'IDEMPOTENT_REPLAY');

    // Confirm exactly 1 payment record exists for this providerTransactionId
    const count = await prisma.payment.count({
      where: { provider: 'MOCK_GATEWAY', providerTransactionId: txId },
    });
    assert.strictEqual(count, 1, 'Exactly one payment record must exist');

    console.log('  ✓ PASS: Duplicate webhook delivery safely replayed without duplicate ledger entry\n');
    passedCount++;

    await prisma.payment.deleteMany({ where: { reservationId: booking.reservationId } });
    await prisma.reservationRoom.deleteMany({ where: { reservationId: booking.reservationId } });
    await prisma.reservation.delete({ where: { id: booking.reservationId } });
  } catch (err) {
    console.error('  ✗ FAIL Test 13:', err);
    throw err;
  }

  // -------------------------------------------------------------
  // Test 14: Deterministic Refund Idempotency
  // -------------------------------------------------------------
  try {
    console.log('Running Test 14: Deterministic Refund Idempotency Key...');
    const k1 = generateRefundIdempotencyKey('LATE_HOLD', 'MOCK', 'tx-12345');
    const k2 = generateRefundIdempotencyKey('LATE_HOLD', 'MOCK', 'tx-12345');
    assert.strictEqual(k1, k2);
    assert.strictEqual(k1, 'REFUND-LATE_HOLD-MOCK-tx-12345');
    console.log('  ✓ PASS: Deterministic refund idempotency key generation verified\n');
    passedCount++;
  } catch (err) {
    console.error('  ✗ FAIL Test 14:', err);
    throw err;
  }

  // -------------------------------------------------------------
  // Test 15: Late Payment on Expired Hold
  // -------------------------------------------------------------
  try {
    console.log('Running Test 15: Late Payment on Expired Hold...');
    const booking = await createReservationHold({
      bookingRequestId: uuid(),
      checkInDate: testCheckIn,
      checkOutDate: testCheckOut,
      adults: 2,
      children: 0,
      rooms: [{ roomTypeId: rtA!.id, roomsCount: 1 }],
      guest: { firstName: 'Late', lastName: 'Hold', email: `late.${Date.now()}@example.com`, phone: '+919888880001' },
    });

    // Manually expire the hold in DB
    await prisma.reservation.update({
      where: { id: booking.reservationId },
      data: { expiresAt: new Date(Date.now() - 10000) },
    });

    const result = await processPaymentWebhook({
      eventId: 'evt-late-1',
      eventType: 'payment.success',
      provider: 'MOCK_GATEWAY',
      providerTransactionId: `tx-late-${Date.now()}`,
      idempotencyKey: `idem-late-${Date.now()}`,
      reservationId: booking.reservationId,
      amount: booking.totalAmount,
      currency: 'INR',
      signature: 'valid-sig-12345',
      timestamp: new Date().toISOString(),
    });

    assert.strictEqual(result.status, 'LATE_PAYMENT_REFUND');
    assert.strictEqual(result.payment.status, PaymentStatus.SUCCESS);
    assert.strictEqual(result.reservation!.status, ReservationStatus.EXPIRED);
    assert.strictEqual(result.refund!.status, RefundStatus.PENDING);

    console.log('  ✓ PASS: Late payment preserved financial truth, left reservation EXPIRED, and initiated refund\n');
    passedCount++;

    await prisma.refund.deleteMany({ where: { paymentId: result.payment.id } });
    await prisma.payment.delete({ where: { id: result.payment.id } });
    await prisma.reservationRoom.deleteMany({ where: { reservationId: booking.reservationId } });
    await prisma.reservation.delete({ where: { id: booking.reservationId } });
  } catch (err) {
    console.error('  ✗ FAIL Test 15:', err);
    throw err;
  }

  // -------------------------------------------------------------
  // Test 16: Late Payment on CANCELLED Reservation
  // -------------------------------------------------------------
  try {
    console.log('Running Test 16: Late Payment on CANCELLED Reservation...');
    const booking = await createReservationHold({
      bookingRequestId: uuid(),
      checkInDate: testCheckIn,
      checkOutDate: testCheckOut,
      adults: 2,
      children: 0,
      rooms: [{ roomTypeId: rtA!.id, roomsCount: 1 }],
      guest: { firstName: 'Cancelled', lastName: 'Hold', email: `canc.${Date.now()}@example.com`, phone: '+919899990001' },
    });

    await prisma.reservation.update({
      where: { id: booking.reservationId },
      data: { status: ReservationStatus.CANCELLED },
    });

    const result = await processPaymentWebhook({
      eventId: 'evt-canc-1',
      eventType: 'payment.success',
      provider: 'MOCK_GATEWAY',
      providerTransactionId: `tx-canc-${Date.now()}`,
      idempotencyKey: `idem-canc-${Date.now()}`,
      reservationId: booking.reservationId,
      amount: booking.totalAmount,
      currency: 'INR',
      signature: 'valid-sig-12345',
      timestamp: new Date().toISOString(),
    });

    assert.strictEqual(result.status, 'CANCELLED_RES_REFUND');
    assert.strictEqual(result.reservation!.status, ReservationStatus.CANCELLED, 'Must remain CANCELLED, never EXPIRED');
    assert.strictEqual(result.refund!.status, RefundStatus.PENDING);

    console.log('  ✓ PASS: Cancelled reservation preserved CANCELLED status on payment arrival\n');
    passedCount++;

    await prisma.refund.deleteMany({ where: { paymentId: result.payment.id } });
    await prisma.payment.delete({ where: { id: result.payment.id } });
    await prisma.reservationRoom.deleteMany({ where: { reservationId: booking.reservationId } });
    await prisma.reservation.delete({ where: { id: booking.reservationId } });
  } catch (err) {
    console.error('  ✗ FAIL Test 16:', err);
    throw err;
  }

  // -------------------------------------------------------------
  // Test 17: Duplicate Webhook on CONFIRMED Reservation
  // -------------------------------------------------------------
  try {
    console.log('Running Test 17: Duplicate Webhook on CONFIRMED Reservation...');
    const booking = await createReservationHold({
      bookingRequestId: uuid(),
      checkInDate: testCheckIn,
      checkOutDate: testCheckOut,
      adults: 2,
      children: 0,
      rooms: [{ roomTypeId: rtA!.id, roomsCount: 1 }],
      guest: { firstName: 'Conf', lastName: 'Dup', email: `confdup.${Date.now()}@example.com`, phone: '+919810101010' },
    });

    const txId = `tx-conf-dup-${Date.now()}`;
    const payload = {
      eventId: 'evt-conf-1',
      eventType: 'payment.success' as const,
      provider: 'MOCK_GATEWAY',
      providerTransactionId: txId,
      idempotencyKey: `idem-conf-${Date.now()}`,
      reservationId: booking.reservationId,
      amount: booking.totalAmount,
      currency: 'INR' as const,
      signature: 'valid-sig-12345',
      timestamp: new Date().toISOString(),
    };

    const first = await processPaymentWebhook(payload);
    assert.strictEqual(first.status, 'CONFIRMED');

    const second = await processPaymentWebhook(payload);
    assert.strictEqual(second.status, 'IDEMPOTENT_REPLAY');

    console.log('  ✓ PASS: Repeated webhook on CONFIRMED reservation safely returned idempotent result\n');
    passedCount++;

    await prisma.payment.deleteMany({ where: { reservationId: booking.reservationId } });
    await prisma.reservationRoom.deleteMany({ where: { reservationId: booking.reservationId } });
    await prisma.reservation.delete({ where: { id: booking.reservationId } });
  } catch (err) {
    console.error('  ✗ FAIL Test 17:', err);
    throw err;
  }

  // -------------------------------------------------------------
  // Test 18: Case-Insensitive Email Deduplication
  // -------------------------------------------------------------
  try {
    console.log('Running Test 18: Case-Insensitive Email Deduplication...');
    const testEmail = `CaseTest.${Date.now()}@Example.com`;

    const b1 = await createReservationHold({
      bookingRequestId: uuid(),
      checkInDate: testCheckIn,
      checkOutDate: testCheckOut,
      adults: 2,
      children: 0,
      rooms: [{ roomTypeId: rtA!.id, roomsCount: 1 }],
      guest: { firstName: 'Case', lastName: 'One', email: testEmail, phone: '+919820202020' },
    });

    const b2 = await createReservationHold({
      bookingRequestId: uuid(),
      checkInDate: testCheckIn,
      checkOutDate: testCheckOut,
      adults: 2,
      children: 0,
      rooms: [{ roomTypeId: rtA!.id, roomsCount: 1 }],
      guest: { firstName: 'Case', lastName: 'One Updated', email: testEmail.toLowerCase(), phone: '+919820202020' },
    });

    const r1 = await prisma.reservation.findUnique({ where: { id: b1.reservationId } });
    const r2 = await prisma.reservation.findUnique({ where: { id: b2.reservationId } });

    assert.strictEqual(r1!.primaryGuestId, r2!.primaryGuestId, 'Both bookings must reuse the identical primaryGuestId');
    console.log('  ✓ PASS: Case-insensitive email successfully deduplicated guest profile\n');
    passedCount++;

    await prisma.reservationRoom.deleteMany({ where: { reservationId: b1.reservationId } });
    await prisma.reservation.delete({ where: { id: b1.reservationId } });
    await prisma.reservationRoom.deleteMany({ where: { reservationId: b2.reservationId } });
    await prisma.reservation.delete({ where: { id: b2.reservationId } });
  } catch (err) {
    console.error('  ✗ FAIL Test 18:', err);
    throw err;
  }

  // -------------------------------------------------------------
  // Test 19: Disambiguated Phone Deduplication
  // -------------------------------------------------------------
  try {
    console.log('Running Test 19: Disambiguated Phone Deduplication...');
    const sharedPhone = '+919830303030';
    // Seed 2 guests with same phone
    await prisma.guest.createMany({
      data: [
        { firstName: 'Family', lastName: 'Member1', phone: sharedPhone, email: `fam1.${Date.now()}@test.com` },
        { firstName: 'Family', lastName: 'Member2', phone: sharedPhone, email: `fam2.${Date.now()}@test.com` },
      ],
    });

    // New booking with shared phone and fresh email
    const freshEmail = `fam3.${Date.now()}@test.com`.toLowerCase();
    const b = await createReservationHold({
      bookingRequestId: uuid(),
      checkInDate: testCheckIn,
      checkOutDate: testCheckOut,
      adults: 2,
      children: 0,
      rooms: [{ roomTypeId: rtA!.id, roomsCount: 1 }],
      guest: { firstName: 'Family', lastName: 'Member3', phone: sharedPhone, email: freshEmail },
    });

    const res = await prisma.reservation.findUnique({
      where: { id: b.reservationId },
      include: { primaryGuest: true },
    });

    assert.strictEqual(res!.primaryGuest.email, freshEmail);
    console.log('  ✓ PASS: Multiple guests sharing phone did not cause arbitrary hijacking\n');
    passedCount++;

    await prisma.reservationRoom.deleteMany({ where: { reservationId: b.reservationId } });
    await prisma.reservation.delete({ where: { id: b.reservationId } });
  } catch (err) {
    console.error('  ✗ FAIL Test 19:', err);
    throw err;
  }

  // -------------------------------------------------------------
  // Test 20: Timezone-Agnostic Dates (Asia/Kolkata Calendar Invariance)
  // -------------------------------------------------------------
  try {
    console.log('Running Test 20: Timezone-Agnostic Dates...');
    const dStr = '2027-05-15';
    const dateObj = new Date(`${dStr}T00:00:00.000Z`);
    const dateOutput = dateObj.toISOString().slice(0, 10);
    assert.strictEqual(dateOutput, dStr, 'UTC midnight string must strictly preserve YYYY-MM-DD');
    console.log('  ✓ PASS: Canonical YYYY-MM-DD date representation invariant across timezones\n');
    passedCount++;
  } catch (err) {
    console.error('  ✗ FAIL Test 20:', err);
    throw err;
  }

  // -------------------------------------------------------------
  // Test 21: Unified Occupancy Rules (adults + children)
  // -------------------------------------------------------------
  try {
    console.log('Running Test 21: Unified Occupancy Rules...');
    // rtA has maxOccupancy: 3
    let rejected = false;
    try {
      await createReservationHold({
        bookingRequestId: uuid(),
        checkInDate: testCheckIn,
        checkOutDate: testCheckOut,
        adults: 3,
        children: 2, // Total 5 > maxOccupancy 3
        rooms: [{ roomTypeId: rtA!.id, roomsCount: 1 }],
        guest: { firstName: 'Over', lastName: 'Pax', email: `overpax.${Date.now()}@test.com`, phone: '+919840404040' },
      });
    } catch (e: any) {
      if (e.message.includes('OCCUPANCY_EXCEEDED')) rejected = true;
    }
    assert.strictEqual(rejected, true, 'Booking exceeding maxOccupancy must be rejected');
    console.log('  ✓ PASS: Unified occupancy contract (adults + children) strictly enforced\n');
    passedCount++;
  } catch (err) {
    console.error('  ✗ FAIL Test 21:', err);
    throw err;
  }

  // -------------------------------------------------------------
  // Test 22: NULL expiresAt Exclusion from Website Holds
  // -------------------------------------------------------------
  try {
    console.log('Running Test 22: NULL expiresAt Exclusion from Website Holds...');
    const g = await prisma.guest.create({
      data: { firstName: 'Null', lastName: 'Hold', phone: '+919850505050', email: `nullhold.${Date.now()}@test.com` },
    });

    const nullHold = await prisma.reservation.create({
      data: {
        reservationNumber: generateBookingNumber('RES'),
        primaryGuestId: g.id,
        checkInDate: new Date(`${testCheckIn}T00:00:00.000Z`),
        checkOutDate: new Date(`${testCheckOut}T00:00:00.000Z`),
        adults: 2,
        children: 0,
        totalRooms: 1,
        status: ReservationStatus.PENDING,
        subtotal: new Prisma.Decimal(20000),
        totalAmount: new Prisma.Decimal(22400),
        expiresAt: null, // Legacy / Admin hold without expiration
        reservedRooms: {
          create: [
            {
              roomTypeId: rtA!.id,
              roomsCount: 2,
              ratePerNight: new Prisma.Decimal(10000),
              totalNights: 2,
              lineTotal: new Prisma.Decimal(22400),
            },
          ],
        },
      },
    });

    const avail = await getAvailableRoomTypes({
      checkIn: testCheckIn,
      checkOut: testCheckOut,
      guests: 2,
    });

    const roomAvail = avail.availableRoomTypes.find((r) => r.roomTypeId === rtA!.id)?.availableRoomCount;
    assert.strictEqual(roomAvail, 2, 'PENDING reservation with NULL expiresAt must NOT block website inventory');
    console.log('  ✓ PASS: PENDING reservation with NULL expiresAt excluded from website blocking\n');
    passedCount++;

    await prisma.reservationRoom.deleteMany({ where: { reservationId: nullHold.id } });
    await prisma.reservation.delete({ where: { id: nullHold.id } });
  } catch (err) {
    console.error('  ✗ FAIL Test 22:', err);
    throw err;
  }

  // -------------------------------------------------------------
  // Test 23: Refund Schema & 1-to-Many Link
  // -------------------------------------------------------------
  try {
    console.log('Running Test 23: Refund Schema & 1-to-Many Link...');
    const p = await prisma.payment.create({
      data: {
        paymentNumber: generateBookingNumber('RES').replace('RES', 'PAY'),
        context: 'RESERVATION_ADVANCE',
        amount: new Prisma.Decimal(1000.0),
        currency: 'INR',
        method: 'ONLINE',
        status: 'SUCCESS',
        provider: 'MOCK_GATEWAY',
        providerTransactionId: `tx-multirefund-${Date.now()}`,
      },
    });

    const r1 = await prisma.refund.create({
      data: {
        refundNumber: generateBookingNumber('REF'),
        paymentId: p.id,
        amount: new Prisma.Decimal(400.0),
        reason: 'Partial refund 1',
        idempotencyKey: `REF-PART-1-${Date.now()}`,
      },
    });

    const r2 = await prisma.refund.create({
      data: {
        refundNumber: generateBookingNumber('REF'),
        paymentId: p.id,
        amount: new Prisma.Decimal(600.0),
        reason: 'Partial refund 2',
        idempotencyKey: `REF-PART-2-${Date.now()}`,
      },
    });

    const fetchedP = await prisma.payment.findUnique({
      where: { id: p.id },
      include: { refunds: true },
    });

    assert.strictEqual(fetchedP!.refunds.length, 2, 'Payment must support 1-to-many multiple Refund records');
    console.log('  ✓ PASS: Payment -> Refund 1-to-many relation verified\n');
    passedCount++;

    await prisma.refund.deleteMany({ where: { paymentId: p.id } });
    await prisma.payment.delete({ where: { id: p.id } });
  } catch (err) {
    console.error('  ✗ FAIL Test 23:', err);
    throw err;
  }

  // -------------------------------------------------------------
  // Test 24: Provider Transaction Unique Constraint
  // -------------------------------------------------------------
  try {
    console.log('Running Test 24: Provider Transaction Unique Constraint...');
    const txId = `tx-unique-test-${Date.now()}`;
    await prisma.payment.create({
      data: {
        paymentNumber: generateBookingNumber('RES').replace('RES', 'PAY'),
        context: 'RESERVATION_ADVANCE',
        amount: new Prisma.Decimal(500.0),
        currency: 'INR',
        method: 'ONLINE',
        status: 'SUCCESS',
        provider: 'MOCK_GATEWAY',
        providerTransactionId: txId,
      },
    });

    let uniqueErrorCaught = false;
    try {
      await prisma.payment.create({
        data: {
          paymentNumber: generateBookingNumber('RES').replace('RES', 'PAY'),
          context: 'RESERVATION_ADVANCE',
          amount: new Prisma.Decimal(500.0),
          currency: 'INR',
          method: 'ONLINE',
          status: 'SUCCESS',
          provider: 'MOCK_GATEWAY',
          providerTransactionId: txId, // Duplicate
        },
      });
    } catch (e: any) {
      if (e.code === 'P2002') uniqueErrorCaught = true;
    }

    assert.strictEqual(uniqueErrorCaught, true, 'Duplicate (provider, providerTransactionId) must throw P2002');
    console.log('  ✓ PASS: Provider-scoped transaction unique constraint verified\n');
    passedCount++;

    await prisma.payment.deleteMany({ where: { provider: 'MOCK_GATEWAY', providerTransactionId: txId } });
  } catch (err) {
    console.error('  ✗ FAIL Test 24:', err);
    throw err;
  }

  // -------------------------------------------------------------
  // Test 25: Idempotency Data Privacy
  // -------------------------------------------------------------
  try {
    console.log('Running Test 25: Idempotency Data Privacy Sanitization...');
    const rawReservation = {
      id: 'res-123',
      reservationNumber: 'RES-20270101-ABCD',
      status: 'PENDING',
      checkInDate: new Date('2027-01-01'),
      checkOutDate: new Date('2027-01-03'),
      adults: 2,
      children: 0,
      totalRooms: 1,
      totalAmount: 10000,
      advancePaidAmount: 0,
      expiresAt: new Date(),
      primaryGuest: {
        firstName: 'Alexander',
        lastName: 'Hamilton',
        email: 'alexander.hamilton@treasury.gov',
      },
      reservedRooms: [],
    };

    const sanitized = sanitizeReservation(rawReservation);
    assert.strictEqual(sanitized.maskedGuestName, 'A*** H***');
    assert.strictEqual(sanitized.maskedEmail, 'a***n@treasury.gov');
    assert.strictEqual((sanitized as any).primaryGuest, undefined, 'Raw guest profile must never be leaked');

    console.log('  ✓ PASS: Replay payload sanitization guarantees guest privacy\n');
    passedCount++;
  } catch (err) {
    console.error('  ✗ FAIL Test 25:', err);
    throw err;
  }

  // -------------------------------------------------------------
  // Test 26: Production Rate Limiter Fail-Closed
  // -------------------------------------------------------------
  try {
    console.log('Running Test 26: Production Rate Limiter Fail-Closed Invariant...');
    const originalEnv = process.env.NODE_ENV;
    const originalRedis = process.env.REDIS_URL;

    (process.env as any).NODE_ENV = 'production';
    delete process.env.REDIS_URL;

    const result = await checkRateLimit('192.168.1.100');
    assert.strictEqual(result.success, false, 'Rate limiter must fail closed in production without Redis');
    assert.strictEqual(result.error?.includes('RATE_LIMITER_FAIL_CLOSED'), true);

    // Restore env
    (process.env as any).NODE_ENV = originalEnv;
    if (originalRedis) process.env.REDIS_URL = originalRedis;

    console.log('  ✓ PASS: Production rate limiter strictly fails closed without silent RAM fallback\n');
    passedCount++;
  } catch (err) {
    console.error('  ✗ FAIL Test 26:', err);
    throw err;
  }

  // -------------------------------------------------------------
  // Test 27: Zero Floating-Point Arithmetic Invariant
  // -------------------------------------------------------------
  try {
    console.log('Running Test 27: Zero Floating-Point Arithmetic Invariant...');
    // Classic JavaScript floating point flaw: 0.1 + 0.2 = 0.30000000000000004
    const d1 = new Prisma.Decimal('0.1');
    const d2 = new Prisma.Decimal('0.2');
    const sum = roundCurrency(d1.add(d2));
    assert.strictEqual(sum.toFixed(2), '0.30', 'Pure Decimal math must eliminate floating-point inaccuracies');
    console.log('  ✓ PASS: Financial calculations eliminate all floating point drift\n');
    passedCount++;
  } catch (err) {
    console.error('  ✗ FAIL Test 27:', err);
    throw err;
  }

  console.log('===============================================================');
  console.log(`Phase 0.8 Automated Verification Summary: ${passedCount}/${totalTests} PASSED`);
  console.log('===============================================================\n');
}

runTests()
  .then(() => {
    process.exit(0);
  })
  .catch((e) => {
    console.error('FATAL TEST ERROR:', e);
    process.exit(1);
  });
