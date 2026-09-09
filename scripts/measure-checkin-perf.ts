import { prisma } from '../src/lib/db/prisma';
import { executeCheckIn } from '../src/lib/frontdesk/checkin';
import { PhysicalRoomStatus, IdDocumentType, RoomAssignmentStatus, StayStatus, FolioStatus, FolioItemType, Prisma } from '@prisma/client';
import { recordAuditEvent } from '../src/lib/auth/audit';

async function measureDirectCheckIn() {
  console.log('=== DETAILED TRANSACTION STEP-BY-STEP PROFILER ===');

  // Find an available room
  const room = await prisma.room.findFirst({
    where: { status: PhysicalRoomStatus.AVAILABLE, isActive: true },
    include: { roomType: true },
  });

  if (!room) throw new Error('No available room');

  // Create temporary test guest & reservation
  const testGuest = await prisma.guest.create({
    data: {
      firstName: 'PerfMetrics',
      lastName: 'Guest',
      email: `perf-metrics-${Date.now()}@test.com`,
      phone: `999${Math.floor(1000000 + Math.random() * 9000000)}`,
    },
  });

  const now = new Date();
  const checkOut = new Date(Date.now() + 86400000);
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const resNumber = `RES-PERF-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;

  const testReservation = await prisma.reservation.create({
    data: {
      reservationNumber: resNumber,
      primaryGuestId: testGuest.id,
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

  const actor = {
    id: 'cmtn2a0xl000uihqsf85lg1ur',
    name: 'Executive General Manager',
    role: 'SUPER_ADMIN',
  };

  const timings: Record<string, number> = {};

  // Instrumented runner to measure individual operations
  let createdStayId: string | null = null;

  const tOverallStart = performance.now();
  await prisma.$transaction(
    async (tx) => {
      timings['transaction start'] = performance.now() - tOverallStart;

      // 1. Lock Reservation
      const tResLockStart = performance.now();
      await tx.$queryRaw`SELECT id FROM "Reservation" WHERE id = ${testReservation.id} FOR UPDATE`;
      timings['reservation lock duration'] = performance.now() - tResLockStart;

      // 2. Fetch Reservation with required relations
      const tResFetchStart = performance.now();
      const reservation = await tx.reservation.findUnique({
        where: { id: testReservation.id },
        include: {
          primaryGuest: true,
          reservedRooms: { include: { roomType: true } },
          stays: { where: { status: { in: [StayStatus.ACTIVE] } } },
        },
      });
      timings['reservation fetch (findUnique)'] = performance.now() - tResFetchStart;

      // 3. Lock Room
      const tRoomLockStart = performance.now();
      await tx.$queryRaw`SELECT id FROM "Room" WHERE id = ${room.id} FOR UPDATE`;
      timings['room lock duration'] = performance.now() - tRoomLockStart;

      // 4. Fetch Room with active assignments
      const tRoomFetchStart = performance.now();
      const roomRow = await tx.room.findUnique({
        where: { id: room.id },
        include: { assignments: { where: { status: RoomAssignmentStatus.ACTIVE } } },
      });
      timings['room fetch (findUnique)'] = performance.now() - tRoomFetchStart;

      // 5. Stay creation
      const tStayStart = performance.now();
      const stayNumber = `STY-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;
      const stay = await tx.stay.create({
        data: {
          stayNumber,
          reservationId: reservation!.id,
          primaryGuestId: reservation!.primaryGuestId,
          status: StayStatus.ACTIVE,
          actualCheckIn: now,
          expectedCheckOut: reservation!.checkOutDate,
        },
      });
      createdStayId = stay.id;
      timings['Stay creation'] = performance.now() - tStayStart;

      // 6. StayGuest creation
      const tStayGuestStart = performance.now();
      await tx.stayGuest.create({
        data: {
          stayId: stay.id,
          guestId: reservation!.primaryGuestId,
          isPrimary: true,
        },
      });
      timings['StayGuest creation'] = performance.now() - tStayGuestStart;

      // 7. RoomAssignment creation
      const tRoomAssignStart = performance.now();
      await tx.roomAssignment.create({
        data: {
          stayId: stay.id,
          roomId: roomRow!.id,
          status: RoomAssignmentStatus.ACTIVE,
          assignedAt: now,
          notes: 'Perf profiler assignment',
        },
      });
      timings['RoomAssignment creation'] = performance.now() - tRoomAssignStart;

      // 8. Folio creation
      const tFolioStart = performance.now();
      const folioNumber = `FOL-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;
      const initialCharge = new Prisma.Decimal(3360);
      const folio = await tx.folio.create({
        data: {
          folioNumber,
          stayId: stay.id,
          status: FolioStatus.OPEN,
          totalCharges: initialCharge,
          totalCredits: initialCharge,
          totalBalance: new Prisma.Decimal(0),
        },
      });
      timings['Folio creation'] = performance.now() - tFolioStart;

      // 9. FolioItem creation
      const tFolioItemStart = performance.now();
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
      timings['FolioItem creation'] = performance.now() - tFolioItemStart;

      // 10. Room update
      const tRoomUpdateStart = performance.now();
      await tx.room.update({
        where: { id: room.id },
        data: { status: PhysicalRoomStatus.OCCUPIED },
      });
      timings['Room update'] = performance.now() - tRoomUpdateStart;

      // 11. Audit log
      const tAuditStart = performance.now();
      await recordAuditEvent(
        {
          userId: actor.id,
          action: 'CHECKIN_COMPLETED',
          entity: 'Stay',
          entityId: stay.id,
          newValues: { stayNumber, roomNumber: room.roomNumber },
        },
        tx
      );
      timings['audit'] = performance.now() - tAuditStart;
    },
    { timeout: 30000, maxWait: 10000 }
  );

  const tCommitTotal = performance.now() - tOverallStart;
  timings['commit (total elapsed)'] = tCommitTotal;

  console.log('\n--- Measured Operation Durations ---');
  for (const [step, duration] of Object.entries(timings)) {
    console.log(`${step.padEnd(28)}: ${duration.toFixed(2)} ms`);
  }

  // Cleanup
  console.log('\nCleaning up test records...');
  if (createdStayId) {
    await prisma.auditLog.deleteMany({ where: { entityId: createdStayId } });
    await prisma.folioItem.deleteMany({ where: { folio: { stayId: createdStayId } } });
    await prisma.folio.deleteMany({ where: { stayId: createdStayId } });
    await prisma.roomAssignment.deleteMany({ where: { stayId: createdStayId } });
    await prisma.stayGuest.deleteMany({ where: { stayId: createdStayId } });
    await prisma.stay.deleteMany({ where: { id: createdStayId } });
  }
  await prisma.room.update({ where: { id: room.id }, data: { status: PhysicalRoomStatus.AVAILABLE } });
  await prisma.reservationRoom.deleteMany({ where: { reservationId: testReservation.id } });
  await prisma.reservation.deleteMany({ where: { id: testReservation.id } });
  await prisma.guest.deleteMany({ where: { id: testGuest.id } });
  console.log('Cleanup complete.');
}

measureDirectCheckIn().catch(console.error);
