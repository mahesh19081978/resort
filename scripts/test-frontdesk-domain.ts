import assert from 'node:assert';
import { Prisma, PhysicalRoomStatus, StayStatus, RoomAssignmentStatus, FolioStatus, FolioItemType, PaymentStatus, PaymentContext, PaymentMethod, IdDocumentType } from '@prisma/client';
import {
  checkInSchema,
  checkOutSchema,
  guestDocumentUploadSchema,
  guestPhotoUploadSchema,
  folioChargeSchema,
} from '../src/validations/frontdesk';
import { executeCheckIn } from '../src/lib/frontdesk/checkin';
import { executeCheckOut } from '../src/lib/frontdesk/checkout';
import { getEligibleRoomsForCheckIn } from '../src/lib/frontdesk/eligibility';
import { hasPermission } from '../src/lib/permissions/rbac';

async function runFrontDeskTestSuite() {
  console.log('--- Starting Front Desk Stay Lifecycle & Security Test Suite (Phase 0.5) ---');

  // ----------------------------------------------------
  // 1. VALIDATION SCHEMA TESTS
  // ----------------------------------------------------
  console.log('1. Testing Front Desk Input Validation Schemas...');

  // 1.1 Check-In Schema Valid Input
  const validCheckIn = checkInSchema.safeParse({
    reservationId: 'cjy0000000000000000000001',
    roomId: 'cjy0000000000000000000002',
    expectedCheckOut: new Date(Date.now() + 86400000).toISOString(),
    idDocumentType: IdDocumentType.PASSPORT,
    idDocumentNumber: 'PASS1234567',
    notes: 'Arrived early',
  });
  assert.strictEqual(validCheckIn.success, true, 'Valid check-in input should pass validation');

  // 1.2 Check-In Schema Invalid CUID & Dates
  const invalidCheckIn = checkInSchema.safeParse({
    reservationId: 'not-a-cuid',
    roomId: 'not-a-cuid',
    expectedCheckOut: 'invalid-date-string',
    idDocumentType: 'INVALID_TYPE',
    idDocumentNumber: 'ab', // too short (<3)
  });
  assert.strictEqual(invalidCheckIn.success, false, 'Invalid check-in inputs must be rejected');

  // 1.3 Check-Out Schema Valid Input
  const validCheckOut = checkOutSchema.safeParse({
    stayId: 'cjy0000000000000000000003',
    settlementPaymentMethod: PaymentMethod.CARD,
    settlementPaymentAmount: 1500.5,
    transactionReference: 'TXN-998877',
    notes: 'Keys returned',
  });
  assert.strictEqual(validCheckOut.success, true, 'Valid checkout input should pass');

  // 1.4 Negative Payment Check
  const negativeCheckOut = checkOutSchema.safeParse({
    stayId: 'cjy0000000000000000000003',
    settlementPaymentAmount: -100,
  });
  assert.strictEqual(negativeCheckOut.success, false, 'Negative settlement payment must be rejected');

  // 1.5 Document Upload Validation
  const validDocUpload = guestDocumentUploadSchema.safeParse({
    guestId: 'cjy0000000000000000000004',
    documentType: IdDocumentType.AADHAAR,
    documentNumber: 'AADHAAR-1234',
    fileBase64: 'SGVsbG8gV29ybGQgZnJvbSB2YXVsdA==',
    fileName: 'id_front.pdf',
    mimeType: 'application/pdf',
  });
  assert.strictEqual(validDocUpload.success, true, 'Valid document upload schema must pass');

  // 1.6 Invalid MIME Document Upload
  const invalidMimeDoc = guestDocumentUploadSchema.safeParse({
    guestId: 'cjy0000000000000000000004',
    documentType: IdDocumentType.AADHAAR,
    documentNumber: 'AADHAAR-1234',
    fileBase64: 'SGVsbG8gV29ybGQgZnJvbSB2YXVsdA==',
    fileName: 'id_front.exe',
    mimeType: 'application/x-msdownload',
  });
  assert.strictEqual(invalidMimeDoc.success, false, 'Disallowed MIME type must be rejected');

  // ----------------------------------------------------
  // 2. CHECK-IN TRANSACTION WORKFLOW TESTS
  // ----------------------------------------------------
  console.log('2. Testing Check-In Transaction Workflow & Concurrency Constraints...');

  const mockActor = {
    id: 'user-receptionist-1',
    name: 'Receptionist User',
    role: 'RECEPTIONIST',
  };

  // Mock initial state
  const mockReservation = {
    id: 'cjy0000000000000000000001',
    reservationNumber: 'RES-20260904-1001',
    status: 'CONFIRMED',
    primaryGuestId: 'guest-1',
    primaryGuest: {
      id: 'guest-1',
      firstName: 'Vikram',
      lastName: 'Malhotra',
    },
    reservedRooms: [
      {
        roomTypeId: 'type-deluxe',
        roomType: { id: 'type-deluxe', name: 'Deluxe Suite' },
        lineTotal: new Prisma.Decimal(5000),
        taxAmount: new Prisma.Decimal(900),
      },
    ],
    stays: [],
  };

  const mockRoomAvailable = {
    id: 'cjy0000000000000000000002',
    roomNumber: 'D-201',
    roomTypeId: 'type-deluxe',
    isActive: true,
    status: PhysicalRoomStatus.AVAILABLE,
    assignments: [],
  };

  // 2.1 Happy Path Check-In
  {
    const createdRecords: Record<string, any[]> = {
      stays: [],
      stayGuests: [],
      roomAssignments: [],
      folios: [],
      folioItems: [],
      guestDocuments: [],
      auditLogs: [],
    };
    let roomUpdatedStatus: PhysicalRoomStatus | null = null;

    const mockTx: any = {
      reservation: {
        findUnique: async () => mockReservation,
        update: async () => mockReservation,
      },
      room: {
        findUnique: async () => mockRoomAvailable,
        update: async (args: any) => {
          roomUpdatedStatus = args.data.status;
          return { ...mockRoomAvailable, status: args.data.status };
        },
      },
      guestDocument: {
        create: async (args: any) => {
          createdRecords.guestDocuments.push(args.data);
          return args.data;
        },
      },
      guestPhoto: {
        create: async () => ({}),
      },
      stay: {
        create: async (args: any) => {
          createdRecords.stays.push(args.data);
          return { id: 'stay-1', ...args.data };
        },
      },
      stayGuest: {
        create: async (args: any) => {
          createdRecords.stayGuests.push(args.data);
          return args.data;
        },
      },
      roomAssignment: {
        create: async (args: any) => {
          createdRecords.roomAssignments.push(args.data);
          return args.data;
        },
      },
      folio: {
        create: async (args: any) => {
          createdRecords.folios.push(args.data);
          return { id: 'folio-1', ...args.data };
        },
      },
      folioItem: {
        create: async (args: any) => {
          createdRecords.folioItems.push(args.data);
          return args.data;
        },
      },
      auditLog: {
        create: async (args: any) => {
          createdRecords.auditLogs.push(args.data);
          return args.data;
        },
      },
    };

    const checkInResult = await executeCheckIn(
      {
        reservationId: mockReservation.id,
        roomId: mockRoomAvailable.id,
        expectedCheckOut: new Date(Date.now() + 86400000).toISOString(),
        idDocumentType: IdDocumentType.PASSPORT,
        idDocumentNumber: 'P12345678',
      },
      mockActor,
      mockTx
    );

    assert.strictEqual(checkInResult.roomNumber, 'D-201');
    assert.strictEqual(roomUpdatedStatus, PhysicalRoomStatus.OCCUPIED, 'Room must transition to OCCUPIED');
    assert.strictEqual(createdRecords.stays.length, 1, 'Stay must be created');
    assert.strictEqual(createdRecords.roomAssignments[0].status, RoomAssignmentStatus.ACTIVE);
    assert.strictEqual(createdRecords.folios[0].status, FolioStatus.OPEN);
    assert.strictEqual(createdRecords.folioItems[0].itemType, FolioItemType.ROOM_CHARGE);
  }

  // 2.2 Concurrency / Double Check-In Collision: Room is already OCCUPIED
  {
    const mockOccupiedRoom = {
      ...mockRoomAvailable,
      status: PhysicalRoomStatus.OCCUPIED,
      assignments: [{ id: 'existing-assignment', status: RoomAssignmentStatus.ACTIVE }],
    };

    const mockTx: any = {
      reservation: { findUnique: async () => mockReservation },
      room: { findUnique: async () => mockOccupiedRoom },
    };

    let threw = false;
    try {
      await executeCheckIn(
        {
          reservationId: mockReservation.id,
          roomId: mockOccupiedRoom.id,
          expectedCheckOut: new Date(Date.now() + 86400000).toISOString(),
          idDocumentType: IdDocumentType.PASSPORT,
          idDocumentNumber: 'P12345678',
        },
        mockActor,
        mockTx
      );
    } catch (err: any) {
      threw = true;
      assert.match(err.message, /ROOM_ALREADY_OCCUPIED/, 'Must fail with ROOM_ALREADY_OCCUPIED error');
    }
    assert.strictEqual(threw, true, 'Check-in on occupied room must throw');
  }

  // 2.3 Check-In on DIRTY or MAINTENANCE room must be blocked
  {
    for (const badStatus of [PhysicalRoomStatus.DIRTY, PhysicalRoomStatus.CLEANING, PhysicalRoomStatus.MAINTENANCE, PhysicalRoomStatus.OUT_OF_ORDER]) {
      const mockBadRoom = {
        ...mockRoomAvailable,
        status: badStatus,
      };

      const mockTx: any = {
        reservation: { findUnique: async () => mockReservation },
        room: { findUnique: async () => mockBadRoom },
      };

      let threw = false;
      try {
        await executeCheckIn(
          {
            reservationId: mockReservation.id,
            roomId: mockBadRoom.id,
            expectedCheckOut: new Date(Date.now() + 86400000).toISOString(),
            idDocumentType: IdDocumentType.PASSPORT,
            idDocumentNumber: 'P12345678',
          },
          mockActor,
          mockTx
        );
      } catch (err: any) {
        threw = true;
        assert.match(err.message, /ROOM_NOT_ELIGIBLE/, 'Must reject unready room status ' + badStatus);
      }
      assert.strictEqual(threw, true);
    }
  }

  // ----------------------------------------------------
  // 3. CHECK-OUT TRANSACTION & FOLIO SETTLEMENT TESTS
  // ----------------------------------------------------
  console.log('3. Testing Check-Out Transaction & Decimal Balance Enforcement...');

  const mockActiveStay = {
    id: 'stay-101',
    stayNumber: 'STY-20260904-9001',
    status: StayStatus.ACTIVE,
    reservationId: 'cjy0000000000000000000001',
    notes: 'Early checkin requested',
    roomAssignments: [
      {
        id: 'ra-1',
        status: RoomAssignmentStatus.ACTIVE,
        room: {
          id: 'room-101',
          roomNumber: 'D-201',
          status: PhysicalRoomStatus.OCCUPIED,
        },
      },
    ],
    folio: {
      id: 'folio-101',
      folioNumber: 'FOL-20260904-9001',
      status: FolioStatus.OPEN,
      totalCharges: new Prisma.Decimal(5000),
      totalCredits: new Prisma.Decimal(0),
      totalBalance: new Prisma.Decimal(5000),
      items: [
        {
          id: 'item-1',
          itemType: FolioItemType.ROOM_CHARGE,
          amount: new Prisma.Decimal(5000),
          isVoided: false,
        },
      ],
      payments: [],
    },
  };

  // 3.1 Checkout with Outstanding Balance and NO payment -> MUST FAIL
  {
    const mockTx: any = {
      stay: { findUnique: async () => mockActiveStay },
    };

    let threw = false;
    try {
      await executeCheckOut(
        {
          stayId: mockActiveStay.id,
        },
        mockActor,
        mockTx
      );
    } catch (err: any) {
      threw = true;
      assert.match(err.message, /OUTSTANDING_BALANCE_UNSETTLED/, 'Must block checkout if balance unsettled');
    }
    assert.strictEqual(threw, true, 'Checkout without settling balance must fail');
  }

  // 3.2 Checkout with Full Settlement Payment -> SUCCESS & OCCUPIED -> DIRTY
  {
    let updatedRoomStatus: PhysicalRoomStatus | null = null;
    let updatedStayStatus: StayStatus | null = null;
    let updatedAssignmentStatus: RoomAssignmentStatus | null = null;
    let updatedFolioStatus: FolioStatus | null = null;
    let paymentCreated = false;

    const mockTx: any = {
      stay: {
        findUnique: async () => mockActiveStay,
        update: async (args: any) => {
          updatedStayStatus = args.data.status;
          return { ...mockActiveStay, status: args.data.status };
        },
        findMany: async () => [], // no other active stays for reservation
      },
      payment: {
        create: async (args: any) => {
          paymentCreated = true;
          assert.strictEqual(args.data.context, PaymentContext.FOLIO_SETTLEMENT, 'Payment must have FOLIO_SETTLEMENT context');
          return args.data;
        },
      },
      folio: {
        update: async (args: any) => {
          updatedFolioStatus = args.data.status;
          assert.strictEqual(args.data.totalBalance.equals(0), true, 'Folio totalBalance must reach 0');
          return args.data;
        },
      },
      roomAssignment: {
        update: async (args: any) => {
          updatedAssignmentStatus = args.data.status;
          return args.data;
        },
      },
      room: {
        update: async (args: any) => {
          updatedRoomStatus = args.data.status;
          return args.data;
        },
      },
      reservation: {
        update: async () => ({}),
      },
      auditLog: {
        create: async () => ({}),
      },
    };

    const result = await executeCheckOut(
      {
        stayId: mockActiveStay.id,
        settlementPaymentMethod: PaymentMethod.CARD,
        settlementPaymentAmount: 5000,
        transactionReference: 'AUTH-CARD-789',
      },
      mockActor,
      mockTx
    );

    assert.strictEqual(paymentCreated, true, 'Settlement payment must be recorded');
    assert.strictEqual(updatedRoomStatus, PhysicalRoomStatus.DIRTY, 'Checkout must transition room OCCUPIED -> DIRTY');
    assert.strictEqual(updatedStayStatus, StayStatus.CHECKED_OUT, 'Stay status must be CHECKED_OUT');
    assert.strictEqual(updatedAssignmentStatus, RoomAssignmentStatus.ENDED, 'Room assignment must be ENDED');
    assert.strictEqual(updatedFolioStatus, FolioStatus.SETTLED, 'Folio must be SETTLED');
    assert.strictEqual(result.finalBalance.equals(0), true, 'Final balance must be exactly zero');
  }

  // ----------------------------------------------------
  // 4. RBAC PERMISSIONS FOR FRONT DESK WORKFLOWS
  // ----------------------------------------------------
  console.log('4. Verifying RBAC Boundaries for Front Desk Roles...');

  // RECEPTIONIST permissions
  assert.strictEqual(hasPermission({ role: 'RECEPTIONIST' }, 'checkin:perform'), true);
  assert.strictEqual(hasPermission({ role: 'RECEPTIONIST' }, 'checkout:perform'), true);
  assert.strictEqual(hasPermission({ role: 'RECEPTIONIST' }, 'guest:manage'), true);
  assert.strictEqual(hasPermission({ role: 'RECEPTIONIST' }, 'guest:view_sensitive'), false, 'RECEPTIONIST cannot view raw sensitive docs without explicit role');

  // SUPER_ADMIN has full permissions
  assert.strictEqual(hasPermission({ role: 'SUPER_ADMIN' }, 'checkin:perform'), true);
  assert.strictEqual(hasPermission({ role: 'SUPER_ADMIN' }, 'checkout:perform'), true);
  assert.strictEqual(hasPermission({ role: 'SUPER_ADMIN' }, 'guest:view_sensitive'), true);

  // RESTAURANT roles CANNOT perform check-in or checkout
  assert.strictEqual(hasPermission({ role: 'RESTAURANT_MANAGER' }, 'checkin:perform'), false);
  assert.strictEqual(hasPermission({ role: 'RESTAURANT_BILLER' }, 'checkout:perform'), false);
  assert.strictEqual(hasPermission({ role: 'KITCHEN_STAFF' }, 'checkin:perform'), false);
  assert.strictEqual(hasPermission({ role: 'STORE_MANAGER' }, 'checkout:perform'), false);

  console.log('--- All Front Desk Stay Lifecycle & Security Tests PASSED! ---');
}

runFrontDeskTestSuite().catch((err) => {
  console.error('FRONT DESK TEST SUITE FAILED:', err);
  process.exit(1);
});
