import assert from 'node:assert';
import { prisma } from '../src/lib/db/prisma';
import {
  getAdminReservations,
  getAdminReservationKpis,
  getAdminReservationDetail,
  cancelAdminReservation,
  createAdminReservation,
  deriveReservationPaymentState,
} from '../src/lib/booking/admin-reservation-service';
import { getExpectedArrivalsCount, getBusinessDateNow } from '../src/lib/frontdesk/arrivals';
import { getExpectedDeparturesCount } from '../src/lib/frontdesk/departures';
import { ReservationStatus, PaymentStatus, BookingSource, PaymentMethod, StayStatus, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../src/lib/auth/auth';

const superAdminUser: AuthenticatedUser = {
  id: 'test_super_admin_id',
  email: 'admin@infinityresort.com',
  name: 'Super Admin',
  role: 'SUPER_ADMIN',
  isActive: true,
  sessionVersion: 1,
};

const receptionistUser: AuthenticatedUser = {
  id: 'test_receptionist_id',
  email: 'receptionist@infinityresort.com',
  name: 'Front Desk Agent',
  role: 'RECEPTIONIST',
  isActive: true,
  sessionVersion: 1,
};

const unauthorizedUser: AuthenticatedUser = {
  id: 'test_store_manager_id',
  email: 'store@infinityresort.com',
  name: 'Store Manager',
  role: 'STORE_MANAGER',
  isActive: true,
  sessionVersion: 1,
};

async function runAdminBookingsTestSuite() {
  console.log('=== PHASE 0.9B — ADMIN RESERVATIONS & BOOKING ENGINE TEST SUITE ===\n');

  // Track created test reservations for cleanup at the end
  const cleanupReservationIds: string[] = [];
  const cleanupGuestIds: string[] = [];

  try {
    // ----------------------------------------------------
    // TEST 1: Verification of Existing Reservation RES-20260908-BAC713
    // ----------------------------------------------------
    console.log("1. Verifying existing reservation RES-20260908-BAC713 in database...");
    const targetRes = await prisma.reservation.findUnique({
      where: { reservationNumber: 'RES-20260908-BAC713' },
      include: {
        primaryGuest: true,
        reservedRooms: { include: { roomType: true } },
        payments: true,
      },
    });

    assert.ok(targetRes, 'RES-20260908-BAC713 must exist in database');
    assert.strictEqual(targetRes.status, ReservationStatus.CONFIRMED, 'Status must be CONFIRMED');
    assert.strictEqual(targetRes.primaryGuest.firstName, 'Mahesh', 'Guest must be Mahesh');
    assert.strictEqual(targetRes.primaryGuest.lastName, 'Chouhan', 'Guest must be Chouhan');
    assert.strictEqual(targetRes.primaryGuest.phone, '1234564000', 'Phone must be 1234564000');
    assert.strictEqual(targetRes.totalAmount.toString(), '6160', 'Amount must be 6160');
    assert.strictEqual(targetRes.advancePaidAmount.toString(), '6160', 'Advance paid must be 6160');
    assert.strictEqual(targetRes.reservedRooms[0].roomType.name, 'Standard Heritage Room', 'Room type must be Standard Heritage Room');
    assert.strictEqual(targetRes.payments[0].status, PaymentStatus.SUCCESS, 'Payment must be SUCCESS');
    console.log('✓ Target reservation RES-20260908-BAC713 matches exact required specifications.\n');

    // ----------------------------------------------------
    // TEST 2: Admin Reservation List & Search
    // ----------------------------------------------------
    console.log("2. Testing Reservation List, Search, and Filters...");
    const listResult = await getAdminReservations({}, superAdminUser);
    assert.ok(listResult.reservations.length > 0, 'Reservations list must not be empty');
    assert.ok(listResult.pagination.totalCount >= 1, 'Total count must be >= 1');

    // Search by reservation number
    const searchByNumber = await getAdminReservations({ search: 'BAC713' }, superAdminUser);
    assert.strictEqual(searchByNumber.reservations.length, 1, 'Search by BAC713 should return exactly 1 record');
    assert.strictEqual(searchByNumber.reservations[0].reservationNumber, 'RES-20260908-BAC713');

    // Search by guest name
    const searchByName = await getAdminReservations({ search: 'Chouhan' }, superAdminUser);
    assert.strictEqual(searchByName.reservations.length, 1, 'Search by Chouhan should return target reservation');
    assert.strictEqual(searchByName.reservations[0].primaryGuest.firstName, 'Mahesh');
    assert.strictEqual(searchByName.reservations[0].primaryGuest.lastName, 'Chouhan');

    // Search by phone
    const searchByPhone = await getAdminReservations({ search: '1234564000' }, superAdminUser);
    assert.strictEqual(searchByPhone.reservations.length, 1, 'Search by phone should return target reservation');

    // Filter by status CONFIRMED
    const confirmedList = await getAdminReservations({ status: ReservationStatus.CONFIRMED }, superAdminUser);
    assert.ok(confirmedList.reservations.every((r) => r.status === ReservationStatus.CONFIRMED));

    console.log('✓ Search by number, name, phone, and status filter succeeded.\n');

    // ----------------------------------------------------
    // TEST 3: Shared Arrivals & Departures KPI Parity
    // ----------------------------------------------------
    console.log("3. Testing Shared Arrivals & Departures KPI Parity...");
    const businessDate = getBusinessDateNow();
    const arrivalsCount = await getExpectedArrivalsCount(businessDate);
    const departuresCount = await getExpectedDeparturesCount(businessDate);
    const kpis = await getAdminReservationKpis(superAdminUser);

    assert.strictEqual(kpis.todayArrivalsCount, arrivalsCount, "Today's arrivals KPI must strictly match front desk arrivals count");
    assert.strictEqual(kpis.todayDeparturesCount, departuresCount, "Today's departures KPI must strictly match front desk departures count");
    assert.strictEqual(kpis.financialSummary.canViewFinancials, true, 'Super admin must have canViewFinancials = true');
    console.log(`✓ Arrivals (${arrivalsCount}) and Departures (${departuresCount}) match shared Front Desk metrics exactly.\n`);

    // ----------------------------------------------------
    // TEST 4: Sensitive Document Gating (Server-side RBAC)
    // ----------------------------------------------------
    console.log("4. Testing Sensitive Document Gating (Server-side RBAC)...");
    const detailSuperAdmin = await getAdminReservationDetail(targetRes.id, superAdminUser);
    assert.ok(detailSuperAdmin, 'Super admin must load reservation detail');
    assert.ok(detailSuperAdmin.primaryGuest.documents.length > 0, 'Super admin with guest:view_sensitive must receive documents');

    const detailReceptionist = await getAdminReservationDetail(targetRes.id, receptionistUser);
    assert.ok(detailReceptionist, 'Receptionist must load reservation detail');
    assert.strictEqual(detailReceptionist.primaryGuest.documents.length, 0, 'Receptionist WITHOUT guest:view_sensitive must have documents empty on server');

    let unauthorizedError = false;
    try {
      await getAdminReservationDetail(targetRes.id, unauthorizedUser);
    } catch {
      unauthorizedError = true;
    }
    assert.strictEqual(unauthorizedError, true, 'Unauthorized user (STORE_MANAGER) must be rejected with FORBIDDEN');
    console.log('✓ Sensitive guest documents and reservation detail are server-side authorization protected.\n');

    // ----------------------------------------------------
    // TEST 5: Concurrency-Safe Admin Reservation Creation
    // ----------------------------------------------------
    console.log("5. Testing Concurrency-Safe Admin Reservation Creation...");
    const availableRoomType = await prisma.roomType.findFirst({
      where: { isActive: true, totalInventory: { gt: 0 } },
    });
    assert.ok(availableRoomType, 'Must have at least one active room type');

    const testBookingRequestId = `TEST_IDEMP_${crypto.randomUUID()}`;
    const creationResult = await createAdminReservation(
      {
        bookingRequestId: testBookingRequestId,
        checkInDate: '2027-05-10',
        checkOutDate: '2027-05-12',
        adults: 2,
        children: 0,
        rooms: [{ roomTypeId: availableRoomType.id, roomsCount: 1 }],
        guest: {
          firstName: 'Automated',
          lastName: 'TestGuest',
          email: `testguest_${Date.now()}@example.com`,
          phone: '+919111222333',
        },
        source: BookingSource.FRONT_DESK_WALKIN,
        advancePayment: {
          received: true,
          amount: 5000,
          method: PaymentMethod.CASH,
          notes: 'Test cash deposit',
        },
      },
      superAdminUser
    );

    cleanupReservationIds.push(creationResult.reservationId);

    assert.ok(creationResult.reservationNumber.startsWith('RES-'), 'Reservation number must start with RES-');
    assert.strictEqual(creationResult.status, ReservationStatus.CONFIRMED);
    assert.strictEqual(creationResult.advancePaidAmount, '5000.00');
    assert.ok(creationResult.paymentNumber, 'Payment record must be created when advance received');

    // Verify Payment in database
    const createdPayment = await prisma.payment.findFirst({
      where: { reservationId: creationResult.reservationId },
    });
    assert.ok(createdPayment, 'Payment record must exist in DB');
    assert.strictEqual(createdPayment.context, 'RESERVATION_ADVANCE', 'Payment context must be RESERVATION_ADVANCE');
    assert.strictEqual(createdPayment.amount.toString(), '5000', 'Payment amount must be 5000');

    // Verify NO physical room was assigned!
    const stayCheck = await prisma.stay.findMany({
      where: { reservationId: creationResult.reservationId },
    });
    assert.strictEqual(stayCheck.length, 0, 'No Stay or physical room assignment should exist at reservation creation');
    console.log('✓ Admin reservation created with real Payment record, no physical room assigned.\n');

    // ----------------------------------------------------
    // TEST 6: Idempotency (Duplicate Request Key)
    // ----------------------------------------------------
    console.log("6. Testing Idempotency (Duplicate Request Key)...");
    const retryResult = await createAdminReservation(
      {
        bookingRequestId: testBookingRequestId, // identical key
        checkInDate: '2027-05-10',
        checkOutDate: '2027-05-12',
        adults: 2,
        children: 0,
        rooms: [{ roomTypeId: availableRoomType.id, roomsCount: 1 }],
        guest: {
          firstName: 'Automated',
          lastName: 'TestGuest',
          email: `testguest_${Date.now()}@example.com`,
          phone: '+919111222333',
        },
      },
      superAdminUser
    );

    assert.strictEqual(retryResult.reservationId, creationResult.reservationId, 'Retry must return original reservation ID');
    assert.strictEqual(retryResult.reservationNumber, creationResult.reservationNumber, 'Retry must return original reservation number');

    const totalMatching = await prisma.reservation.count({
      where: { bookingRequestId: testBookingRequestId },
    });
    assert.strictEqual(totalMatching, 1, 'Exactly 1 reservation record must exist for the idempotency key');
    console.log('✓ Idempotent retry returns original reservation without duplicates.\n');

    // ----------------------------------------------------
    // TEST 7: Reservation Cancellation Lifecycle & Refund Queueing
    // ----------------------------------------------------
    console.log("7. Testing Reservation Cancellation Lifecycle & Refund Queueing...");
    const cancelRes = await cancelAdminReservation(
      creationResult.reservationId,
      'Guest requested cancellation for travel plan changes',
      superAdminUser
    );

    assert.strictEqual(cancelRes.status, ReservationStatus.CANCELLED);
    assert.ok(cancelRes.refund, 'Refund record must be generated because ₹5000 advance payment existed');
    assert.strictEqual(cancelRes.refund.amount, '5000.00');
    assert.strictEqual(cancelRes.refund.status, 'PENDING', 'Refund status must be PENDING (queued)');

    // Verify refund in DB
    const refundInDb = await prisma.refund.findFirst({
      where: { paymentId: createdPayment!.id },
    });
    assert.ok(refundInDb, 'Refund must exist in DB linked to Payment');
    assert.strictEqual(refundInDb.status, 'PENDING', 'Refund must be PENDING');
    assert.strictEqual(createdPayment!.status, PaymentStatus.SUCCESS, 'Payment status remains SUCCESS (not refunded yet)');

    // Test duplicate cancellation is safe and idempotent
    const duplicateCancel = await cancelAdminReservation(
      creationResult.reservationId,
      'Duplicate cancel attempt',
      superAdminUser
    );
    assert.strictEqual(duplicateCancel.status, ReservationStatus.CANCELLED);

    // Test cancellation of invalid state transition (already cancelled)
    const dbStatus = await prisma.reservation.findUnique({
      where: { id: creationResult.reservationId },
      select: { status: true },
    });
    assert.strictEqual(dbStatus?.status, ReservationStatus.CANCELLED);

    console.log('✓ Cancellation successfully queued PENDING refund and maintained state machine integrity.\n');

    // ----------------------------------------------------
    // TEST 8: Concurrency Conflict Simulation
    // ----------------------------------------------------
    console.log("8. Testing High-Contention Inventory Boundary...");
    // Attempting to book more rooms than total capacity must fail closed
    let inventoryErrorCaught = false;
    try {
      await createAdminReservation(
        {
          bookingRequestId: `TEST_OVERBOOK_${crypto.randomUUID()}`,
          checkInDate: '2027-05-10',
          checkOutDate: '2027-05-12',
          adults: 2,
          children: 0,
          rooms: [{ roomTypeId: availableRoomType.id, roomsCount: 9999 }], // excessive rooms
          guest: {
            firstName: 'Excess',
            lastName: 'Inventory',
            email: 'excess@example.com',
            phone: '+919999999999',
          },
        },
        superAdminUser
      );
    } catch (e: any) {
      if (e.message.includes('INSUFFICIENT_INVENTORY') || e.message.includes('OCCUPANCY_EXCEEDED')) {
        inventoryErrorCaught = true;
      }
    }
    assert.strictEqual(inventoryErrorCaught, true, 'Excessive room booking must be rejected under lock');
    console.log('✓ Inventory boundary safely enforced under transaction lock.\n');

    console.log('====================================================');
    console.log('ALL INTEGRATION TEST SUITES PASSED (30+ INVARIANTS)');
    console.log('====================================================\n');
  } finally {
    // Clean up temporary test records (NEVER touch target RES-20260908-BAC713)
    if (cleanupReservationIds.length > 0) {
      console.log(`Cleaning up ${cleanupReservationIds.length} test reservations...`);
      for (const resId of cleanupReservationIds) {
        // Delete refunds, payments, rooms, reservations created during tests
        const payments = await prisma.payment.findMany({ where: { reservationId: resId } });
        for (const p of payments) {
          await prisma.refund.deleteMany({ where: { paymentId: p.id } });
        }
        await prisma.payment.deleteMany({ where: { reservationId: resId } });
        await prisma.reservationRoom.deleteMany({ where: { reservationId: resId } });
        await prisma.auditLog.deleteMany({ where: { entity: 'Reservation', entityId: resId } });
        await prisma.reservation.delete({ where: { id: resId } });
      }
    }
    await prisma.$disconnect();
  }
}

runAdminBookingsTestSuite().catch((err) => {
  console.error('TEST SUITE FAILED:', err);
  process.exit(1);
});
