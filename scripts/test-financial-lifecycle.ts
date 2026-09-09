import { prisma } from '../src/lib/db/prisma';
import { executeCheckIn } from '../src/lib/frontdesk/checkin';
import { executeCheckOut } from '../src/lib/frontdesk/checkout';
import { PhysicalRoomStatus, IdDocumentType, PaymentStatus, FolioStatus, StayStatus } from '@prisma/client';
import assert from 'node:assert';

async function testFinancialLifecycle() {
  console.log('=== TESTING COMPLETE FINANCIAL LIFECYCLE (BOOKING -> CHECK-IN -> FOLIO -> CHECKOUT) ===\n');

  const ACTOR = {
    id: 'cmtn2a0xl000uihqsf85lg1ur',
    name: 'Executive General Manager',
    role: 'SUPER_ADMIN',
  };

  const room = await prisma.room.findFirst({
    where: { status: PhysicalRoomStatus.AVAILABLE, isActive: true },
    include: { roomType: true },
  });
  assert(room, 'Need an available room');

  // Step 1: Create Guest & Online Reservation with 6,160 advance payment
  console.log('Step 1: Creating online reservation with ₹6,160 advance payment...');
  const guest = await prisma.guest.create({
    data: {
      firstName: 'Finance',
      lastName: 'Audit',
      email: `fin-audit-${Date.now()}@test.com`,
      phone: `777${Math.floor(1000000 + Math.random() * 9000000)}`,
    },
  });

  const now = new Date();
  const checkOut = new Date(Date.now() + 86400000);
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const resNumber = `RES-FIN-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;
  const payNumber = `PAY-ONLINE-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;

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
      subtotal: 5500,
      taxAmount: 660,
      totalAmount: 6160,
      advancePaidAmount: 6160,
      reservedRooms: {
        create: {
          roomTypeId: room.roomTypeId,
          roomsCount: 1,
          ratePerNight: 5500,
          totalNights: 1,
          taxAmount: 660,
          lineTotal: 6160,
        },
      },
      payments: {
        create: {
          paymentNumber: payNumber,
          context: 'RESERVATION_ADVANCE',
          amount: 6160,
          currency: 'INR',
          method: 'ONLINE',
          status: 'SUCCESS',
        },
      },
    },
    include: { payments: true },
  });

  console.log(`  ✓ Reservation: ${resNumber} (Total: ₹${reservation.totalAmount}, Advance: ₹${reservation.advancePaidAmount})`);
  console.log(`  ✓ Authoritative Online Payment: ${reservation.payments[0].paymentNumber} (₹${reservation.payments[0].amount})`);

  // Step 2: Perform Check-In
  console.log('\nStep 2: Performing Check-In...');
  const checkInResult = await executeCheckIn(
    {
      reservationId: reservation.id,
      roomId: room.id,
      expectedCheckOut: checkOut.toISOString(),
      idDocumentType: IdDocumentType.PASSPORT,
      idDocumentNumber: 'PASS-FIN-001',
    },
    ACTOR
  );

  console.log(`  ✓ Stay Created: ${checkInResult.stayNumber}`);
  console.log(`  ✓ Folio Created: ${checkInResult.folioNumber}`);

  // Step 3: Verify Folio Balance after Check-In
  console.log('\nStep 3: Verifying Folio Ledger Balance after Check-In...');
  const folio = await prisma.folio.findUnique({
    where: { id: checkInResult.folioId },
    include: { items: true, payments: true },
  });

  assert(folio, 'Folio must exist');
  console.log(`  ✓ Folio Status:        ${folio.status}`);
  console.log(`  ✓ Folio Total Charges: ₹${folio.totalCharges}`);
  console.log(`  ✓ Folio Total Credits: ₹${folio.totalCredits}`);
  console.log(`  ✓ Folio Net Balance:   ₹${folio.totalBalance}`);
  console.log(`  ✓ Linked Payments:     ${folio.payments.length} payment(s)`);

  assert.strictEqual(Number(folio.totalCharges), 6160, 'Folio totalCharges must be 6160');
  assert.strictEqual(Number(folio.totalCredits), 6160, 'Folio totalCredits must be 6160 (credited from online advance)');
  assert.strictEqual(Number(folio.totalBalance), 0, 'Folio net opening balance must be ₹0.00');
  assert.strictEqual(folio.payments.length, 1, 'Folio must have the online advance payment linked');
  assert.strictEqual(folio.payments[0].paymentNumber, payNumber, 'Linked payment must be the online payment');

  // Verify total payment records across entire reservation: MUST STILL BE EXACTLY 1!
  const allPayments = await prisma.payment.findMany({ where: { reservationId: reservation.id } });
  assert.strictEqual(allPayments.length, 1, 'CRITICAL: No duplicate payment records created!');
  console.log('  ✓ CRITICAL INVARIANT: Exactly 1 payment record exists in database (No duplicate created)');

  // Step 4: Perform Check-Out with ₹0 additional payment
  console.log('\nStep 4: Executing Check-Out (Expected Final Customer Balance = ₹0.00)...');
  const checkOutResult = await executeCheckOut(
    {
      stayId: checkInResult.stayId,
      settlementPaymentAmount: 0,
    },
    ACTOR
  );

  console.log(`  ✓ Checkout Result:`);
  console.log(`    Total Charges:  ₹${checkOutResult.totalCharges}`);
  console.log(`    Total Payments: ₹${checkOutResult.totalPayments}`);
  console.log(`    Final Balance:  ₹${checkOutResult.finalBalance}`);
  console.log(`    Checkout Time:  ${checkOutResult.checkoutAt}`);

  assert.strictEqual(Number(checkOutResult.totalCharges), 6160, 'Total charges must be 6160');
  assert.strictEqual(Number(checkOutResult.totalPayments), 6160, 'Total payments must recognize the 6160 online advance');
  assert.strictEqual(Number(checkOutResult.finalBalance), 0, 'Final balance must be exactly ₹0.00');

  // Step 5: Verify Post-Checkout Lifecycle States
  console.log('\nStep 5: Verifying Post-Checkout Lifecycle States...');
  const postFolio = await prisma.folio.findUnique({ where: { id: checkInResult.folioId } });
  assert.strictEqual(postFolio?.status, FolioStatus.SETTLED, 'Folio status must be SETTLED');
  console.log('  ✓ Folio: SETTLED');

  const postStay = await prisma.stay.findUnique({ where: { id: checkInResult.stayId } });
  assert.strictEqual(postStay?.status, StayStatus.CHECKED_OUT, 'Stay status must be CHECKED_OUT');
  console.log('  ✓ Stay: CHECKED_OUT');

  const postRoom = await prisma.room.findUnique({ where: { id: room.id } });
  assert.strictEqual(postRoom?.status, PhysicalRoomStatus.DIRTY, 'Room status must be DIRTY');
  console.log('  ✓ Room: Transitioned to DIRTY');

  const postRes = await prisma.reservation.findUnique({ where: { id: reservation.id } });
  assert.strictEqual(postRes?.status, 'COMPLETED', 'Reservation status must be COMPLETED');
  console.log('  ✓ Reservation: COMPLETED');

  // Cleanup
  console.log('\nCleaning up test records...');
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [checkInResult.stayId, checkInResult.folioId] } } });
  await prisma.folioItem.deleteMany({ where: { folioId: checkInResult.folioId } });
  await prisma.payment.deleteMany({ where: { reservationId: reservation.id } });
  await prisma.folio.deleteMany({ where: { id: checkInResult.folioId } });
  await prisma.roomAssignment.deleteMany({ where: { stayId: checkInResult.stayId } });
  await prisma.stayGuest.deleteMany({ where: { stayId: checkInResult.stayId } });
  await prisma.stay.deleteMany({ where: { id: checkInResult.stayId } });
  await prisma.room.update({ where: { id: room.id }, data: { status: PhysicalRoomStatus.AVAILABLE } });
  await prisma.reservationRoom.deleteMany({ where: { reservationId: reservation.id } });
  await prisma.reservation.deleteMany({ where: { id: reservation.id } });
  await prisma.guest.deleteMany({ where: { id: guest.id } });
  console.log('Cleanup complete.');

  console.log('\n=== FINANCIAL LIFECYCLE FULLY VERIFIED & ACCURATE! ===');
}

testFinancialLifecycle().catch(console.error);
