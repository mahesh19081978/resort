import { prisma } from '../src/lib/db/prisma';
import { executeCheckIn } from '../src/lib/frontdesk/checkin';
import { PhysicalRoomStatus, IdDocumentType } from '@prisma/client';
import assert from 'node:assert';

const ACTOR = {
  id: 'cmtn2a0xl000uihqsf85lg1ur',
  name: 'Executive General Manager',
  role: 'SUPER_ADMIN',
};

async function createTestReservation(prefix: string, roomTypeId: string) {
  const guest = await prisma.guest.create({
    data: {
      firstName: 'ConcTest',
      lastName: prefix,
      email: `conc-${prefix}-${Date.now()}@test.com`,
      phone: `888${Math.floor(1000000 + Math.random() * 9000000)}`,
    },
  });

  const now = new Date();
  const checkOut = new Date(Date.now() + 86400000);
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const resNumber = `RES-${prefix}-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;

  const reservation = await prisma.reservation.create({
    data: {
      reservationNumber: resNumber,
      primaryGuestId: guest.id,
      checkInDate: now,
      checkOutDate: checkOut,
      adults: 1,
      children: 0,
      totalRooms: 1,
      status: 'CONFIRMED',
      subtotal: 3000,
      taxAmount: 360,
      totalAmount: 3360,
      advancePaidAmount: 3360,
      reservedRooms: {
        create: {
          roomTypeId,
          roomsCount: 1,
          ratePerNight: 3000,
          totalNights: 1,
          taxAmount: 360,
          lineTotal: 3360,
        },
      },
    },
  });

  return { guest, reservation };
}

async function cleanupReservationAndStay(reservationId: string, guestId: string, roomId?: string) {
  const stays = await prisma.stay.findMany({ where: { reservationId } });
  for (const s of stays) {
    await prisma.auditLog.deleteMany({ where: { entityId: s.id } });
    await prisma.folioItem.deleteMany({ where: { folio: { stayId: s.id } } });
    await prisma.folio.deleteMany({ where: { stayId: s.id } });
    await prisma.roomAssignment.deleteMany({ where: { stayId: s.id } });
    await prisma.stayGuest.deleteMany({ where: { stayId: s.id } });
    await prisma.stay.deleteMany({ where: { id: s.id } });
  }
  if (roomId) {
    await prisma.room.update({ where: { id: roomId }, data: { status: PhysicalRoomStatus.AVAILABLE } });
  }
  await prisma.reservationRoom.deleteMany({ where: { reservationId } });
  await prisma.reservation.deleteMany({ where: { id: reservationId } });
  await prisma.guest.deleteMany({ where: { id: guestId } });
}

async function runConcurrencyTests() {
  console.log('=== TESTING CONCURRENCY & DOUBLE-SUBMIT SCENARIOS ===\n');

  // Find two available rooms of the same roomType
  const rooms = await prisma.room.findMany({
    where: { status: PhysicalRoomStatus.AVAILABLE, isActive: true },
    include: { roomType: true },
    take: 2,
  });

  assert(rooms.length >= 2, 'Need at least 2 available rooms for concurrency testing');
  const [room1, room2] = rooms;

  // ----------------------------------------------------
  // Scenario A: Same reservation + same room (Rapid double-submit)
  // Expected: One succeeds, one fails cleanly.
  // ----------------------------------------------------
  console.log('Testing Scenario A: Rapid double-submit (Same reservation + same room)...');
  const testA = await createTestReservation('SCEN-A', room1.roomTypeId);

  const [resA1, resA2] = await Promise.allSettled([
    executeCheckIn(
      {
        reservationId: testA.reservation.id,
        roomId: room1.id,
        expectedCheckOut: new Date(Date.now() + 86400000).toISOString(),
        idDocumentType: IdDocumentType.PASSPORT,
        idDocumentNumber: 'DOC-A1',
      },
      ACTOR
    ),
    executeCheckIn(
      {
        reservationId: testA.reservation.id,
        roomId: room1.id,
        expectedCheckOut: new Date(Date.now() + 86400000).toISOString(),
        idDocumentType: IdDocumentType.PASSPORT,
        idDocumentNumber: 'DOC-A2',
      },
      ACTOR
    ),
  ]);

  const fulfilledA = [resA1, resA2].filter((r) => r.status === 'fulfilled');
  const rejectedA = [resA1, resA2].filter((r) => r.status === 'rejected');

  assert.strictEqual(fulfilledA.length, 1, 'Scenario A: Exactly one check-in must succeed');
  assert.strictEqual(rejectedA.length, 1, 'Scenario A: Exactly one check-in must be rejected');
  const errorMsgA = (rejectedA[0] as PromiseRejectedResult).reason?.message;
  assert.match(errorMsgA, /RESERVATION_ALREADY_CHECKED_IN|ROOM_ALREADY_OCCUPIED/, 'Scenario A: Rejected reason must be clean concurrency error');
  console.log('  -> Scenario A PASSED! One succeeded, second rejected with:', errorMsgA);

  // Verify database invariants for Scenario A
  const staysA = await prisma.stay.findMany({ where: { reservationId: testA.reservation.id } });
  const assignmentsA = await prisma.roomAssignment.findMany({ where: { roomId: room1.id, status: 'ACTIVE' } });
  const foliosA = await prisma.folio.findMany({ where: { stayId: { in: staysA.map((s) => s.id) } } });
  assert.strictEqual(staysA.length, 1, 'Scenario A: Never create duplicate Stays');
  assert.strictEqual(assignmentsA.length, 1, 'Scenario A: Never create duplicate RoomAssignments');
  assert.strictEqual(foliosA.length, 1, 'Scenario A: Never create duplicate Folios');
  console.log('  -> Scenario A DB Verification PASSED (1 Stay, 1 Assignment, 1 Folio)\n');

  await cleanupReservationAndStay(testA.reservation.id, testA.guest.id, room1.id);

  // ----------------------------------------------------
  // Scenario B: Same reservation + different rooms (Concurrent race on two rooms)
  // Expected: One succeeds, second fails because reservation is already checked in.
  // ----------------------------------------------------
  console.log('Testing Scenario B: Concurrent race (Same reservation + different rooms)...');
  const testB = await createTestReservation('SCEN-B', room1.roomTypeId);

  const [resB1, resB2] = await Promise.allSettled([
    executeCheckIn(
      {
        reservationId: testB.reservation.id,
        roomId: room1.id,
        expectedCheckOut: new Date(Date.now() + 86400000).toISOString(),
        idDocumentType: IdDocumentType.PASSPORT,
        idDocumentNumber: 'DOC-B1',
      },
      ACTOR
    ),
    executeCheckIn(
      {
        reservationId: testB.reservation.id,
        roomId: room2.id,
        expectedCheckOut: new Date(Date.now() + 86400000).toISOString(),
        idDocumentType: IdDocumentType.PASSPORT,
        idDocumentNumber: 'DOC-B2',
      },
      ACTOR
    ),
  ]);

  const fulfilledB = [resB1, resB2].filter((r) => r.status === 'fulfilled');
  const rejectedB = [resB2, resB1].filter((r) => r.status === 'rejected');

  assert.strictEqual(fulfilledB.length, 1, 'Scenario B: Exactly one check-in must succeed');
  assert.strictEqual(rejectedB.length, 1, 'Scenario B: Exactly one check-in must be rejected');
  const errorMsgB = (rejectedB[0] as PromiseRejectedResult).reason?.message;
  assert.match(errorMsgB, /RESERVATION_ALREADY_CHECKED_IN/, 'Scenario B: Second must fail with RESERVATION_ALREADY_CHECKED_IN');
  console.log('  -> Scenario B PASSED! Second rejected with:', errorMsgB);

  // Verify database invariants for Scenario B
  const staysB = await prisma.stay.findMany({ where: { reservationId: testB.reservation.id } });
  assert.strictEqual(staysB.length, 1, 'Scenario B: Exactly 1 Stay created');
  console.log('  -> Scenario B DB Verification PASSED\n');

  await cleanupReservationAndStay(testB.reservation.id, testB.guest.id, room1.id);
  await prisma.room.update({ where: { id: room2.id }, data: { status: PhysicalRoomStatus.AVAILABLE } });

  // ----------------------------------------------------
  // Scenario C: Different reservations + same room (Two users check in to same room)
  // Expected: One succeeds, one fails because physical room is already occupied/assigned.
  // ----------------------------------------------------
  console.log('Testing Scenario C: Collision (Different reservations + same room)...');
  const testC1 = await createTestReservation('SCEN-C1', room1.roomTypeId);
  const testC2 = await createTestReservation('SCEN-C2', room1.roomTypeId);

  const [resC1, resC2] = await Promise.allSettled([
    executeCheckIn(
      {
        reservationId: testC1.reservation.id,
        roomId: room1.id,
        expectedCheckOut: new Date(Date.now() + 86400000).toISOString(),
        idDocumentType: IdDocumentType.PASSPORT,
        idDocumentNumber: 'DOC-C1',
      },
      ACTOR
    ),
    executeCheckIn(
      {
        reservationId: testC2.reservation.id,
        roomId: room1.id,
        expectedCheckOut: new Date(Date.now() + 86400000).toISOString(),
        idDocumentType: IdDocumentType.PASSPORT,
        idDocumentNumber: 'DOC-C2',
      },
      ACTOR
    ),
  ]);

  const fulfilledC = [resC1, resC2].filter((r) => r.status === 'fulfilled');
  const rejectedC = [resC1, resC2].filter((r) => r.status === 'rejected');

  assert.strictEqual(fulfilledC.length, 1, 'Scenario C: Exactly one check-in must succeed');
  assert.strictEqual(rejectedC.length, 1, 'Scenario C: Exactly one check-in must be rejected');
  const errorMsgC = (rejectedC[0] as PromiseRejectedResult).reason?.message;
  assert.match(errorMsgC, /ROOM_ALREADY_OCCUPIED/, 'Scenario C: Second must fail with ROOM_ALREADY_OCCUPIED');
  console.log('  -> Scenario C PASSED! Collision cleanly prevented with:', errorMsgC);

  // Verify only 1 active RoomAssignment for room1
  const assignmentsC = await prisma.roomAssignment.findMany({ where: { roomId: room1.id, status: 'ACTIVE' } });
  assert.strictEqual(assignmentsC.length, 1, 'Scenario C: Never create two active RoomAssignments for same room');
  console.log('  -> Scenario C DB Verification PASSED (Exactly 1 active RoomAssignment)\n');

  await cleanupReservationAndStay(testC1.reservation.id, testC1.guest.id, room1.id);
  await cleanupReservationAndStay(testC2.reservation.id, testC2.guest.id);

  console.log('=== ALL CONCURRENCY & DOUBLE-SUBMIT SCENARIOS PASSED! ===');
}

runConcurrencyTests().catch(console.error);
