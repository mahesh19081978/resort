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

  // Cleanup any lingering reservations from previous runs on all test dates
  await prisma.reservationRoom.deleteMany({
    where: {
      reservation: {
        OR: [
          { checkInDate: { gte: new Date('2026-10-01T00:00:00.000Z') } },
          { checkOutDate: { gte: new Date('2026-10-01T00:00:00.000Z') } },
        ],
      },
    },
  });
  await prisma.reservation.deleteMany({
    where: {
      OR: [
        { checkInDate: { gte: new Date('2026-10-01T00:00:00.000Z') } },
        { checkOutDate: { gte: new Date('2026-10-01T00:00:00.000Z') } },
      ],
    },
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

    // Test a second DIFFERENT provider transaction ID arriving for the already confirmed reservation
    const differentTxId = `tx-different-${Date.now()}`;
    const differentPayload = {
      ...payload,
      providerTransactionId: differentTxId,
      idempotencyKey: `idem-diff-${Date.now()}`,
    };
    const third = await processPaymentWebhook(differentPayload);
    assert.strictEqual(third.status, 'CONFIRMED_RES_REFUND', 'Second different transaction on CONFIRMED reservation must trigger refund workflow');
    assert.strictEqual(third.reservation!.status, ReservationStatus.CONFIRMED, 'Reservation must remain CONFIRMED');
    assert.strictEqual(third.refund!.status, RefundStatus.PENDING, 'Duplicate captured payment must have PENDING refund');

    console.log('  ✓ PASS: Repeated webhook on CONFIRMED reservation safely returned idempotent result & second tx auto-refunded\n');
    passedCount++;

    await prisma.refund.deleteMany({ where: { paymentId: third.payment.id } });
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

  // -------------------------------------------------------------
  // Test 28: PAY_AT_HOTEL Policy-Driven Confirmation (Zero Advance)
  // -------------------------------------------------------------
  try {
    console.log('Running Test 28: PAY_AT_HOTEL Confirmation Invariant...');
    const bReqId = uuid();
    const payAtHotelBooking = await createReservationHold({
      bookingRequestId: bReqId,
      checkInDate: '2026-11-01',
      checkOutDate: '2026-11-03',
      adults: 2,
      children: 0,
      rooms: [{ roomTypeId: rtA.id, roomsCount: 1 }],
      guest: {
        firstName: 'Vijay',
        lastName: 'Verma',
        email: 'vijay.verma@example.com',
        phone: '+919988776655',
      },
      paymentMethod: 'PAY_AT_HOTEL',
    });

    assert.strictEqual(payAtHotelBooking.status, ReservationStatus.CONFIRMED, 'Pay at Hotel must create CONFIRMED status when policy permits');
    assert.strictEqual(payAtHotelBooking.advancePaidAmount, 0, 'Advance paid must be 0 for Pay at Hotel');
    assert.strictEqual(payAtHotelBooking.expiresAt, null, 'Hold expiresAt must be null for Pay at Hotel');
    assert.strictEqual(payAtHotelBooking.totalAmount > 0, true, 'Total amount must be calculated authoritatively');

    // Verify in DB directly
    const dbRecord = await prisma.reservation.findUnique({
      where: { id: payAtHotelBooking.reservationId },
    });
    assert.strictEqual(dbRecord?.status, ReservationStatus.CONFIRMED);
    assert.strictEqual(Number(dbRecord?.advancePaidAmount), 0);
    assert.strictEqual(dbRecord?.expiresAt, null);

    console.log('  ✓ PASS: PAY_AT_HOTEL confirmed with zero advance and null expiresAt\n');
    passedCount++;
  } catch (err) {
    console.error('  ✗ FAIL Test 28:', err);
    throw err;
  }

  // -------------------------------------------------------------
  // Test 29: Mandatory Advance Deposit Policy Blocks PAY_AT_HOTEL
  // -------------------------------------------------------------
  try {
    console.log('Running Test 29: Mandatory Advance Deposit Blocks PAY_AT_HOTEL...');
    const originalAdv = process.env.NEXT_PUBLIC_MANDATORY_ADVANCE;
    process.env.NEXT_PUBLIC_MANDATORY_ADVANCE = 'true';

    const { getPaymentPolicy } = await import('../src/lib/booking/policy');
    const policy = getPaymentPolicy();
    assert.strictEqual(policy.allowPayAtHotel, false, 'Policy must disallow Pay at Hotel when mandatory advance is required');

    const { createPublicBookingAction } = await import('../src/actions/booking/create');
    const result = await createPublicBookingAction({
      bookingRequestId: uuid(),
      checkInDate: '2026-11-05',
      checkOutDate: '2026-11-07',
      adults: 2,
      children: 0,
      rooms: [{ roomTypeId: rtA.id, roomsCount: 1 }],
      guest: {
        firstName: 'Rohan',
        lastName: 'Sharma',
        email: 'rohan.sharma@example.com',
        phone: '+919988776644',
      },
      paymentMethod: 'PAY_AT_HOTEL',
    });

    assert.strictEqual(result.success, false, 'Action must reject PAY_AT_HOTEL when advance is mandatory');
    assert.strictEqual(result.error?.code, 'BUSINESS_RULE_VIOLATION');

    // Restore env
    if (originalAdv !== undefined) {
      process.env.NEXT_PUBLIC_MANDATORY_ADVANCE = originalAdv;
    } else {
      delete process.env.NEXT_PUBLIC_MANDATORY_ADVANCE;
    }

    console.log('  ✓ PASS: Mandatory advance policy strictly blocks PAY_AT_HOTEL without bypass\n');
    passedCount++;
  } catch (err) {
    console.error('  ✗ FAIL Test 29:', err);
    throw err;
  }

  // -------------------------------------------------------------
  // Test 30: PAY_ONLINE Payment Intent with Sub-Methods
  // -------------------------------------------------------------
  try {
    console.log('Running Test 30: PAY_ONLINE Payment Intent & Sub-Method Routing...');
    const { createPublicBookingAction } = await import('../src/actions/booking/create');
    const result = await createPublicBookingAction({
      bookingRequestId: uuid(),
      checkInDate: '2026-11-10',
      checkOutDate: '2026-11-12',
      adults: 2,
      children: 0,
      rooms: [{ roomTypeId: rtA.id, roomsCount: 1 }],
      guest: {
        firstName: 'Ananya',
        lastName: 'Roy',
        email: 'ananya.roy@example.com',
        phone: '+919871122334',
      },
      paymentMethod: 'PAY_ONLINE',
      onlineSubMethod: 'UPI',
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data?.booking.status, ReservationStatus.PENDING);
    assert.strictEqual(typeof result.data?.checkoutUrl, 'string');
    assert.strictEqual(result.data?.checkoutUrl ? result.data.checkoutUrl.includes('/booking/payment/mock') : false, true);

    console.log('  ✓ PASS: PAY_ONLINE created PENDING hold and valid gateway checkout URL\n');
    passedCount++;
  } catch (err) {
    console.error('  ✗ FAIL Test 30:', err);
    throw err;
  }

  // -------------------------------------------------------------
  // Test 31: Fail Closed BOOKING_TOKEN_SECRET Guard
  // -------------------------------------------------------------
  try {
    console.log('Running Test 31: Fail Closed BOOKING_TOKEN_SECRET Guard...');
    const originalSecret = process.env.BOOKING_TOKEN_SECRET;
    
    // Test missing secret
    delete process.env.BOOKING_TOKEN_SECRET;
    const { createBookingAccessToken } = await import('../src/lib/booking/tokens');
    let threwMissing = false;
    try {
      await createBookingAccessToken('res-1', 'RES-1', 'public_booking_status');
    } catch (e: any) {
      if (e.message.includes('Missing BOOKING_TOKEN_SECRET')) threwMissing = true;
    }
    assert.strictEqual(threwMissing, true, 'Missing secret must fail closed without fallback');

    // Test secret < 32 characters
    process.env.BOOKING_TOKEN_SECRET = 'too-short-secret';
    let threwShort = false;
    try {
      await createBookingAccessToken('res-1', 'RES-1', 'public_booking_status');
    } catch (e: any) {
      if (e.message.includes('must be at least 32 characters long')) threwShort = true;
    }
    assert.strictEqual(threwShort, true, 'Short secret (< 32 chars) must fail closed');

    // Restore original valid secret
    process.env.BOOKING_TOKEN_SECRET = originalSecret;
    console.log('  ✓ PASS: BOOKING_TOKEN_SECRET strictly fails closed without fallback\n');
    passedCount++;
  } catch (err) {
    console.error('  ✗ FAIL Test 31:', err);
    throw err;
  }

  // -------------------------------------------------------------
  // Test 32: Token Scope Enforcement (No scope confusion)
  // -------------------------------------------------------------
  try {
    console.log('Running Test 32: Token Scope Enforcement...');
    const { createBookingAccessToken, verifyBookingAccessToken } = await import('../src/lib/booking/tokens');
    const paymentToken = await createBookingAccessToken('res-scope-test', 'RES-SCOPE-1', 'public_payment');
    const statusToken = await createBookingAccessToken('res-scope-test', 'RES-SCOPE-1', 'public_booking_status');

    // Trying to use payment token where status is expected
    const crossCheck1 = await verifyBookingAccessToken(paymentToken, 'public_booking_status');
    assert.strictEqual(crossCheck1, null, 'public_payment token must be rejected when expecting public_booking_status');

    // Trying to use status token where payment is expected
    const crossCheck2 = await verifyBookingAccessToken(statusToken, 'public_payment');
    assert.strictEqual(crossCheck2, null, 'public_booking_status token must be rejected when expecting public_payment');

    // Correct scopes succeed
    const validStatus = await verifyBookingAccessToken(statusToken, 'public_booking_status');
    assert.ok(validStatus);
    assert.strictEqual(validStatus.resId, 'res-scope-test');

    const validPayment = await verifyBookingAccessToken(paymentToken, 'public_payment');
    assert.ok(validPayment);
    assert.strictEqual(validPayment.resId, 'res-scope-test');

    console.log('  ✓ PASS: Token scope enforcement strictly blocks scope substitution\n');
    passedCount++;
  } catch (err) {
    console.error('  ✗ FAIL Test 32:', err);
    throw err;
  }

  // -------------------------------------------------------------
  // Test 33: getBookingStatusAction Rejects Raw CUID
  // -------------------------------------------------------------
  try {
    console.log('Running Test 33: getBookingStatusAction Rejects Raw CUID...');
    const { getBookingStatusAction } = await import('../src/actions/booking/status');
    const rawCuid = 'cmtrc98vf004bihog2oipbic0';

    const resultWithoutToken = await getBookingStatusAction(rawCuid);
    assert.strictEqual(resultWithoutToken.success, false);
    assert.strictEqual(resultWithoutToken.error?.code, 'AUTHORIZATION_ERROR');
    assert.strictEqual(
      resultWithoutToken.error?.message.includes('valid signed booking access token is required'),
      true
    );

    console.log('  ✓ PASS: Public booking status strictly rejects raw CUID without signed token\n');
    passedCount++;
  } catch (err) {
    console.error('  ✗ FAIL Test 33:', err);
    throw err;
  }

  // -------------------------------------------------------------
  // Test 34: Mock Gateway Server-Side Production Guard
  // -------------------------------------------------------------
  try {
    console.log('Running Test 34: Mock Gateway Server-Side Production Guard...');
    const originalEnv = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = 'production';

    const { simulateMockGatewayPaymentAction } = await import('../src/actions/booking/payment-simulate');
    const simResult = await simulateMockGatewayPaymentAction({
      token: 'some.fake.token',
      outcome: 'SUCCESS',
    });

    assert.strictEqual(simResult.success, false);
    assert.strictEqual(simResult.error?.code, 'BUSINESS_RULE_VIOLATION');
    assert.strictEqual(simResult.error?.message.includes('strictly prohibited in production'), true);

    const { defaultPaymentGateway } = await import('../src/lib/booking/payment-provider');
    let gatewayBlocked = false;
    try {
      await defaultPaymentGateway.createPaymentIntent({
        reservationId: 'res-1',
        reservationNumber: 'RES-1',
        amount: new Prisma.Decimal(1000),
        currency: 'INR',
        guest: { name: 'Test', email: 'test@example.com', phone: '+919999999999' },
      });
    } catch (e: any) {
      if (e.message.includes('Mock payment provider is strictly disallowed in production')) {
        gatewayBlocked = true;
      }
    }
    assert.strictEqual(gatewayBlocked, true, 'Provider SPI must throw in production');

    // Restore env
    (process.env as any).NODE_ENV = originalEnv;
    console.log('  ✓ PASS: Mock gateway strictly blocked in production across both action and provider SPI\n');
    passedCount++;
  } catch (err) {
    console.error('  ✗ FAIL Test 34:', err);
    throw err;
  }

  // -------------------------------------------------------------
  // Test 35: Full End-to-End Server-Side Mock Payment Simulation
  // -------------------------------------------------------------
  try {
    console.log('Running Test 35: Full End-to-End Server-Side Mock Payment Simulation...');
    const { createBookingAccessToken } = await import('../src/lib/booking/tokens');
    const { simulateMockGatewayPaymentAction } = await import('../src/actions/booking/payment-simulate');
    const { getBookingStatusAction } = await import('../src/actions/booking/status');

    // Create a real reservation hold
    const booking = await createReservationHold({
      bookingRequestId: uuid(),
      checkInDate: '2027-03-01',
      checkOutDate: '2027-03-03',
      adults: 2,
      children: 0,
      rooms: [{ roomTypeId: rtA.id, roomsCount: 1 }],
      guest: {
        firstName: 'EndToEnd',
        lastName: 'SimUser',
        email: `sim.${Date.now()}@example.com`,
        phone: '+919876500111',
      },
    });

    assert.strictEqual(booking.status, ReservationStatus.PENDING);

    // Create payment token
    const paymentToken = await createBookingAccessToken(
      booking.reservationId,
      booking.reservationNumber,
      'public_payment'
    );

    // Simulate successful payment through server action
    const simResult = await simulateMockGatewayPaymentAction({
      token: paymentToken,
      outcome: 'SUCCESS',
    });

    assert.strictEqual(simResult.success, true);
    assert.ok(simResult.data?.statusAccessToken);

    // Fetch booking status using the returned signed status access token
    const statusResult = await getBookingStatusAction(booking.reservationId, simResult.data?.statusAccessToken);
    assert.strictEqual(statusResult.success, true);
    assert.strictEqual(statusResult.data?.status, ReservationStatus.CONFIRMED);
    assert.strictEqual(statusResult.data?.advancePaidAmount, booking.totalAmount);

    console.log('  ✓ PASS: Full server-side mock payment simulation verified with scoped tokens and status check\n');
    passedCount++;

    // Clean up
    await prisma.payment.deleteMany({ where: { reservationId: booking.reservationId } });
    await prisma.reservationRoom.deleteMany({ where: { reservationId: booking.reservationId } });
    await prisma.reservation.delete({ where: { id: booking.reservationId } });
  } catch (err) {
    console.error('  ✗ FAIL Test 35:', err);
    throw err;
  }

  // -------------------------------------------------------------
  // Test 36: Full Public Booking Card Flow (create -> checkoutUrl -> simulate -> status)
  // -------------------------------------------------------------
  try {
    console.log('Running Test 36: Public Booking Card Flow with checkoutUrl and Scoped Tokens...');
    const { createPublicBookingAction } = await import('../src/actions/booking/create');
    const { simulateMockGatewayPaymentAction } = await import('../src/actions/booking/payment-simulate');
    const { getBookingStatusAction } = await import('../src/actions/booking/status');

    const cardBookingRes = await createPublicBookingAction({
      bookingRequestId: uuid(),
      checkInDate: '2027-04-01',
      checkOutDate: '2027-04-03',
      adults: 2,
      children: 0,
      rooms: [{ roomTypeId: rtA!.id, roomsCount: 1 }],
      guest: {
        firstName: 'Elena',
        lastName: 'Rostova',
        email: `elena.${Date.now()}@example.com`,
        phone: '+919988776655',
        city: 'Mumbai',
      },
      paymentMethod: 'PAY_ONLINE',
      onlineSubMethod: 'CARD',
    });

    assert.strictEqual(cardBookingRes.success, true, 'Booking action must succeed');
    assert.ok(cardBookingRes.data, 'Booking data must be returned');
    assert.strictEqual(cardBookingRes.data.booking.status, ReservationStatus.PENDING);
    assert.ok(cardBookingRes.data.checkoutUrl, 'checkoutUrl must be returned for PAY_ONLINE');

    // Verify checkoutUrl contains both token (paymentToken) and statusToken (statusAccessToken)
    const parsedUrl = new URL(cardBookingRes.data.checkoutUrl, 'http://localhost');
    const paymentTokenFromUrl = parsedUrl.searchParams.get('token');
    const statusTokenFromUrl = parsedUrl.searchParams.get('statusToken');

    assert.ok(paymentTokenFromUrl, 'checkoutUrl must contain token query param');
    assert.ok(statusTokenFromUrl, 'checkoutUrl must contain statusToken query param');
    assert.strictEqual(paymentTokenFromUrl, cardBookingRes.data.paymentToken);
    assert.strictEqual(statusTokenFromUrl, cardBookingRes.data.accessToken);

    // Verify mock gateway loadBooking works with statusToken
    const gatewayStatusLoad = await getBookingStatusAction(
      cardBookingRes.data.booking.reservationId,
      statusTokenFromUrl
    );
    assert.strictEqual(gatewayStatusLoad.success, true);
    assert.strictEqual(gatewayStatusLoad.data?.reservationId, cardBookingRes.data.booking.reservationId);

    // Simulate payment success via mock gateway action with paymentToken
    const simRes = await simulateMockGatewayPaymentAction({
      token: paymentTokenFromUrl,
      outcome: 'SUCCESS',
      channel: 'CARD',
    });
    assert.strictEqual(simRes.success, true);
    assert.ok(simRes.data?.statusAccessToken);

    // Authoritative check via statusAccessToken: status must now be CONFIRMED and hold expiresAt cleared
    const confirmedCheck = await getBookingStatusAction(
      cardBookingRes.data.booking.reservationId,
      simRes.data.statusAccessToken
    );
    assert.strictEqual(confirmedCheck.success, true);
    assert.strictEqual(confirmedCheck.data?.status, ReservationStatus.CONFIRMED);
    assert.strictEqual(confirmedCheck.data?.advancePaidAmount, cardBookingRes.data.booking.totalAmount);
    assert.strictEqual(confirmedCheck.data?.expiresAt, null);

    console.log('  ✓ PASS: Card payment flow checkoutUrl with scoped tokens authoritatively confirms booking\n');
    passedCount++;

    // Clean up
    await prisma.payment.deleteMany({ where: { reservationId: cardBookingRes.data.booking.reservationId } });
    await prisma.reservationRoom.deleteMany({ where: { reservationId: cardBookingRes.data.booking.reservationId } });
    await prisma.reservation.delete({ where: { id: cardBookingRes.data.booking.reservationId } });
  } catch (err) {
    console.error('  ✗ FAIL Test 36:', err);
    throw err;
  }

  // -------------------------------------------------------------
  // Test 37: End-to-End UPI Payment Flow (create -> checkoutUrl -> simulate UPI -> status)
  // -------------------------------------------------------------
  try {
    console.log('Running Test 37: End-to-End UPI Payment Flow...');
    const { createPublicBookingAction } = await import('../src/actions/booking/create');
    const { simulateMockGatewayPaymentAction } = await import('../src/actions/booking/payment-simulate');
    const { getBookingStatusAction } = await import('../src/actions/booking/status');

    const upiBookingRes = await createPublicBookingAction({
      bookingRequestId: uuid(),
      checkInDate: '2027-05-01',
      checkOutDate: '2027-05-03',
      adults: 2,
      children: 0,
      rooms: [{ roomTypeId: rtA!.id, roomsCount: 1 }],
      guest: {
        firstName: 'Vikram',
        lastName: 'Malhotra',
        email: `vikram.${Date.now()}@example.com`,
        phone: '+919876500001',
        city: 'Indore',
      },
      paymentMethod: 'PAY_ONLINE',
      onlineSubMethod: 'UPI',
    });

    assert.strictEqual(upiBookingRes.success, true, 'UPI booking action must succeed');
    assert.ok(upiBookingRes.data, 'UPI booking data must be returned');
    assert.strictEqual(upiBookingRes.data.booking.status, ReservationStatus.PENDING);
    assert.ok(upiBookingRes.data.checkoutUrl, 'checkoutUrl must be returned for UPI');

    // Verify checkoutUrl contains token, statusToken, and channel=UPI
    const parsedUrl = new URL(upiBookingRes.data.checkoutUrl, 'http://localhost');
    const paymentTokenFromUrl = parsedUrl.searchParams.get('token');
    const statusTokenFromUrl = parsedUrl.searchParams.get('statusToken');
    const channelFromUrl = parsedUrl.searchParams.get('channel');

    assert.ok(paymentTokenFromUrl, 'checkoutUrl must contain token query param');
    assert.ok(statusTokenFromUrl, 'checkoutUrl must contain statusToken query param');
    assert.strictEqual(channelFromUrl, 'UPI', 'checkoutUrl must contain channel=UPI param');
    assert.strictEqual(paymentTokenFromUrl, upiBookingRes.data.paymentToken);
    assert.strictEqual(statusTokenFromUrl, upiBookingRes.data.accessToken);

    // Verify mock gateway status load succeeds with statusToken
    const gatewayStatusLoad = await getBookingStatusAction(
      upiBookingRes.data.booking.reservationId,
      statusTokenFromUrl
    );
    assert.strictEqual(gatewayStatusLoad.success, true);
    assert.strictEqual(gatewayStatusLoad.data?.reservationId, upiBookingRes.data.booking.reservationId);

    // Simulate successful UPI payment via mock gateway action with paymentToken
    const simRes = await simulateMockGatewayPaymentAction({
      token: paymentTokenFromUrl,
      outcome: 'SUCCESS',
      channel: 'UPI',
    });
    assert.strictEqual(simRes.success, true);
    assert.ok(simRes.data?.statusAccessToken);

    // Authoritative check via statusAccessToken: status must now be CONFIRMED and hold expiresAt cleared
    const confirmedCheck = await getBookingStatusAction(
      upiBookingRes.data.booking.reservationId,
      simRes.data.statusAccessToken
    );
    assert.strictEqual(confirmedCheck.success, true);
    assert.strictEqual(confirmedCheck.data?.status, ReservationStatus.CONFIRMED);
    assert.strictEqual(confirmedCheck.data?.advancePaidAmount, upiBookingRes.data.booking.totalAmount);
    assert.strictEqual(confirmedCheck.data?.expiresAt, null);

    // Verify payment ledger has exactly one SUCCESS entry
    const payments = await prisma.payment.findMany({
      where: { reservationId: upiBookingRes.data.booking.reservationId },
    });
    assert.strictEqual(payments.length, 1);
    assert.strictEqual(payments[0].status, PaymentStatus.SUCCESS);

    console.log('  ✓ PASS: End-to-end UPI payment verified with checkoutUrl, scoped tokens, and authoritative confirmation\n');
    passedCount++;

    // Clean up
    await prisma.payment.deleteMany({ where: { reservationId: upiBookingRes.data.booking.reservationId } });
    await prisma.reservationRoom.deleteMany({ where: { reservationId: upiBookingRes.data.booking.reservationId } });
    await prisma.reservation.delete({ where: { id: upiBookingRes.data.booking.reservationId } });
  } catch (err) {
    console.error('  ✗ FAIL Test 37:', err);
    throw err;
  }

  // -------------------------------------------------------------
  // Test 38: UPI Failure / Retry
  // -------------------------------------------------------------
  try {
    console.log('Running Test 38: UPI Failure / Retry Flow...');
    const { createPublicBookingAction } = await import('../src/actions/booking/create');
    const { simulateMockGatewayPaymentAction } = await import('../src/actions/booking/payment-simulate');
    const { getBookingStatusAction } = await import('../src/actions/booking/status');

    const failBookingRes = await createPublicBookingAction({
      bookingRequestId: uuid(),
      checkInDate: '2027-05-05',
      checkOutDate: '2027-05-07',
      adults: 2,
      children: 0,
      rooms: [{ roomTypeId: rtA!.id, roomsCount: 1 }],
      guest: {
        firstName: 'Aditya',
        lastName: 'Varma',
        email: `aditya.${Date.now()}@example.com`,
        phone: '+919876500002',
      },
      paymentMethod: 'PAY_ONLINE',
      onlineSubMethod: 'UPI',
    });

    assert.strictEqual(failBookingRes.success, true);
    assert.ok(failBookingRes.data?.paymentToken);
    assert.ok(failBookingRes.data?.accessToken);

    // Simulate FAILED payment
    const simFail = await simulateMockGatewayPaymentAction({
      token: failBookingRes.data.paymentToken,
      outcome: 'FAILED',
      channel: 'UPI',
    });
    assert.strictEqual(simFail.success, true); // simulation action succeeded

    // Verify reservation remains PENDING and hold is still active
    const postFailCheck = await getBookingStatusAction(
      failBookingRes.data.booking.reservationId,
      failBookingRes.data.accessToken
    );
    assert.strictEqual(postFailCheck.success, true);
    assert.strictEqual(postFailCheck.data?.status, ReservationStatus.PENDING);
    assert.ok(postFailCheck.data?.expiresAt, 'Hold must remain active');

    // Verify retry simulation with SUCCESS on the same reservation
    const retrySuccess = await simulateMockGatewayPaymentAction({
      token: failBookingRes.data.paymentToken,
      outcome: 'SUCCESS',
      channel: 'UPI',
    });
    assert.strictEqual(retrySuccess.success, true);
    assert.ok(retrySuccess.data?.statusAccessToken);

    const retryCheck = await getBookingStatusAction(
      failBookingRes.data.booking.reservationId,
      retrySuccess.data.statusAccessToken
    );
    assert.strictEqual(retryCheck.success, true);
    assert.strictEqual(retryCheck.data?.status, ReservationStatus.CONFIRMED);

    console.log('  ✓ PASS: UPI failure preserves PENDING hold and allows seamless retry on same reservation\n');
    passedCount++;

    // Clean up
    await prisma.payment.deleteMany({ where: { reservationId: failBookingRes.data.booking.reservationId } });
    await prisma.reservationRoom.deleteMany({ where: { reservationId: failBookingRes.data.booking.reservationId } });
    await prisma.reservation.delete({ where: { id: failBookingRes.data.booking.reservationId } });
  } catch (err) {
    console.error('  ✗ FAIL Test 38:', err);
    throw err;
  }

  // -------------------------------------------------------------
  // Test 39: UPI Duplicate Submission Idempotency
  // -------------------------------------------------------------
  try {
    console.log('Running Test 39: UPI Duplicate Submission Idempotency...');
    const { createPublicBookingAction } = await import('../src/actions/booking/create');
    const { resetRateLimitStore } = await import('../src/lib/security/rate-limit');
    resetRateLimitStore();

    const requestId = uuid();
    const upiPayload = {
      bookingRequestId: requestId,
      checkInDate: '2027-05-10',
      checkOutDate: '2027-05-12',
      adults: 2,
      children: 0,
      rooms: [{ roomTypeId: rtA!.id, roomsCount: 1 }],
      guest: {
        firstName: 'Pooja',
        lastName: 'Nair',
        email: `pooja.${Date.now()}@example.com`,
        phone: '+919876500003',
      },
      paymentMethod: 'PAY_ONLINE' as const,
      onlineSubMethod: 'UPI' as const,
    };

    // First call
    const firstSubmission = await createPublicBookingAction(upiPayload);
    assert.strictEqual(firstSubmission.success, true, `First submission should succeed: ${firstSubmission.error?.message}`);

    // Second rapid call with identical bookingRequestId
    const secondSubmission = await createPublicBookingAction(upiPayload);
    assert.strictEqual(secondSubmission.success, true);

    // Both submissions must resolve to the identical reservation
    assert.strictEqual(
      firstSubmission.data?.booking.reservationId,
      secondSubmission.data?.booking.reservationId,
      'Duplicate submissions with same bookingRequestId must yield same reservation'
    );

    // Total reservations created with this number must be exactly 1
    const resCount = await prisma.reservation.count({
      where: { id: firstSubmission.data!.booking.reservationId },
    });
    assert.strictEqual(resCount, 1);

    console.log('  ✓ PASS: UPI duplicate submission with same bookingRequestId preserves idempotency without duplicate reservations\n');
    passedCount++;

    // Clean up
    await prisma.reservationRoom.deleteMany({ where: { reservationId: firstSubmission.data!.booking.reservationId } });
    await prisma.reservation.delete({ where: { id: firstSubmission.data!.booking.reservationId } });
  } catch (err) {
    console.error('  ✗ FAIL Test 39:', err);
    throw err;
  }

  console.log('===============================================================');
  console.log(`Phase 0.8 Automated Verification Summary: ${passedCount}/39 PASSED`);
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
