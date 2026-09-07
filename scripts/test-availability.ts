/**
 * INTEGRATION TEST SUITE: PUBLIC ROOM AVAILABILITY SEARCH
 *
 * Verifies all critical availability invariants against Neon PostgreSQL:
 *
 * A. Date Validation
 * B. Occupancy Validation
 * C. Inventory Validation
 * D. Reservation Overlap
 * E. Results Validation
 * F. Security
 * G. Regression — Stay Date Boundaries & Deduplication
 */

import { prisma } from '../src/lib/db/prisma';
import { availabilitySearchSchema } from '../src/lib/availability/schema';
import { getAvailableRoomTypes } from '../src/lib/availability/service';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✅ ${message}`);
}

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) {
    console.error(`❌ ASSERTION FAILED: ${message} — expected ${expected}, got ${actual}`);
    throw new Error(`${message} — expected ${expected}, got ${actual}`);
  }
  console.log(`  ✅ ${message}`);
}

async function cleanupTestData() {
  await prisma.reservation.deleteMany({
    where: { reservationNumber: { startsWith: 'TEST-AVAIL-' } },
  });
  await prisma.stay.deleteMany({
    where: { stayNumber: { startsWith: 'TEST-STAY-' } },
  });
}

async function getOrCreateTestGuest() {
  let guest = await prisma.guest.findFirst({ where: { email: 'test-avail-guest@example.com' } });
  if (!guest) {
    guest = await prisma.guest.create({
      data: {
        firstName: 'Test',
        lastName: 'AvailabilityGuest',
        email: 'test-avail-guest@example.com',
        phone: '+919999999999',
      },
    });
  }
  return guest;
}

async function seedTestReservation(params: {
  reservationNumber: string;
  roomTypeId: string;
  checkInDate: Date;
  checkOutDate: Date;
  roomsCount: number;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
}) {
  const guest = await getOrCreateTestGuest();
  const nights = Math.round(
    (params.checkOutDate.getTime() - params.checkInDate.getTime()) / 86400000
  );

  return prisma.reservation.create({
    data: {
      reservationNumber: params.reservationNumber,
      primaryGuestId: guest.id,
      checkInDate: params.checkInDate,
      checkOutDate: params.checkOutDate,
      adults: 2,
      totalRooms: params.roomsCount,
      status: params.status,
      subtotal: 0,
      totalAmount: 0,
      reservedRooms: {
        create: {
          roomTypeId: params.roomTypeId,
          roomsCount: params.roomsCount,
          ratePerNight: 0,
          totalNights: nights,
          lineTotal: 0,
        },
      },
    },
  });
}

async function seedTestStay(params: {
  stayNumber: string;
  roomId: string;
  actualCheckIn: Date;
  expectedCheckOut: Date;
  actualCheckOut?: Date | null;
  reservationId?: string;
}) {
  const guest = await getOrCreateTestGuest();

  const stay = await prisma.stay.create({
    data: {
      stayNumber: params.stayNumber,
      primaryGuestId: guest.id,
      reservationId: params.reservationId ?? null,
      actualCheckIn: params.actualCheckIn,
      expectedCheckOut: params.expectedCheckOut,
      actualCheckOut: params.actualCheckOut ?? null,
      status: 'ACTIVE',
      roomAssignments: {
        create: {
          roomId: params.roomId,
          status: 'ACTIVE',
        },
      },
    },
  });

  return stay;
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING PUBLIC ROOM AVAILABILITY INTEGRATION TEST SUITE');
  console.log('================================================================\n');

  await cleanupTestData();

  // Load room types from the database
  const standardRoom = await prisma.roomType.findUniqueOrThrow({ where: { code: 'STD' } });
  const deluxeRoom = await prisma.roomType.findUniqueOrThrow({ where: { code: 'DLX' } });
  const villaRoom = await prisma.roomType.findUniqueOrThrow({ where: { code: 'VILLA' } });
  const poolViewRoom = await prisma.roomType.findUniqueOrThrow({ where: { code: 'POOL-VIEW' } });

  const standardRoomCount = await prisma.room.count({
    where: { roomTypeId: standardRoom.id, isActive: true },
  });
  const deluxeRoomCount = await prisma.room.count({
    where: { roomTypeId: deluxeRoom.id, isActive: true },
  });
  const villaRoomCount = await prisma.room.count({
    where: { roomTypeId: villaRoom.id, isActive: true },
  });
  const poolViewRoomCount = await prisma.room.count({
    where: { roomTypeId: poolViewRoom.id, isActive: true },
  });

  // Use dates far in the future to avoid interference with real data
  const today = new Date();
  const futureDate = new Date(today);
  futureDate.setDate(futureDate.getDate() + 60);
  const futureDateStr = futureDate.toISOString().split('T')[0];

  const nextDay = new Date(futureDate);
  nextDay.setDate(nextDay.getDate() + 1);
  const nextDayStr = nextDay.toISOString().split('T')[0];

  const threeDaysLater = new Date(futureDate);
  threeDaysLater.setDate(threeDaysLater.getDate() + 3);
  const threeDaysLaterStr = threeDaysLater.toISOString().split('T')[0];

  // Get baseline available count for the test date range (60 days from now)
  // Existing active stays have expectedCheckOut ≈ tomorrow, so they don't overlap
  // with the test dates — all physical rooms should be available.
  const baselineAvailability = await getAvailableRoomTypes({
    checkIn: futureDateStr,
    checkOut: nextDayStr,
    guests: 2,
  });
  const standardBaseline =
    baselineAvailability.availableRoomTypes.find((r) => r.roomTypeId === standardRoom.id)
      ?.availableRoomCount ?? standardRoomCount;

  console.log('📋 BASELINE DATA:');
  console.log(
    `   Standard Heritage Room: ${standardRoom.maxOccupancy} max, ${standardRoomCount} rooms (${standardBaseline} currently available)`
  );
  console.log(`   Deluxe Heritage Suite: ${deluxeRoom.maxOccupancy} max, ${deluxeRoomCount} rooms`);
  console.log(
    `   Royal Forest Chalet Villa: ${villaRoom.maxOccupancy} max, ${villaRoomCount} rooms`
  );
  console.log(`   Pool View Room: ${poolViewRoom.maxOccupancy} max, ${poolViewRoomCount} rooms`);
  console.log('');

  // ═══════════════════════════════════════════
  // A. DATE VALIDATION
  // ═══════════════════════════════════════════
  console.log('─── A. DATE VALIDATION ───');

  {
    const result = availabilitySearchSchema.safeParse({
      checkIn: futureDateStr,
      checkOut: nextDayStr,
      guests: 2,
    });
    assert(result.success, 'A1: Valid 1-night stay is accepted');
  }

  {
    const result = availabilitySearchSchema.safeParse({
      checkIn: futureDateStr,
      checkOut: threeDaysLaterStr,
      guests: 2,
    });
    assert(result.success, 'A2: Valid multi-night stay is accepted');
  }

  {
    const result = availabilitySearchSchema.safeParse({
      checkIn: nextDayStr,
      checkOut: futureDateStr,
      guests: 2,
    });
    assert(!result.success, 'A3: Checkout before check-in is rejected');
  }

  {
    const result = availabilitySearchSchema.safeParse({
      checkIn: futureDateStr,
      checkOut: futureDateStr,
      guests: 2,
    });
    assert(!result.success, 'A4: Checkout equal to check-in is rejected');
  }

  {
    const pastDate = new Date(today);
    pastDate.setDate(pastDate.getDate() - 5);
    const pastDateStr = pastDate.toISOString().split('T')[0];
    const nextDayOfPast = new Date(pastDate);
    nextDayOfPast.setDate(nextDayOfPast.getDate() + 1);

    const result = availabilitySearchSchema.safeParse({
      checkIn: pastDateStr,
      checkOut: nextDayOfPast.toISOString().split('T')[0],
      guests: 2,
    });
    assert(!result.success, 'A5: Past check-in date is rejected');
  }

  {
    const result = availabilitySearchSchema.safeParse({
      checkIn: 'abc',
      checkOut: nextDayStr,
      guests: 2,
    });
    assert(!result.success, 'A6: Malformed date is rejected');
  }

  console.log('');

  // ═══════════════════════════════════════════
  // B. OCCUPANCY VALIDATION
  // ═══════════════════════════════════════════
  console.log('─── B. OCCUPANCY VALIDATION ───');

  {
    const availability = await getAvailableRoomTypes({
      checkIn: futureDateStr,
      checkOut: nextDayStr,
      guests: 2,
    });
    const stdType = availability.availableRoomTypes.find((r) => r.roomTypeId === standardRoom.id);
    assert(stdType !== undefined, 'B1: Standard room available for 2 guests');
  }

  {
    const availability = await getAvailableRoomTypes({
      checkIn: futureDateStr,
      checkOut: nextDayStr,
      guests: 3,
    });
    const stdType = availability.availableRoomTypes.find((r) => r.roomTypeId === standardRoom.id);
    assert(stdType === undefined, 'B2: Standard room NOT available for 3 guests (max 2)');
  }

  {
    const availability = await getAvailableRoomTypes({
      checkIn: futureDateStr,
      checkOut: nextDayStr,
      guests: 3,
    });
    const stdType = availability.availableRoomTypes.find((r) => r.roomTypeId === standardRoom.id);
    const dlxType = availability.availableRoomTypes.find((r) => r.roomTypeId === deluxeRoom.id);
    const villaType = availability.availableRoomTypes.find((r) => r.roomTypeId === villaRoom.id);
    assert(stdType === undefined, 'B3a: Standard (max 2) excluded for 3 guests');
    assert(dlxType !== undefined, 'B3b: Deluxe (max 3) included for 3 guests');
    assert(villaType !== undefined, 'B3c: Villa (max 4) included for 3 guests');
  }

  console.log('');

  // ═══════════════════════════════════════════
  // C. INVENTORY VALIDATION
  // ═══════════════════════════════════════════
  console.log('─── C. INVENTORY VALIDATION ───');

  {
    const availability = await getAvailableRoomTypes({
      checkIn: futureDateStr,
      checkOut: nextDayStr,
      guests: 2,
    });
    const stdType = availability.availableRoomTypes.find((r) => r.roomTypeId === standardRoom.id);
    assert(stdType !== undefined, 'C1: Standard room (10 physical rooms) is available');
    assertEqual(
      stdType!.availableRoomCount,
      standardBaseline,
      'C1b: Standard available count matches baseline'
    );
  }

  {
    const availability = await getAvailableRoomTypes({
      checkIn: futureDateStr,
      checkOut: nextDayStr,
      guests: 2,
    });
    const poolType = availability.availableRoomTypes.find(
      (r) => r.roomTypeId === poolViewRoom.id
    );
    assert(poolType === undefined, 'C2: Pool View Room (0 physical rooms) is NOT available');
  }

  console.log('');

  // ═══════════════════════════════════════════
  // D. RESERVATION OVERLAP
  // ═══════════════════════════════════════════
  console.log('─── D. RESERVATION OVERLAP ───');

  await seedTestReservation({
    reservationNumber: 'TEST-AVAIL-001',
    roomTypeId: standardRoom.id,
    checkInDate: futureDate,
    checkOutDate: nextDay,
    roomsCount: 1,
    status: 'CONFIRMED',
  });

  // D1. Exact overlap — room blocked by reservation
  {
    const availability = await getAvailableRoomTypes({
      checkIn: futureDateStr,
      checkOut: nextDayStr,
      guests: 2,
    });
    const stdType = availability.availableRoomTypes.find((r) => r.roomTypeId === standardRoom.id);
    if (stdType) {
      assertEqual(
        stdType.availableRoomCount,
        standardBaseline - 1,
        'D1: Exact overlap — 1 room blocked by reservation'
      );
    } else {
      assert(standardBaseline <= 1, 'D1: Exact overlap — all Standard rooms blocked');
    }
  }

  // D2. Partial overlap (starts before)
  {
    const dayBefore = new Date(futureDate);
    dayBefore.setDate(dayBefore.getDate() - 1);

    const availability = await getAvailableRoomTypes({
      checkIn: dayBefore.toISOString().split('T')[0],
      checkOut: nextDayStr,
      guests: 2,
    });
    const stdType = availability.availableRoomTypes.find((r) => r.roomTypeId === standardRoom.id);
    assert(
      !stdType || stdType.availableRoomCount < standardBaseline,
      'D2: Partial overlap (starts before) — room is blocked'
    );
  }

  // D3. Partial overlap (ends after)
  {
    const dayAfter = new Date(nextDay);
    dayAfter.setDate(dayAfter.getDate() + 1);

    const availability = await getAvailableRoomTypes({
      checkIn: futureDateStr,
      checkOut: dayAfter.toISOString().split('T')[0],
      guests: 2,
    });
    const stdType = availability.availableRoomTypes.find((r) => r.roomTypeId === standardRoom.id);
    assert(
      !stdType || stdType.availableRoomCount < standardBaseline,
      'D3: Partial overlap (ends after) — room is blocked'
    );
  }

  // D4. Adjacent dates must NOT overlap
  {
    const dayAfterNext = new Date(nextDay);
    dayAfterNext.setDate(dayAfterNext.getDate() + 1);

    const availability = await getAvailableRoomTypes({
      checkIn: nextDayStr,
      checkOut: dayAfterNext.toISOString().split('T')[0],
      guests: 2,
    });
    const stdType = availability.availableRoomTypes.find((r) => r.roomTypeId === standardRoom.id);
    assert(stdType !== undefined, 'D4: Adjacent dates do NOT overlap — room available');
    assertEqual(
      stdType!.availableRoomCount,
      standardBaseline,
      'D4b: Adjacent dates — available count unchanged'
    );
  }

  // D5. Cancelled reservation does NOT block
  {
    await seedTestReservation({
      reservationNumber: 'TEST-AVAIL-002',
      roomTypeId: deluxeRoom.id,
      checkInDate: futureDate,
      checkOutDate: nextDay,
      roomsCount: 2,
      status: 'CANCELLED',
    });

    const availability = await getAvailableRoomTypes({
      checkIn: futureDateStr,
      checkOut: nextDayStr,
      guests: 2,
    });
    const dlxType = availability.availableRoomTypes.find((r) => r.roomTypeId === deluxeRoom.id);
    assert(dlxType !== undefined, 'D5a: Deluxe room available despite cancelled reservation');
    assertEqual(
      dlxType!.availableRoomCount,
      deluxeRoomCount,
      'D5b: Cancelled reservation does not reduce available count'
    );
  }

  await cleanupTestData();

  console.log('');

  // ═══════════════════════════════════════════
  // E. RESULTS VALIDATION
  // ═══════════════════════════════════════════
  console.log('─── E. RESULTS VALIDATION ───');

  {
    const availability = await getAvailableRoomTypes({
      checkIn: futureDateStr,
      checkOut: nextDayStr,
      guests: 2,
    });
    const poolType = availability.availableRoomTypes.find(
      (r) => r.roomTypeId === poolViewRoom.id
    );
    assert(poolType === undefined, 'E1a: Pool View Room (0 rooms) excluded');
    const allPositive = availability.availableRoomTypes.every((r) => r.availableRoomCount > 0);
    assert(allPositive, 'E1b: All returned types have availableRoomCount > 0');
  }

  {
    const availability = await getAvailableRoomTypes({
      checkIn: futureDateStr,
      checkOut: threeDaysLaterStr,
      guests: 2,
    });
    const stdType = availability.availableRoomTypes.find((r) => r.roomTypeId === standardRoom.id);
    assert(stdType !== undefined, 'E3a: Standard room available for 3-night stay');
    const expectedTotal = Number(standardRoom.basePrice) * 3;
    assertEqual(stdType!.basePrice * 3, expectedTotal, 'E3b: Total price = basePrice × nights');
  }

  {
    const availability = await getAvailableRoomTypes({
      checkIn: futureDateStr,
      checkOut: nextDayStr,
      guests: 2,
    });
    const stdType = availability.availableRoomTypes.find((r) => r.roomTypeId === standardRoom.id);
    assert(stdType!.amenities.length > 0, 'E4: Amenities are returned');
  }

  {
    const availability = await getAvailableRoomTypes({
      checkIn: futureDateStr,
      checkOut: nextDayStr,
      guests: 2,
    });
    for (const rt of availability.availableRoomTypes) {
      assert(rt.slug.length > 0, `E5: Slug "${rt.slug}" is non-empty for ${rt.name}`);
    }
  }

  console.log('');

  // ═══════════════════════════════════════════
  // F. SECURITY
  // ═══════════════════════════════════════════
  console.log('─── F. SECURITY ───');

  {
    const result = availabilitySearchSchema.safeParse({
      checkIn: 'not-a-date',
      checkOut: nextDayStr,
      guests: 2,
    });
    assert(!result.success, 'F1: Malformed checkIn date rejected');
  }

  {
    const result = availabilitySearchSchema.safeParse({
      checkIn: futureDateStr,
      checkOut: nextDayStr,
      guests: -1,
    });
    assert(!result.success, 'F2: Negative guests rejected');
  }

  {
    const result = availabilitySearchSchema.safeParse({
      checkIn: futureDateStr,
      checkOut: nextDayStr,
      guests: 0,
    });
    assert(!result.success, 'F3: Zero guests rejected');
  }

  {
    const result = availabilitySearchSchema.safeParse({
      checkIn: futureDateStr,
      checkOut: nextDayStr,
      guests: 25,
    });
    assert(!result.success, 'F4: Excessive guests (25) rejected');
  }

  {
    const result = availabilitySearchSchema.safeParse({});
    assert(!result.success, 'F5: Empty object rejected');
  }

  console.log('');

  // ═══════════════════════════════════════════
  // G. REGRESSION — Stay Date Boundaries & Deduplication
  // ═══════════════════════════════════════════
  console.log('─── G. STAY DATE BOUNDARIES & DEDUPLICATION ───');

  // Get a physical Standard room for testing
  const standardRooms = await prisma.room.findMany({
    where: { roomTypeId: standardRoom.id, isActive: true },
    select: { id: true, roomNumber: true },
    take: 3,
  });
  assert(standardRooms.length >= 3, 'G-pre: Need at least 3 Standard rooms for tests');

  const testRoom1 = standardRooms[0];
  const testRoom2 = standardRooms[1];
  const testRoom3 = standardRooms[2];

  // G1. Active stay blocks its assigned physical room
  {
    // Create a stay on testRoom1: Oct 1 → Oct 5 (expected), no actual checkout yet
    const stayCheckIn = new Date(futureDate);
    stayCheckIn.setDate(stayCheckIn.getDate() + 10);
    const stayCheckOut = new Date(stayCheckIn);
    stayCheckOut.setDate(stayCheckOut.getDate() + 4);

    const stay = await seedTestStay({
      stayNumber: `TEST-STAY-G1-${Date.now()}`,
      roomId: testRoom1.id,
      actualCheckIn: stayCheckIn,
      expectedCheckOut: stayCheckOut,
    });

    // Search dates that overlap with the stay: stayCheckIn+1 → stayCheckOut+1
    const searchStart = new Date(stayCheckIn);
    searchStart.setDate(searchStart.getDate() + 1);
    const searchEnd = new Date(stayCheckOut);
    searchEnd.setDate(searchEnd.getDate() + 1);

    const availability = await getAvailableRoomTypes({
      checkIn: searchStart.toISOString().split('T')[0],
      checkOut: searchEnd.toISOString().split('T')[0],
      guests: 2,
    });
    const stdType = availability.availableRoomTypes.find((r) => r.roomTypeId === standardRoom.id);
    assert(stdType !== undefined, 'G1a: Standard still has other rooms available');
    // The blocked room count should reflect 1 fewer room than the type's total
    assert(
      stdType!.availableRoomCount < standardRoomCount,
      'G1b: Active stay blocks its assigned physical room'
    );

    // Cleanup
    await prisma.roomAssignment.deleteMany({ where: { stayId: stay.id } });
    await prisma.stay.delete({ where: { id: stay.id } });
  }

  // G2. Active stay does NOT block dates AFTER expected checkout (future stay, not overstay)
  {
    // Create a stay on testRoom1: Oct 15 → Oct 19 (expected), no actual checkout
    const stayCheckIn = new Date(futureDate);
    stayCheckIn.setDate(stayCheckIn.getDate() + 20);
    const stayCheckOut = new Date(stayCheckIn);
    stayCheckOut.setDate(stayCheckOut.getDate() + 4);

    const stay = await seedTestStay({
      stayNumber: `TEST-STAY-G2-${Date.now()}`,
      roomId: testRoom1.id,
      actualCheckIn: stayCheckIn,
      expectedCheckOut: stayCheckOut,
    });

    // Search dates AFTER expected checkout: Oct 20 → Oct 21
    const searchStart = new Date(stayCheckOut);
    searchStart.setDate(searchStart.getDate() + 1);
    const searchEnd = new Date(searchStart);
    searchEnd.setDate(searchEnd.getDate() + 1);

    const availability = await getAvailableRoomTypes({
      checkIn: searchStart.toISOString().split('T')[0],
      checkOut: searchEnd.toISOString().split('T')[0],
      guests: 2,
    });
    const stdType = availability.availableRoomTypes.find((r) => r.roomTypeId === standardRoom.id);
    assert(stdType !== undefined, 'G2a: Standard room type available');
    assertEqual(
      stdType!.availableRoomCount,
      standardRoomCount,
      'G2b: Stay after expected checkout does NOT block room for future dates'
    );

    // Cleanup
    await prisma.roomAssignment.deleteMany({ where: { stayId: stay.id } });
    await prisma.stay.delete({ where: { id: stay.id } });
  }

  // G3. Early checkout releases room after actualCheckOut
  {
    // Create a stay on testRoom1: Oct 25 → Oct 29 (expected), actualCheckOut = Oct 27
    const stayCheckIn = new Date(futureDate);
    stayCheckIn.setDate(stayCheckIn.getDate() + 30);
    const stayExpectedOut = new Date(stayCheckIn);
    stayExpectedOut.setDate(stayExpectedOut.getDate() + 4);
    const stayActualOut = new Date(stayCheckIn);
    stayActualOut.setDate(stayActualOut.getDate() + 2);

    const stay = await seedTestStay({
      stayNumber: `TEST-STAY-G3-${Date.now()}`,
      roomId: testRoom1.id,
      actualCheckIn: stayCheckIn,
      expectedCheckOut: stayExpectedOut,
      actualCheckOut: stayActualOut,
    });

    // Search dates AFTER actual checkout but BEFORE expected checkout: Oct 28 → Oct 29
    const searchStart = new Date(stayActualOut);
    searchStart.setDate(searchStart.getDate() + 1);
    const searchEnd = new Date(searchStart);
    searchEnd.setDate(searchEnd.getDate() + 1);

    const availability = await getAvailableRoomTypes({
      checkIn: searchStart.toISOString().split('T')[0],
      checkOut: searchEnd.toISOString().split('T')[0],
      guests: 2,
    });
    const stdType = availability.availableRoomTypes.find((r) => r.roomTypeId === standardRoom.id);
    assert(stdType !== undefined, 'G3a: Standard room type available');
    assertEqual(
      stdType!.availableRoomCount,
      standardRoomCount,
      'G3b: Early checkout releases room — room available after actualCheckOut'
    );

    // Cleanup
    await prisma.roomAssignment.deleteMany({ where: { stayId: stay.id } });
    await prisma.stay.delete({ where: { id: stay.id } });
  }

  // G4. Overstay — room remains blocked after expectedCheckOut when actualCheckOut is null
  {
    // Create a stay with expected checkout in the PAST but no actual checkout yet.
    // This is a real overstay: the guest's planned departure has passed but they
    // haven't checked out. The room is physically occupied.
    const stayCheckIn = new Date(today);
    stayCheckIn.setDate(stayCheckIn.getDate() - 10); // checked in 10 days ago
    const stayExpectedOut = new Date(today);
    stayExpectedOut.setDate(stayExpectedOut.getDate() - 2); // expected checkout 2 days ago

    const stay = await seedTestStay({
      stayNumber: `TEST-STAY-G4-${Date.now()}`,
      roomId: testRoom1.id,
      actualCheckIn: stayCheckIn,
      expectedCheckOut: stayExpectedOut,
      actualCheckOut: null,
    });

    // With GREATEST: effectiveEnd = GREATEST(expectedCheckOut, CURRENT_DATE) = CURRENT_DATE
    // Searching today → tomorrow: effectiveEnd (today) > requestedCheckIn (today) → TRUE → room blocked
    const todayStr = today.toISOString().split('T')[0];
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const availability = await getAvailableRoomTypes({
      checkIn: todayStr,
      checkOut: tomorrowStr,
      guests: 2,
    });
    const stdType = availability.availableRoomTypes.find((r) => r.roomTypeId === standardRoom.id);
    assert(stdType !== undefined, 'G4a: Standard room type available (other rooms not blocked)');
    assert(
      stdType!.availableRoomCount < standardRoomCount,
      'G4b: Overstay room blocked for today — physically occupied room not released'
    );

    // Search day after tomorrow → 2 days out: effectiveEnd (today) > requestedCheckIn?
    // Room should be available for dates after today (assuming guest checks out).
    // Use Sep 9+ to avoid production stays on S-1001 whose expectedCheckOut is Sep 8
    // (they overlap a Sep 8 search but not Sep 9).
    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
    const twoDaysOut = new Date(dayAfterTomorrow);
    twoDaysOut.setDate(twoDaysOut.getDate() + 1);

    const availability2 = await getAvailableRoomTypes({
      checkIn: dayAfterTomorrow.toISOString().split('T')[0],
      checkOut: twoDaysOut.toISOString().split('T')[0],
      guests: 2,
    });
    const stdType2 = availability2.availableRoomTypes.find((r) => r.roomTypeId === standardRoom.id);
    assert(stdType2 !== undefined, 'G4c: Standard room available after today');
    assertEqual(
      stdType2!.availableRoomCount,
      standardRoomCount,
      'G4d: Overstay room not blocked after today — released when expected overstay period ends'
    );

    // Cleanup
    await prisma.roomAssignment.deleteMany({ where: { stayId: stay.id } });
    await prisma.stay.delete({ where: { id: stay.id } });
  }

  // G5. Reservation + active stay on SAME room counts only ONE blocked room
  {
    // Create a reservation for 1 Standard room
    const reservation = await seedTestReservation({
      reservationNumber: 'TEST-AVAIL-G5',
      roomTypeId: standardRoom.id,
      checkInDate: futureDate,
      checkOutDate: nextDay,
      roomsCount: 1,
      status: 'CONFIRMED',
    });

    // Create a stay on testRoom2 that overlaps the same dates
    const stay = await seedTestStay({
      stayNumber: `TEST-STAY-G5-${Date.now()}`,
      roomId: testRoom2.id,
      actualCheckIn: futureDate,
      expectedCheckOut: nextDay,
      reservationId: reservation.id,
    });

    // Search: the same dates
    const availability = await getAvailableRoomTypes({
      checkIn: futureDateStr,
      checkOut: nextDayStr,
      guests: 2,
    });
    const stdType = availability.availableRoomTypes.find((r) => r.roomTypeId === standardRoom.id);

    // Without dedup: reservation blocks 1 + stay blocks 1 = 2 blocked
    // With dedup: stay blocks 1 physical room, reservation raw=1, net=1-1=0, total=1
    // Expected available = standardBaseline - 1 (only the stay's physical room)
    if (stdType) {
      assertEqual(
        stdType.availableRoomCount,
        standardBaseline - 1,
        'G5: Reservation + stay on same room blocks only ONE physical room (no double-count)'
      );
    } else {
      assert(standardBaseline <= 1, 'G5: All Standard rooms blocked');
    }

    await cleanupTestData();
  }

  // G6. Multiple reservations on different rooms subtract correct count
  {
    await seedTestReservation({
      reservationNumber: 'TEST-AVAIL-G6a',
      roomTypeId: deluxeRoom.id,
      checkInDate: futureDate,
      checkOutDate: nextDay,
      roomsCount: 2,
      status: 'CONFIRMED',
    });

    const availability = await getAvailableRoomTypes({
      checkIn: futureDateStr,
      checkOut: nextDayStr,
      guests: 2,
    });
    const dlxType = availability.availableRoomTypes.find((r) => r.roomTypeId === deluxeRoom.id);
    assert(dlxType !== undefined, 'G6a: Deluxe room type available');
    assertEqual(
      dlxType!.availableRoomCount,
      deluxeRoomCount - 2,
      'G6b: 2 reserved rooms correctly reduces available count by 2'
    );

    await cleanupTestData();
  }

  // G7. No duplicate room blocking — stays + reservations never reduce below true inventory
  {
    // Create 2 reservations for Deluxe (roomsCount=1 each)
    await seedTestReservation({
      reservationNumber: 'TEST-AVAIL-G7a',
      roomTypeId: deluxeRoom.id,
      checkInDate: futureDate,
      checkOutDate: nextDay,
      roomsCount: 1,
      status: 'CONFIRMED',
    });
    await seedTestReservation({
      reservationNumber: 'TEST-AVAIL-G7b',
      roomTypeId: deluxeRoom.id,
      checkInDate: futureDate,
      checkOutDate: nextDay,
      roomsCount: 1,
      status: 'CONFIRMED',
    });

    const availability = await getAvailableRoomTypes({
      checkIn: futureDateStr,
      checkOut: nextDayStr,
      guests: 2,
    });
    const dlxType = availability.availableRoomTypes.find((r) => r.roomTypeId === deluxeRoom.id);
    assert(dlxType !== undefined, 'G7a: Deluxe room type available');
    // 2 reservations × 1 room each = 2 blocked, but should never exceed inventory
    assert(
      dlxType!.availableRoomCount >= 0,
      'G7b: Available count is never negative'
    );
    assertEqual(
      dlxType!.availableRoomCount,
      deluxeRoomCount - 2,
      'G7c: Multiple reservations subtract correct count'
    );

    await cleanupTestData();
  }

  // G8. Regression — existing queries still work
  {
    const roomTypes = await prisma.roomType.findMany({
      where: { isActive: true },
      select: { id: true, name: true, slug: true },
    });
    assert(roomTypes.length > 0, 'G8a: Public room types query still works');

    const roomType = await prisma.roomType.findUnique({
      where: { slug: 'standard-heritage-room' },
    });
    assert(roomType !== null, 'G8b: Room type slug lookup still works');

    const roomCount = await prisma.room.count({ where: { isActive: true } });
    assert(
      roomCount ===
        standardRoomCount + deluxeRoomCount + villaRoomCount + poolViewRoomCount,
      'G8c: Room count unchanged after all tests'
    );
  }

  console.log('');

  // ═══════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════
  console.log('================================================================');
  console.log('✅ ALL AVAILABILITY TESTS PASSED');
  console.log('================================================================');
}

runTests()
  .then(() => {
    console.log('\nTest suite completed successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Test suite failed:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
