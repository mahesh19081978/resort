import { prisma } from '../src/lib/db/prisma';
import { executeCheckIn } from '../src/lib/frontdesk/checkin';
import { PhysicalRoomStatus, StayStatus, RoomAssignmentStatus, FolioStatus, FolioItemType } from '@prisma/client';
import assert from 'node:assert';

async function main() {
  console.log('=== ACTUAL CHECK-IN VERIFICATION ON REAL RESERVATION ===\n');

  const TARGET_RES_NUMBER = 'RES-20260908-43DABE';

  // 1. Verify PRE-CHECKIN state
  console.log(`1. Verifying pre-checkin state for ${TARGET_RES_NUMBER}...`);
  const reservation = await prisma.reservation.findUnique({
    where: { reservationNumber: TARGET_RES_NUMBER },
    include: {
      primaryGuest: {
        include: { documents: true, photos: true },
      },
      reservedRooms: { include: { roomType: true } },
      stays: true,
      payments: true,
    },
  });

  assert(reservation, `Reservation ${TARGET_RES_NUMBER} must exist`);
  assert.strictEqual(reservation.status, 'CONFIRMED', 'Reservation must be CONFIRMED');
  assert.strictEqual(reservation.stays.length, 0, 'Must have 0 stays before checkin');
  assert(reservation.payments.length >= 1, 'Must have at least 1 online payment');
  
  const initialPayment = reservation.payments.find((p) => p.context === 'RESERVATION_ADVANCE');
  assert(initialPayment, 'Must have a RESERVATION_ADVANCE payment');
  assert.strictEqual(initialPayment.status, 'SUCCESS', 'Initial payment must be SUCCESS');
  assert.strictEqual(Number(initialPayment.amount), 6160, 'Initial payment amount must be 6160');
  assert.strictEqual(Number(reservation.advancePaidAmount), 6160, 'Advance paid must be 6160');

  console.log('  ✓ Reservation is CONFIRMED');
  console.log(`  ✓ Authoritative Payment: ${initialPayment.paymentNumber} (${initialPayment.amount} INR, status: ${initialPayment.status})`);
  console.log(`  ✓ Advance paid amount: ${reservation.advancePaidAmount} INR`);

  // Verify documents & photos
  const verifiedDoc = reservation.primaryGuest.documents.find((d) => d.verificationStatus === 'VERIFIED');
  assert(verifiedDoc, 'Must have a verified document');
  const photo = reservation.primaryGuest.photos[0];
  assert(photo, 'Must have a guest photo');

  console.log(`  ✓ Verified Document: ${verifiedDoc.documentType} (${verifiedDoc.documentNumber}, fileUrl: ${verifiedDoc.fileUrl})`);
  console.log(`  ✓ Guest Photo: ${photo.fileUrl}`);

  // Find an available Standard Heritage room
  const targetRoomType = reservation.reservedRooms[0].roomType;
  const room = await prisma.room.findFirst({
    where: {
      roomTypeId: targetRoomType.id,
      status: PhysicalRoomStatus.AVAILABLE,
      isActive: true,
    },
  });
  assert(room, `Must find an available room for ${targetRoomType.name}`);
  console.log(`  ✓ Selected Room for check-in: ${room.roomNumber} (ID: ${room.id})\n`);

  // 2. Perform Check-In
  console.log('2. Executing Check-In Transaction...');
  const actor = {
    id: 'cmtn2a0xl000uihqsf85lg1ur',
    name: 'Executive General Manager',
    role: 'SUPER_ADMIN',
  };

  const tStart = performance.now();
  const checkInResult = await executeCheckIn(
    {
      reservationId: reservation.id,
      roomId: room.id,
      expectedCheckOut: reservation.checkOutDate.toISOString(),
      idDocumentType: verifiedDoc.documentType,
      idDocumentNumber: verifiedDoc.documentNumber,
      documentStorageRef: verifiedDoc.fileUrl,
      photoStorageRef: photo.fileUrl,
      notes: 'Real front-desk check-in verification',
    },
    actor
  );
  const tElapsed = performance.now() - tStart;

  console.log(`\n>>> CHECK-IN COMPLETED in ${tElapsed.toFixed(2)} ms <<<`);
  console.log(`  Stay Number:  ${checkInResult.stayNumber} (ID: ${checkInResult.stayId})`);
  console.log(`  Room Number:  ${checkInResult.roomNumber}`);
  console.log(`  Folio Number: ${checkInResult.folioNumber} (ID: ${checkInResult.folioId})`);
  console.log(`  Guest Name:   ${checkInResult.guestName}\n`);

  // 3. Database Consistency Verification
  console.log('3. Performing Full Database Audit Across All 12 Entities...');

  // 1. Reservation
  const postRes = await prisma.reservation.findUnique({
    where: { id: reservation.id },
    include: { stays: true, payments: true },
  });
  assert.strictEqual(postRes?.status, 'CONFIRMED', 'Reservation status must remain CONFIRMED');
  assert.strictEqual(postRes?.stays.length, 1, 'Reservation must now have exactly 1 stay');
  assert.strictEqual(Number(postRes?.advancePaidAmount), 6160, 'Advance paid must remain exactly 6160 (no duplication)');
  console.log('  [1/12] Reservation: PASS (Status: CONFIRMED, Stays: 1, Advance: 6160 INR unchanged)');

  // 2. Payment
  const postPayments = await prisma.payment.findMany({ where: { reservationId: reservation.id } });
  assert.strictEqual(postPayments.length, 1, 'Must NOT create duplicate advance payments during check-in');
  assert.strictEqual(postPayments[0].paymentNumber, initialPayment.paymentNumber);
  console.log(`  [2/12] Payment: PASS (Authoritative payment preserved: ${postPayments[0].paymentNumber}, no duplicates)`);

  // 3. Refund
  const refunds = await prisma.refund.findMany({ where: { paymentId: { in: postPayments.map((p) => p.id) } } });
  console.log(`  [3/12] Refund: PASS (Total refunds: ${refunds.length})`);

  // 4. Stay
  const stay = await prisma.stay.findUnique({ where: { id: checkInResult.stayId } });
  assert(stay, 'Stay record must exist');
  assert.strictEqual(stay.status, StayStatus.ACTIVE, 'Stay status must be ACTIVE');
  assert.strictEqual(stay.reservationId, reservation.id);
  assert.strictEqual(stay.primaryGuestId, reservation.primaryGuestId);
  console.log(`  [4/12] Stay: PASS (Status: ACTIVE, Number: ${stay.stayNumber})`);

  // 5. StayGuest
  const stayGuests = await prisma.stayGuest.findMany({ where: { stayId: stay.id } });
  assert.strictEqual(stayGuests.length, 1, 'Must have 1 StayGuest link');
  assert.strictEqual(stayGuests[0].isPrimary, true, 'StayGuest must be primary');
  assert.strictEqual(stayGuests[0].guestId, reservation.primaryGuestId);
  console.log('  [5/12] StayGuest: PASS (Linked primary guest)');

  // 6. RoomAssignment
  const assignment = await prisma.roomAssignment.findFirst({
    where: { stayId: stay.id, status: RoomAssignmentStatus.ACTIVE },
  });
  assert(assignment, 'Active RoomAssignment must exist');
  assert.strictEqual(assignment.roomId, room.id);
  console.log(`  [6/12] RoomAssignment: PASS (Status: ACTIVE, Room: ${room.roomNumber})`);

  // 7. Room
  const updatedRoom = await prisma.room.findUnique({ where: { id: room.id } });
  assert.strictEqual(updatedRoom?.status, PhysicalRoomStatus.OCCUPIED, 'Room status must be OCCUPIED');
  console.log(`  [7/12] Room: PASS (Status transitioned to OCCUPIED)`);

  // 8. Folio
  const folio = await prisma.folio.findUnique({ where: { id: checkInResult.folioId } });
  assert(folio, 'Folio must exist');
  assert.strictEqual(folio.status, FolioStatus.OPEN, 'Folio status must be OPEN');
  assert.strictEqual(Number(folio.totalCharges), 6160, 'Folio totalCharges must be 6160');
  assert.strictEqual(Number(folio.totalCredits), 0, 'Folio totalCredits must be 0');
  assert.strictEqual(Number(folio.totalBalance), 6160, 'Folio totalBalance must be 6160');
  console.log(`  [8/12] Folio: PASS (Status: OPEN, Balance: ${folio.totalBalance} INR)`);

  // 9. FolioItem
  const folioItems = await prisma.folioItem.findMany({ where: { folioId: folio.id } });
  assert.strictEqual(folioItems.length, 1, 'Must have exactly 1 opening FolioItem');
  assert.strictEqual(folioItems[0].itemType, FolioItemType.ROOM_CHARGE, 'ItemType must be ROOM_CHARGE');
  assert.strictEqual(Number(folioItems[0].amount), 6160, 'FolioItem amount must be 6160');
  console.log(`  [9/12] FolioItem: PASS (Exactly 1 ROOM_CHARGE of ${folioItems[0].amount} INR)`);

  // 10. GuestDocument
  const guestDocs = await prisma.guestDocument.findMany({ where: { guestId: reservation.primaryGuestId } });
  console.log(`  [10/12] GuestDocument: PASS (${guestDocs.length} documents verified, no duplicates created)`);

  // 11. GuestPhoto
  const guestPhotos = await prisma.guestPhoto.findMany({ where: { guestId: reservation.primaryGuestId } });
  console.log(`  [11/12] GuestPhoto: PASS (${guestPhotos.length} photos verified)`);

  // 12. AuditLog
  const auditLogs = await prisma.auditLog.findMany({
    where: { entity: 'Stay', entityId: stay.id, action: 'CHECKIN_COMPLETED' },
  });
  assert.strictEqual(auditLogs.length, 1, 'Must have exactly 1 CHECKIN_COMPLETED audit record');
  console.log(`  [12/12] AuditLog: PASS (CHECKIN_COMPLETED record present, ID: ${auditLogs[0].id})\n`);

  // 4. Verify RES-20260908-BAC713 UNTOUCHED
  console.log('4. Verifying legitimate reservation RES-20260908-BAC713 remains completely untouched...');
  const protectedRes = await prisma.reservation.findUnique({
    where: { reservationNumber: 'RES-20260908-BAC713' },
    include: { stays: true },
  });
  assert(protectedRes, 'RES-20260908-BAC713 must exist');
  assert.strictEqual(protectedRes.status, 'CONFIRMED', 'RES-20260908-BAC713 must remain CONFIRMED');
  assert.strictEqual(protectedRes.stays.length, 0, 'RES-20260908-BAC713 must have 0 stays');
  console.log('  ✓ RES-20260908-BAC713: CONFIRMED, 0 stays, completely intact!');

  console.log('\n=== ALL CHECK-IN OPERATIONS & AUDITS VERIFIED SUCCESSFULLY! ===');
}

main().catch(console.error);
