import { prisma } from '../src/lib/db/prisma';
import { PhysicalRoomStatus, StayStatus, RoomAssignmentStatus, FolioStatus, FolioItemType, Prisma } from '@prisma/client';
import assert from 'node:assert';

async function runRollbackTest() {
  console.log('=== TESTING COMPLETE TRANSACTION ROLLBACK ===\n');

  const room = await prisma.room.findFirst({
    where: { status: PhysicalRoomStatus.AVAILABLE, isActive: true },
    include: { roomType: true },
  });
  assert(room, 'Need an available room for rollback testing');

  // Create temporary test guest & reservation
  const guest = await prisma.guest.create({
    data: {
      firstName: 'Rollback',
      lastName: 'Tester',
      email: `rollback-${Date.now()}@test.com`,
      phone: `777${Math.floor(1000000 + Math.random() * 9000000)}`,
    },
  });

  const now = new Date();
  const checkOut = new Date(Date.now() + 86400000);
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const resNumber = `RES-ROLLBACK-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;

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
          roomTypeId: room.roomTypeId,
          roomsCount: 1,
          ratePerNight: 3000,
          totalNights: 1,
          taxAmount: 360,
          lineTotal: 3360,
        },
      },
    },
  });

  console.log(`Created test reservation: ${resNumber} (ID: ${reservation.id})`);

  let generatedStayNumber = '';
  let generatedFolioNumber = '';

  let threwExpected = false;
  try {
    await prisma.$transaction(
      async (tx) => {
        // Deterministic Lock Order
        await tx.$queryRaw`SELECT id FROM "Reservation" WHERE id = ${reservation.id} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "Room" WHERE id = ${room.id} FOR UPDATE`;

        const randSuffix = Math.floor(1000 + Math.random() * 9000);
        generatedStayNumber = `STY-RB-${dateStr}-${randSuffix}`;
        generatedFolioNumber = `FOL-RB-${dateStr}-${randSuffix}`;

        // 1. Stay creation
        const stay = await tx.stay.create({
          data: {
            stayNumber: generatedStayNumber,
            reservationId: reservation.id,
            primaryGuestId: reservation.primaryGuestId,
            status: StayStatus.ACTIVE,
            actualCheckIn: now,
            expectedCheckOut: reservation.checkOutDate,
          },
        });

        // 2. StayGuest creation
        await tx.stayGuest.create({
          data: {
            stayId: stay.id,
            guestId: reservation.primaryGuestId,
            isPrimary: true,
          },
        });

        // 3. RoomAssignment creation
        await tx.roomAssignment.create({
          data: {
            stayId: stay.id,
            roomId: room.id,
            status: RoomAssignmentStatus.ACTIVE,
            assignedAt: now,
            notes: 'Rollback test assignment',
          },
        });

        // 4. Room status update
        await tx.room.update({
          where: { id: room.id },
          data: { status: PhysicalRoomStatus.OCCUPIED },
        });

        // 5. Folio creation
        const initialCharge = new Prisma.Decimal(3360);
        const folio = await tx.folio.create({
          data: {
            folioNumber: generatedFolioNumber,
            stayId: stay.id,
            status: FolioStatus.OPEN,
            totalCharges: initialCharge,
            totalCredits: new Prisma.Decimal(0),
            totalBalance: initialCharge,
          },
        });

        // 6. FolioItem creation
        await tx.folioItem.create({
          data: {
            folioId: folio.id,
            itemType: FolioItemType.ROOM_CHARGE,
            description: 'Accommodation Charge',
            quantity: 1,
            unitPrice: initialCharge,
            taxAmount: new Prisma.Decimal(360),
            amount: initialCharge,
            postedAt: now,
          },
        });

        // INJECT FAILURE AFTER STAY, ROOM ASSIGNMENT, ROOM UPDATE, FOLIO, AND FOLIO ITEM CREATION
        console.log('  -> Injected intentional failure before transaction commit...');
        throw new Error('SIMULATED_FAILURE_BEFORE_COMMIT');
      },
      { timeout: 90000, maxWait: 30000 }
    );
  } catch (err: any) {
    if (err.message === 'SIMULATED_FAILURE_BEFORE_COMMIT') {
      threwExpected = true;
    } else {
      throw err;
    }
  }

  assert.strictEqual(threwExpected, true, 'Must have caught simulated failure');

  console.log('\n--- Verifying Rollback Invariants in Database ---');

  // Verify Stay = absent
  const foundStay = await prisma.stay.findFirst({ where: { stayNumber: generatedStayNumber } });
  assert.strictEqual(foundStay, null, 'ROLLBACK VERIFICATION: Stay must NOT exist');
  console.log('✓ Stay: Absent (Completely rolled back)');

  // Verify RoomAssignment = absent
  const foundAssignment = await prisma.roomAssignment.findFirst({ where: { notes: 'Rollback test assignment' } });
  assert.strictEqual(foundAssignment, null, 'ROLLBACK VERIFICATION: RoomAssignment must NOT exist');
  console.log('✓ RoomAssignment: Absent (Completely rolled back)');

  // Verify Folio = absent
  const foundFolio = await prisma.folio.findFirst({ where: { folioNumber: generatedFolioNumber } });
  assert.strictEqual(foundFolio, null, 'ROLLBACK VERIFICATION: Folio must NOT exist');
  console.log('✓ Folio: Absent (Completely rolled back)');

  // Verify Room status remains AVAILABLE
  const currentRoom = await prisma.room.findUnique({ where: { id: room.id } });
  assert.strictEqual(currentRoom?.status, PhysicalRoomStatus.AVAILABLE, 'ROLLBACK VERIFICATION: Room status must remain AVAILABLE');
  console.log('✓ Room: Remains AVAILABLE');

  // Verify Reservation remains unchanged (CONFIRMED, no stays)
  const currentRes = await prisma.reservation.findUnique({
    where: { id: reservation.id },
    include: { stays: true },
  });
  assert.strictEqual(currentRes?.status, 'CONFIRMED', 'ROLLBACK VERIFICATION: Reservation status unchanged');
  assert.strictEqual(currentRes?.stays.length, 0, 'ROLLBACK VERIFICATION: Reservation has 0 stays');
  console.log('✓ Reservation: Unchanged (0 stays, CONFIRMED)');

  console.log('\n=== ROLLBACK VERIFICATION PASSED: ZERO PARTIAL STATE! ===');

  // Clean up
  await prisma.reservationRoom.deleteMany({ where: { reservationId: reservation.id } });
  await prisma.reservation.deleteMany({ where: { id: reservation.id } });
  await prisma.guest.deleteMany({ where: { id: guest.id } });
}

runRollbackTest().catch(console.error);
