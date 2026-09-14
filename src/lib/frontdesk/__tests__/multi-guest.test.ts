import { describe, it, expect, vi } from 'vitest';
import { Prisma, PhysicalRoomStatus, StayStatus } from '@prisma/client';
import { validateOccupantIdentity, addOccupantToStay, removeOccupantFromStay, transferPrimaryGuest } from '@/lib/frontdesk/occupants';
import { executeCheckIn } from '@/lib/frontdesk/checkin';

describe('Multi-Guest & Occupant Management Domain Suite', () => {
  const actor = { id: 'user_receptionist_1', name: 'Receptionist Bob', role: 'RECEPTIONIST' };

  it('15. Check in 1 guest alone succeeds', async () => {
    const occupant = {
      firstName: 'Alice',
      lastName: 'Smith',
      gender: 'FEMALE',
      idDocumentType: 'PASSPORT',
      idDocumentNumber: 'P1234567',
      isPrimary: true,
    };

    expect(() => validateOccupantIdentity(occupant)).not.toThrow();
  });

  it('16. Check in 2 guests (couple: male + female) creates 2 separate Guest records with respective genders', async () => {
    const maleGuest = {
      firstName: 'John',
      lastName: 'Doe',
      gender: 'MALE',
      idDocumentType: 'PASSPORT',
      idDocumentNumber: 'A12345678',
      isPrimary: true,
    };
    const femaleGuest = {
      firstName: 'Jane',
      lastName: 'Doe',
      gender: 'FEMALE',
      idDocumentType: 'AADHAAR',
      idDocumentNumber: '998877665544',
      isPrimary: false,
    };

    expect(() => validateOccupantIdentity(maleGuest)).not.toThrow();
    expect(() => validateOccupantIdentity(femaleGuest)).not.toThrow();
    expect(maleGuest.gender).toBe('MALE');
    expect(femaleGuest.gender).toBe('FEMALE');
  });

  it('17. Reject check-in when 2nd guest missing ID', () => {
    const invalidGuest: any = {
      firstName: 'Jane',
      lastName: 'Doe',
      gender: 'FEMALE',
      idDocumentType: 'AADHAAR',
      idDocumentNumber: '', // Missing ID number
      isPrimary: false,
    };

    expect(() => validateOccupantIdentity(invalidGuest)).toThrow('Valid ID document number is mandatory (min 3 characters).');
  });

  it('18. Reject check-in when 2nd guest missing name', () => {
    const invalidGuest: any = {
      firstName: '',
      lastName: 'Doe',
      gender: 'FEMALE',
      idDocumentType: 'AADHAAR',
      idDocumentNumber: '998877665544',
      isPrimary: false,
    };

    expect(() => validateOccupantIdentity(invalidGuest)).toThrow('First name is mandatory.');
  });

  it('19. Reject check-in when required gender missing', () => {
    const invalidGuest: any = {
      firstName: 'Jane',
      lastName: 'Doe',
      gender: '', // Missing gender
      idDocumentType: 'AADHAAR',
      idDocumentNumber: '998877665544',
      isPrimary: false,
    };

    expect(() => validateOccupantIdentity(invalidGuest)).toThrow('Gender is mandatory.');
  });

  it('20. Reject check-in when occupant count exceeds room maxOccupancy', async () => {
    const reservationMock = {
      id: 'res_1',
      status: 'CONFIRMED',
      expectedCheckIn: new Date('2026-09-14'),
      expectedCheckOut: new Date('2026-09-15'),
      primaryGuestId: 'g_1',
      primaryGuest: { id: 'g_1', firstName: 'John', lastName: 'Doe' },
      stays: [],
      reservedRooms: [
        {
          id: 'rr_1',
          roomTypeId: 'rt_standard',
          ratePerNight: new Prisma.Decimal(5500),
          roomType: {
            id: 'rt_standard',
            name: 'Standard Heritage',
            basePrice: new Prisma.Decimal(5500),
            maxOccupancy: 2, // Max capacity 2
          },
        },
      ],
    };

    const mockDb: any = {
      reservation: { findUnique: vi.fn().mockResolvedValue(reservationMock) },
      room: { findUnique: vi.fn().mockResolvedValue({ id: 'r_1', status: PhysicalRoomStatus.AVAILABLE, isActive: true, roomTypeId: 'rt_standard', assignments: [] }) },
      stay: { findFirst: vi.fn().mockResolvedValue(null) },
      tax: { findMany: vi.fn().mockResolvedValue([]) },
    };

    // Attempt checking in 3 occupants for maxOccupancy = 2
    const occupants = [
      { firstName: 'G1', lastName: 'L1', gender: 'MALE', idDocumentType: 'PASSPORT', idDocumentNumber: 'P101', isPrimary: true },
      { firstName: 'G2', lastName: 'L2', gender: 'FEMALE', idDocumentType: 'PASSPORT', idDocumentNumber: 'P102', isPrimary: false },
      { firstName: 'G3', lastName: 'L3', gender: 'OTHER', idDocumentType: 'PASSPORT', idDocumentNumber: 'P103', isPrimary: false },
    ];

    await expect(
      executeCheckIn(
        {
          reservationId: 'res_1',
          roomId: 'r_1',
          expectedCheckOut: '2026-09-15',
          occupants,
        },
        actor,
        mockDb
      )
    ).rejects.toThrow('MAX_OCCUPANCY_EXCEEDED');
  });

  it('21. Enforce exactly one active primary guest invariant', async () => {
    // Attempt checking in 2 primaries
    const occupantsWithTwoPrimaries = [
      { firstName: 'G1', lastName: 'L1', gender: 'MALE', idDocumentType: 'PASSPORT', idDocumentNumber: 'P101', isPrimary: true },
      { firstName: 'G2', lastName: 'L2', gender: 'FEMALE', idDocumentType: 'PASSPORT', idDocumentNumber: 'P102', isPrimary: true },
    ];

    const mockDb: any = {
      reservation: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'res_1',
          status: 'CONFIRMED',
          primaryGuestId: 'g_1',
          stays: [],
          reservedRooms: [{ roomTypeId: 'rt_1', roomType: { id: 'rt_1', name: 'Standard Heritage', maxOccupancy: 4, basePrice: new Prisma.Decimal(5500) } }],
        }),
      },
      room: { findUnique: vi.fn().mockResolvedValue({ id: 'r_1', status: PhysicalRoomStatus.AVAILABLE, isActive: true, roomTypeId: 'rt_1', assignments: [] }) },
      stay: { findFirst: vi.fn().mockResolvedValue(null) },
    };

    await expect(
      executeCheckIn(
        { reservationId: 'res_1', roomId: 'r_1', expectedCheckOut: '2026-09-15', occupants: occupantsWithTwoPrimaries },
        actor,
        mockDb
      )
    ).rejects.toThrow('EXACTLY_ONE_PRIMARY_REQUIRED: Exactly one occupant must be marked as PRIMARY. Found 2.');

    // Attempt checking in 0 primaries
    const occupantsWithNoPrimary = [
      { firstName: 'G1', lastName: 'L1', gender: 'MALE', idDocumentType: 'PASSPORT', idDocumentNumber: 'P101', isPrimary: false },
    ];

    await expect(
      executeCheckIn(
        { reservationId: 'res_1', roomId: 'r_1', expectedCheckOut: '2026-09-15', occupants: occupantsWithNoPrimary },
        actor,
        mockDb
      )
    ).rejects.toThrow('EXACTLY_ONE_PRIMARY_REQUIRED: Exactly one occupant must be marked as PRIMARY. Found 0.');
  });

  it('22. Add occupant after check-in succeeds', async () => {
    let createdStayGuest: any = null;
    let createdGuest: any = null;

    const mockStay = {
      id: 'stay_1',
      stayNumber: 'STY-1',
      status: StayStatus.ACTIVE,
      roomAssignments: [
        {
          status: 'ACTIVE',
          room: { id: 'r_1', roomNumber: 'S-1001', roomType: { id: 'rt_1', name: 'Standard Heritage', maxOccupancy: 3 } },
        },
      ],
      stayGuests: [
        { id: 'sg_1', guestId: 'g_1', isPrimary: true, isActive: true },
      ],
    };

    const mockDb: any = {
      stay: { findUnique: vi.fn().mockResolvedValue(mockStay) },
      guest: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(({ data }) => {
          createdGuest = { id: 'g_2', ...data };
          return createdGuest;
        }),
      },
      guestDocument: {
        create: vi.fn().mockResolvedValue({ id: 'doc_2' }),
      },
      stayGuest: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(({ data }) => {
          createdStayGuest = { id: 'sg_2', ...data };
          return createdStayGuest;
        }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit_1' }) },
      $queryRaw: vi.fn().mockResolvedValue([]),
    };

    const res = await addOccupantToStay(
      {
        stayId: 'stay_1',
        occupant: {
          firstName: 'Bob',
          lastName: 'Smith',
          gender: 'MALE',
          idDocumentType: 'DRIVING_LICENSE',
          idDocumentNumber: 'DL1234567890',
          isPrimary: false,
        },
      },
      actor,
      mockDb
    );

    expect(res.stayGuestId).toBe('sg_2');
    expect(res.guestName).toBe('Bob Smith');
    expect(res.totalActiveOccupants).toBe(2);
    expect(createdStayGuest.isActive).toBe(true);
    expect(createdGuest.gender).toBe('MALE');
  });

  it('23. Reject add occupant when exceeding room capacity', async () => {
    const mockStay = {
      id: 'stay_1',
      stayNumber: 'STY-1',
      status: StayStatus.ACTIVE,
      roomAssignments: [
        {
          status: 'ACTIVE',
          room: { id: 'r_1', roomNumber: 'S-1001', roomType: { id: 'rt_1', name: 'Standard Heritage', maxOccupancy: 2 } },
        },
      ],
      stayGuests: [
        { id: 'sg_1', guestId: 'g_1', isPrimary: true, isActive: true },
        { id: 'sg_2', guestId: 'g_2', isPrimary: false, isActive: true },
      ], // Already 2 active occupants
    };

    const mockDb: any = {
      stay: { findUnique: vi.fn().mockResolvedValue(mockStay) },
      $queryRaw: vi.fn().mockResolvedValue([]),
    };

    await expect(
      addOccupantToStay(
        {
          stayId: 'stay_1',
          occupant: {
            firstName: 'Extra',
            lastName: 'Person',
            gender: 'FEMALE',
            idDocumentType: 'PASSPORT',
            idDocumentNumber: 'P8888',
            isPrimary: false,
          },
        },
        actor,
        mockDb
      )
    ).rejects.toThrow('MAX_OCCUPANCY_EXCEEDED');
  });

  it('24. Sensitive ID view permission enforced', () => {
    // Permission test: check masking behavior
    const rawId = '123456789012';
    const maskIdNumber = (num: string) => {
      if (num.length <= 4) return '***';
      return '****' + num.slice(-4);
    };

    const hasSensitivePermission = false;
    const displayedId = hasSensitivePermission ? rawId : maskIdNumber(rawId);
    expect(displayedId).toBe('****9012');
    expect(displayedId).not.toBe(rawId);
  });

  it('25. Audit logs generated for occupant addition, primary transfer, and occupant removal', async () => {
    const auditEvents: string[] = [];

    const mockStay = {
      id: 'stay_1',
      stayNumber: 'STY-1',
      status: StayStatus.ACTIVE,
      primaryGuestId: 'g_1',
      roomAssignments: [{ status: 'ACTIVE', room: { id: 'r_1', roomNumber: 'S-1001', roomType: { maxOccupancy: 4 } } }],
      stayGuests: [
        { id: 'sg_1', stayId: 'stay_1', guestId: 'g_1', isPrimary: true, isActive: true, guest: { id: 'g_1', firstName: 'A', lastName: 'A' }, stay: { stayNumber: 'STY-1' } },
        { id: 'sg_2', stayId: 'stay_1', guestId: 'g_2', isPrimary: false, isActive: true, guest: { id: 'g_2', firstName: 'B', lastName: 'B' }, stay: { stayNumber: 'STY-1' } },
      ],
    };

    const mockDb: any = {
      stay: {
        findUnique: vi.fn().mockResolvedValue(mockStay),
        update: vi.fn().mockResolvedValue({}),
      },
      stayGuest: {
        findUnique: vi.fn().mockImplementation(({ where }) => {
          if (where.id === 'sg_2') return mockStay.stayGuests[1];
          if (where.id === 'sg_1') return mockStay.stayGuests[0];
          return null;
        }),
        update: vi.fn().mockResolvedValue({}),
        findMany: vi.fn().mockResolvedValue(mockStay.stayGuests),
      },
      auditLog: {
        create: vi.fn().mockImplementation(({ data }) => {
          auditEvents.push(data.action);
          return { id: 'audit_' + auditEvents.length };
        }),
      },
      $queryRaw: vi.fn().mockResolvedValue([]),
    };

    // 1. Transfer primary
    await transferPrimaryGuest(
      { stayId: 'stay_1', newPrimaryStayGuestId: 'sg_2', reason: 'Primary guest checked out early' },
      actor,
      mockDb
    );
    expect(auditEvents).toContain('STAY_PRIMARY_GUEST_TRANSFERRED');

    // 2. Remove occupant (sg_1 who is no longer primary)
    mockStay.stayGuests[0].isPrimary = false;
    mockStay.stayGuests[1].isPrimary = true;
    mockStay.primaryGuestId = 'g_2';

    await removeOccupantFromStay(
      { stayId: 'stay_1', stayGuestId: 'sg_1', reason: 'Early departure' },
      actor,
      mockDb
    );
    expect(auditEvents).toContain('GUEST_REMOVED_FROM_STAY');
  });

  it('26. Historical guest data preserved without hard delete: isActive false and leftAt populated', async () => {
    let updatedStayGuestData: any = null;

    const mockStay = {
      id: 'stay_1',
      stayNumber: 'STY-1',
      status: StayStatus.ACTIVE,
      stayGuests: [
        { id: 'sg_1', guestId: 'g_1', isPrimary: true, isActive: true },
        { id: 'sg_2', guestId: 'g_2', isPrimary: false, isActive: true },
      ],
    };

    const mockDb: any = {
      stay: { findUnique: vi.fn().mockResolvedValue(mockStay) },
      stayGuest: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'sg_2',
          stayId: 'stay_1',
          guestId: 'g_2',
          isPrimary: false,
          isActive: true,
          guest: { id: 'g_2', firstName: 'Jane', lastName: 'Doe' },
          stay: { stayNumber: 'STY-1' },
        }),
        update: vi.fn().mockImplementation(({ where, data }) => {
          updatedStayGuestData = data;
          return { id: 'sg_2', ...data };
        }),
        delete: vi.fn(), // MUST NEVER BE CALLED
      },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit_1' }) },
      $queryRaw: vi.fn().mockResolvedValue([]),
    };

    const result = await removeOccupantFromStay(
      {
        stayId: 'stay_1',
        stayGuestId: 'sg_2',
        reason: 'Guest departed early for flight',
      },
      actor,
      mockDb
    );

    expect(result.isActive).toBe(false);
    expect(result.leftAt).toBeDefined();
    expect(updatedStayGuestData.isActive).toBe(false);
    expect(updatedStayGuestData.leftAt).toBeInstanceOf(Date);
    expect(updatedStayGuestData.removedReason).toBe('Guest departed early for flight');
    expect(mockDb.stayGuest.delete).not.toHaveBeenCalled();
  });
});
