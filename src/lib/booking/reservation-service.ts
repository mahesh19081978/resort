import { prisma } from '@/lib/db/prisma';
import { Prisma, ReservationStatus, BookingSource, PaymentStatus, PaymentContext, RefundStatus } from '@prisma/client';
import { getAvailableRoomTypes } from '@/lib/availability/service';
import { calculateNights, calculateReservationPricing, roundCurrency } from './pricing-calculator';
import { generateBookingNumber, generateRefundIdempotencyKey } from './numbers';
import { CreateBookingRequestInput, GatewayWebhookInput } from './schema';
import { recordAuditEvent } from '@/lib/auth/audit';

export interface SanitizedPublicBooking {
  reservationId: string;
  reservationNumber: string;
  status: ReservationStatus;
  checkInDate: string;
  checkOutDate: string;
  adults: number;
  children: number;
  totalRooms: number;
  totalAmount: number;
  requiredAdvanceAmount: number;
  advancePaidAmount: number;
  expiresAt: string | null;
  maskedGuestName: string;
  maskedEmail: string;
  rooms: Array<{
    roomTypeId: string;
    roomTypeName: string;
    roomsCount: number;
    ratePerNight: number;
    lineTotal: number;
  }>;
}

function maskName(firstName: string, lastName: string): string {
  const f = firstName.length > 1 ? `${firstName[0]}***` : firstName;
  const l = lastName.length > 1 ? `${lastName[0]}***` : lastName;
  return `${f} ${l}`;
}

function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return '***';
  const u = user.length > 2 ? `${user[0]}***${user[user.length - 1]}` : `${user[0]}***`;
  return `${u}@${domain}`;
}

export function sanitizeReservation(res: any): SanitizedPublicBooking {
  const primaryGuest = res.primaryGuest;
  const guestName = primaryGuest ? maskName(primaryGuest.firstName, primaryGuest.lastName) : 'Guest';
  const guestEmail = primaryGuest?.email ? maskEmail(primaryGuest.email) : '***';

  const rooms = (res.reservedRooms || []).map((rr: any) => ({
    roomTypeId: rr.roomTypeId,
    roomTypeName: rr.roomType?.name || 'Room',
    roomsCount: rr.roomsCount,
    ratePerNight: Number(rr.ratePerNight),
    lineTotal: Number(rr.lineTotal),
  }));

  return {
    reservationId: res.id,
    reservationNumber: res.reservationNumber,
    status: res.status,
    checkInDate: res.checkInDate instanceof Date ? res.checkInDate.toISOString().slice(0, 10) : String(res.checkInDate).slice(0, 10),
    checkOutDate: res.checkOutDate instanceof Date ? res.checkOutDate.toISOString().slice(0, 10) : String(res.checkOutDate).slice(0, 10),
    adults: res.adults,
    children: res.children,
    totalRooms: res.totalRooms,
    totalAmount: Number(res.totalAmount),
    requiredAdvanceAmount: Number(res.totalAmount), // 100% advance by default
    advancePaidAmount: Number(res.advancePaidAmount),
    expiresAt: res.expiresAt ? (res.expiresAt instanceof Date ? res.expiresAt.toISOString() : String(res.expiresAt)) : null,
    maskedGuestName: guestName,
    maskedEmail: guestEmail,
    rooms,
  };
}

/**
 * Authoritative transactional reservation creation engine.
 */
export async function createReservationHold(
  input: CreateBookingRequestInput,
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<SanitizedPublicBooking> {
  // If called directly without transaction, wrap in transaction runner with P2002 rollback boundary
  if (client === prisma) {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await prisma.$transaction(async (tx) => executeHoldCreation(tx, input), {
          maxWait: 15000,
          timeout: 35000,
        });
      } catch (err: any) {
        // P2002 boundary: If concurrent request with same bookingRequestId collided
        const isBookingRequestIdConflict =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          (err.message.includes('bookingRequestId') ||
            (Array.isArray(err.meta?.target) && (err.meta.target as string[]).includes('bookingRequestId')));

        if (isBookingRequestIdConflict) {
          // Execute a fresh query OUTSIDE the aborted transaction
          const existing = await prisma.reservation.findUnique({
            where: { bookingRequestId: input.bookingRequestId },
            include: {
              primaryGuest: true,
              reservedRooms: { include: { roomType: true } },
            },
          });
          if (existing) {
            return sanitizeReservation(existing);
          }
        }

        // Check if retryable transaction timeout or lock timeout error
        const isTimeoutOrLockContention =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          (err.code === 'P2028' || err.code === 'P2034');

        if (isTimeoutOrLockContention && attempt < maxAttempts) {
          // Check if an idempotent winner has already completed during lock contention
          const existing = await prisma.reservation.findUnique({
            where: { bookingRequestId: input.bookingRequestId },
            include: {
              primaryGuest: true,
              reservedRooms: { include: { roomType: true } },
            },
          });
          if (existing) {
            return sanitizeReservation(existing);
          }

          // Exponential backoff before retry
          await new Promise((resolve) => setTimeout(resolve, 100 * attempt + Math.random() * 100));
          continue;
        }

        throw err;
      }
    }
  }

  return await executeHoldCreation(client as Prisma.TransactionClient, input);
}

async function executeHoldCreation(
  tx: Prisma.TransactionClient,
  input: CreateBookingRequestInput
): Promise<SanitizedPublicBooking> {
  // 1. Check existing bookingRequestId inside transaction first
  const existing = await tx.reservation.findUnique({
    where: { bookingRequestId: input.bookingRequestId },
    include: {
      primaryGuest: true,
      reservedRooms: { include: { roomType: true } },
    },
  });

  if (existing) {
    return sanitizeReservation(existing);
  }

  // 2. Query Authoritative Database Time (Zero server clock skew)
  const dbTimeResult = await tx.$queryRaw<Array<{ dbNow: Date; expiresAt: Date }>>`
    SELECT NOW() AS "dbNow", NOW() + INTERVAL '15 minutes' AS "expiresAt"
  `;
  const dbNow = dbTimeResult[0].dbNow;
  const dbExpiresAt = dbTimeResult[0].expiresAt;

  // 3. Deterministic RoomType Row-Locking (ORDER BY id ASC to avoid deadlocks)
  const requestedRoomTypeIds = Array.from(new Set(input.rooms.map((r) => r.roomTypeId))).sort();

  await tx.$queryRaw`
    SELECT id FROM "RoomType"
    WHERE id = ANY(${requestedRoomTypeIds}::text[])
    ORDER BY id ASC
    FOR UPDATE
  `;

  // Re-check bookingRequestId under the lock in case a racing thread just committed it
  const existingAfterLock = await tx.reservation.findUnique({
    where: { bookingRequestId: input.bookingRequestId },
    include: {
      primaryGuest: true,
      reservedRooms: { include: { roomType: true } },
    },
  });

  if (existingAfterLock) {
    return sanitizeReservation(existingAfterLock);
  }

  // 4. Fetch RoomTypes under lock
  const roomTypes = await tx.roomType.findMany({
    where: { id: { in: requestedRoomTypeIds }, isActive: true },
  });

  if (roomTypes.length !== requestedRoomTypeIds.length) {
    throw new Error('ONE_OR_MORE_ROOM_TYPES_INVALID_OR_INACTIVE');
  }

  // 5. Unified Occupancy Validation
  let totalRequestedRooms = 0;
  for (const item of input.rooms) {
    totalRequestedRooms += item.roomsCount;
  }

  // Validate occupancy against room types
  const numChildren = input.children ?? 0;
  const totalGuests = input.adults + numChildren;
  for (const item of input.rooms) {
    const rt = roomTypes.find((r) => r.id === item.roomTypeId)!;
    // Each room must accommodate the proportional share or max capacity
    if (rt.maxOccupancy < Math.ceil(totalGuests / totalRequestedRooms)) {
      throw new Error(`OCCUPANCY_EXCEEDED: Room type [${rt.name}] maximum occupancy is ${rt.maxOccupancy}`);
    }
  }

  // 6. Authoritative Availability Recheck under active lock
  const availabilityResult = await getAvailableRoomTypes(
    {
      checkIn: input.checkInDate,
      checkOut: input.checkOutDate,
      guests: totalGuests,
      adults: input.adults,
      children: numChildren,
    },
    tx
  );

  for (const item of input.rooms) {
    const available = availabilityResult.availableRoomTypes.find((a) => a.roomTypeId === item.roomTypeId);
    if (!available || available.availableRoomCount < item.roomsCount) {
      const rt = roomTypes.find((r) => r.id === item.roomTypeId)!;
      throw new Error(
        `INSUFFICIENT_INVENTORY: Requested ${item.roomsCount} room(s) of type [${rt.name}], but only ${available?.availableRoomCount ?? 0} available.`
      );
    }
  }

  // 7. Case-Insensitive Guest Deduplication
  const normalizedEmail = input.guest.email.trim().toLowerCase();
  const normalizedPhone = input.guest.phone.replace(/[^0-9+]/g, '');

  let guest = await tx.guest.findFirst({
    where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
  });

  if (guest) {
    // Update missing fields
    guest = await tx.guest.update({
      where: { id: guest.id },
      data: {
        firstName: input.guest.firstName,
        lastName: input.guest.lastName,
        phone: normalizedPhone,
        address: input.guest.address || guest.address,
        city: input.guest.city || guest.city,
        state: input.guest.state || guest.state,
        postalCode: input.guest.postalCode || guest.postalCode,
        country: input.guest.country || guest.country,
      },
    });
  } else {
    // Check by phone
    const existingByPhone = await tx.guest.findMany({
      where: { phone: normalizedPhone },
    });

    if (existingByPhone.length === 1) {
      // Exactly 1 match: attach email if missing
      guest = await tx.guest.update({
        where: { id: existingByPhone[0].id },
        data: {
          email: normalizedEmail,
          firstName: input.guest.firstName,
          lastName: input.guest.lastName,
        },
      });
    } else {
      // Create new guest
      guest = await tx.guest.create({
        data: {
          firstName: input.guest.firstName,
          lastName: input.guest.lastName,
          email: normalizedEmail,
          phone: normalizedPhone,
          address: input.guest.address || null,
          city: input.guest.city || null,
          state: input.guest.state || null,
          postalCode: input.guest.postalCode || null,
          country: input.guest.country || 'India',
        },
      });
    }
  }

  // 8. Authoritative 9-Step Pricing Pipeline
  // Fetch active Tax rate for room accommodation from DB
  const taxRecord = await tx.tax.findFirst({
    where: { code: 'ROOM_GST', isActive: true },
  });
  const taxRate = taxRecord ? taxRecord.rate : new Prisma.Decimal(12.0); // Configured tax rate from DB

  const nights = calculateNights(input.checkInDate, input.checkOutDate);
  const pricingItems = input.rooms.map((item) => {
    const rt = roomTypes.find((r) => r.id === item.roomTypeId)!;
    return {
      roomTypeId: item.roomTypeId,
      roomsCount: item.roomsCount,
      basePrice: rt.basePrice,
      nights,
    };
  });

  const pricing = calculateReservationPricing({
    items: pricingItems,
    taxRatePercent: taxRate,
    depositRatio: 1.0, // 100% advance deposit requirement
  });

  // 9. Generate Collision-Resistant Reservation Number (RES-YYYYMMDD-XXXXXX)
  const reservationNumber = generateBookingNumber('RES');

  // 10. Atomic Insertion of Reservation & ReservationRooms
  const reservation = await tx.reservation.create({
    data: {
      reservationNumber,
      bookingRequestId: input.bookingRequestId,
      primaryGuestId: guest.id,
      checkInDate: new Date(`${input.checkInDate}T00:00:00.000Z`),
      checkOutDate: new Date(`${input.checkOutDate}T00:00:00.000Z`),
      adults: input.adults,
      children: input.children,
      totalRooms: totalRequestedRooms,
      source: BookingSource.DIRECT_WEBSITE,
      status: ReservationStatus.PENDING,
      specialRequests: input.specialRequests || null,
      subtotal: pricing.subtotal,
      discountAmount: pricing.discountAmount,
      taxAmount: pricing.taxAmount,
      totalAmount: pricing.totalAmount,
      advancePaidAmount: new Prisma.Decimal(0.0),
      expiresAt: dbExpiresAt,
      reservedRooms: {
        create: pricing.lines.map((l) => ({
          roomTypeId: l.roomTypeId,
          roomsCount: l.roomsCount,
          ratePerNight: l.ratePerNight,
          totalNights: l.totalNights,
          discountAmount: l.discountAmount,
          taxAmount: l.taxAmount,
          lineTotal: l.lineTotal,
        })),
      },
    },
    include: {
      primaryGuest: true,
      reservedRooms: { include: { roomType: true } },
    },
  });

  await recordAuditEvent(
    {
      action: 'RESERVATION_HOLD_CREATED',
      entity: 'Reservation',
      entityId: reservation.id,
      newValues: {
        reservationNumber: reservation.reservationNumber,
        bookingRequestId: reservation.bookingRequestId,
        totalAmount: Number(reservation.totalAmount),
        expiresAt: dbExpiresAt.toISOString(),
      },
    },
    tx
  );

  return sanitizeReservation(reservation);
}

/**
 * Handles payment confirmation webhook with authoritative state matrix.
 */
export async function processPaymentWebhook(
  payload: GatewayWebhookInput,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  return await (client === prisma
    ? prisma.$transaction(async (tx) => executeWebhookProcessing(tx, payload), {
        maxWait: 10000,
        timeout: 25000,
      })
    : executeWebhookProcessing(client as Prisma.TransactionClient, payload));
}

async function executeWebhookProcessing(
  tx: Prisma.TransactionClient,
  payload: GatewayWebhookInput
) {
  // 1. Idempotency check: provider + providerTransactionId unique
  const existingPayment = await tx.payment.findUnique({
    where: {
      provider_providerTransactionId: {
        provider: payload.provider,
        providerTransactionId: payload.providerTransactionId,
      },
    },
    include: { reservation: true },
  });

  if (existingPayment) {
    return {
      status: 'IDEMPOTENT_REPLAY',
      payment: existingPayment,
      reservation: existingPayment.reservation,
    };
  }

  // 2. Lock Reservation row
  const reservation = await tx.reservation.findUnique({
    where: { id: payload.reservationId },
  });

  if (!reservation) {
    throw new Error(`RESERVATION_NOT_FOUND: ${payload.reservationId}`);
  }

  // 3. Database-side time check
  const dbTime = await tx.$queryRaw<Array<{ dbNow: Date }>>`SELECT NOW() AS "dbNow"`;
  const dbNow = dbTime[0].dbNow;
  const isHoldExpired = reservation.expiresAt ? reservation.expiresAt.getTime() <= dbNow.getTime() : true;

  const capturedAmount = new Prisma.Decimal(payload.amount);
  const isGatewaySuccess = payload.eventType === 'payment.success';

  // 4. Verification of Amount and Currency
  const expectedAmount = new Prisma.Decimal(reservation.totalAmount);
  const isAmountMatching = capturedAmount.equals(expectedAmount);
  const isCurrencyValid = payload.currency === 'INR';

  if (!isCurrencyValid) {
    await recordAuditEvent(
      {
        action: 'PAYMENT_CURRENCY_INVALID',
        entity: 'Payment',
        entityId: payload.providerTransactionId,
        newValues: { currency: payload.currency, providerTx: payload.providerTransactionId },
      },
      tx
    );
    throw new Error(`INVALID_CURRENCY: Expected INR, received ${payload.currency}`);
  }

  // ── SCENARIO A: GATEWAY SUCCESS + UNEXPIRED HOLD + CORRECT AMOUNT ──
  if (isGatewaySuccess && !isHoldExpired && isAmountMatching && reservation.status === ReservationStatus.PENDING) {
    const paymentNumber = generateBookingNumber('RES').replace('RES', 'PAY');
    const payment = await tx.payment.create({
      data: {
        paymentNumber,
        context: PaymentContext.RESERVATION_ADVANCE,
        amount: capturedAmount,
        currency: 'INR',
        method: 'ONLINE',
        status: PaymentStatus.SUCCESS,
        provider: payload.provider,
        providerTransactionId: payload.providerTransactionId,
        idempotencyKey: payload.idempotencyKey,
        reservationId: reservation.id,
      },
    });

    const updatedRes = await tx.reservation.update({
      where: { id: reservation.id },
      data: {
        status: ReservationStatus.CONFIRMED,
        advancePaidAmount: capturedAmount,
        expiresAt: null, // Clear hold
      },
    });

    await recordAuditEvent(
      {
        action: 'RESERVATION_CONFIRMED_VIA_PAYMENT',
        entity: 'Reservation',
        entityId: reservation.id,
        newValues: {
          reservationNumber: reservation.reservationNumber,
          paymentNumber: payment.paymentNumber,
          amount: Number(capturedAmount),
        },
      },
      tx
    );

    return { status: 'CONFIRMED', payment, reservation: updatedRes };
  }

  // ── SCENARIO B: GATEWAY SUCCESS + AMOUNT MISMATCH (Underpayment or Overpayment) ──
  if (isGatewaySuccess && !isAmountMatching) {
    // Record true financial capture
    const paymentNumber = generateBookingNumber('RES').replace('RES', 'PAY');
    const payment = await tx.payment.create({
      data: {
        paymentNumber,
        context: PaymentContext.RESERVATION_ADVANCE,
        amount: capturedAmount,
        currency: 'INR',
        method: 'ONLINE',
        status: PaymentStatus.SUCCESS,
        provider: payload.provider,
        providerTransactionId: payload.providerTransactionId,
        idempotencyKey: payload.idempotencyKey,
        reservationId: reservation.id,
        notes: `AMOUNT_MISMATCH: Captured ₹${capturedAmount} vs Expected ₹${expectedAmount}`,
      },
    });

    // Auto-void pending reservation so no further payments stack
    let updatedRes = reservation;
    if (reservation.status === ReservationStatus.PENDING) {
      updatedRes = await tx.reservation.update({
        where: { id: reservation.id },
        data: {
          status: ReservationStatus.CANCELLED,
          cancellationReason: 'PAYMENT_AMOUNT_MISMATCH_AUTO_VOID',
        },
      });
    }

    // Generate Refund in status PENDING
    const refundNumber = generateBookingNumber('REF');
    const refund = await tx.refund.create({
      data: {
        refundNumber,
        paymentId: payment.id,
        amount: capturedAmount,
        reason: `Payment amount mismatch (Captured: ₹${capturedAmount}, Expected: ₹${expectedAmount}). Reversal pending.`,
        reasonCode: 'AMOUNT_MISMATCH_REVERSAL',
        status: RefundStatus.PENDING,
        idempotencyKey: generateRefundIdempotencyKey('AMOUNT_MISMATCH', payload.provider, payload.providerTransactionId),
      },
    });

    await recordAuditEvent(
      {
        action: 'PAYMENT_AMOUNT_MISMATCH_AUTO_REVERSAL',
        entity: 'Reservation',
        entityId: reservation.id,
        newValues: {
          reservationNumber: reservation.reservationNumber,
          capturedAmount: Number(capturedAmount),
          expectedAmount: Number(expectedAmount),
          refundNumber: refund.refundNumber,
        },
      },
      tx
    );

    return { status: 'AMOUNT_MISMATCH_REVERSAL', payment, refund, reservation: updatedRes };
  }

  // ── SCENARIO C: GATEWAY SUCCESS + EXPIRED HOLD OR ALREADY EXPIRED ──
  if (isGatewaySuccess && (isHoldExpired || reservation.status === ReservationStatus.EXPIRED)) {
    const paymentNumber = generateBookingNumber('RES').replace('RES', 'PAY');
    const payment = await tx.payment.create({
      data: {
        paymentNumber,
        context: PaymentContext.RESERVATION_ADVANCE,
        amount: capturedAmount,
        currency: 'INR',
        method: 'ONLINE',
        status: PaymentStatus.SUCCESS,
        provider: payload.provider,
        providerTransactionId: payload.providerTransactionId,
        idempotencyKey: payload.idempotencyKey,
        reservationId: reservation.id,
        notes: 'LATE_PAYMENT: Captured after 15-minute hold expired.',
      },
    });

    // Ensure reservation is set to EXPIRED
    const updatedRes = await tx.reservation.update({
      where: { id: reservation.id },
      data: { status: ReservationStatus.EXPIRED },
    });

    const refundNumber = generateBookingNumber('REF');
    const refund = await tx.refund.create({
      data: {
        refundNumber,
        paymentId: payment.id,
        amount: capturedAmount,
        reason: 'Payment captured after 15-minute hold expired. Reservation was not confirmed.',
        reasonCode: 'LATE_PAYMENT_EXPIRED_HOLD',
        status: RefundStatus.PENDING,
        idempotencyKey: generateRefundIdempotencyKey('LATE_HOLD', payload.provider, payload.providerTransactionId),
      },
    });

    await recordAuditEvent(
      {
        action: 'LATE_PAYMENT_EXPIRED_HOLD_REFUND',
        entity: 'Reservation',
        entityId: reservation.id,
        newValues: {
          reservationNumber: reservation.reservationNumber,
          refundNumber: refund.refundNumber,
        },
      },
      tx
    );

    return { status: 'LATE_PAYMENT_REFUND', payment, refund, reservation: updatedRes };
  }

  // ── SCENARIO D: GATEWAY SUCCESS ON CANCELLED RESERVATION ──
  if (isGatewaySuccess && reservation.status === ReservationStatus.CANCELLED) {
    const paymentNumber = generateBookingNumber('RES').replace('RES', 'PAY');
    const payment = await tx.payment.create({
      data: {
        paymentNumber,
        context: PaymentContext.RESERVATION_ADVANCE,
        amount: capturedAmount,
        currency: 'INR',
        method: 'ONLINE',
        status: PaymentStatus.SUCCESS,
        provider: payload.provider,
        providerTransactionId: payload.providerTransactionId,
        idempotencyKey: payload.idempotencyKey,
        reservationId: reservation.id,
        notes: 'PAYMENT_ON_CANCELLED_RESERVATION',
      },
    });

    const refundNumber = generateBookingNumber('REF');
    const refund = await tx.refund.create({
      data: {
        refundNumber,
        paymentId: payment.id,
        amount: capturedAmount,
        reason: 'Payment arrived for already cancelled reservation. Reversal pending.',
        reasonCode: 'CANCELLED_RES_REVERSAL',
        status: RefundStatus.PENDING,
        idempotencyKey: generateRefundIdempotencyKey('CANCELLED_RES', payload.provider, payload.providerTransactionId),
      },
    });

    return { status: 'CANCELLED_RES_REFUND', payment, refund, reservation };
  }

  // ── SCENARIO E: GATEWAY FAILED ──
  const paymentNumber = generateBookingNumber('RES').replace('RES', 'PAY');
  const payment = await tx.payment.create({
    data: {
      paymentNumber,
      context: PaymentContext.RESERVATION_ADVANCE,
      amount: capturedAmount,
      currency: 'INR',
      method: 'ONLINE',
      status: PaymentStatus.FAILED,
      provider: payload.provider,
      providerTransactionId: payload.providerTransactionId,
      idempotencyKey: payload.idempotencyKey,
      reservationId: reservation.id,
      notes: payload.errorMessage || 'Payment failed at gateway.',
    },
  });

  // If hold already expired, advance status to EXPIRED; else keep PENDING for retry
  let updatedRes = reservation;
  if (isHoldExpired && reservation.status === ReservationStatus.PENDING) {
    updatedRes = await tx.reservation.update({
      where: { id: reservation.id },
      data: { status: ReservationStatus.EXPIRED },
    });
  }

  return { status: 'FAILED', payment, reservation: updatedRes };
}
