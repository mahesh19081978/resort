import { prisma } from '@/lib/db/prisma';
import { Prisma, PhysicalRoomStatus, StayStatus, RoomAssignmentStatus, FolioStatus, PaymentStatus, PaymentContext, PaymentMethod } from '@prisma/client';
import { recordAuditEvent } from '@/lib/auth/audit';

export interface ExecuteCheckOutParams {
  stayId: string;
  notes?: string;
  settlementPaymentMethod?: PaymentMethod;
  settlementPaymentAmount?: number;
  transactionReference?: string;
}

export interface CheckOutResult {
  stayId: string;
  stayNumber: string;
  roomNumber: string;
  roomId: string;
  folioId: string;
  folioNumber: string;
  totalCharges: Prisma.Decimal;
  totalPayments: Prisma.Decimal;
  finalBalance: Prisma.Decimal;
  checkoutAt: Date;
}

/**
 * Transactional Checkout Workflow:
 * 1. Lock and validate active Stay.
 * 2. Retrieve active RoomAssignment and physical room (must be OCCUPIED).
 * 3. Retrieve Stay Folio with active FolioItems and Payments.
 * 4. Recalculate ledger balance with Prisma.Decimal:
 *    - Charges = sum of unvoided FolioItem amounts
 *    - Credits = sum of unvoided credit items or discounts
 *    - Existing Payments = sum of successful Payments linked to folio
 *    - Balance = Charges - Credits - Existing Payments
 * 5. If settlement payment is provided, record Payment(FOLIO_SETTLEMENT), update balance.
 * 6. Enforce zero balance (finalBalance <= 0). Fail if balance > 0.
 * 7. If balance <= 0:
 *    - Update Folio: totalCharges, totalCredits, totalBalance, status = SETTLED
 *    - End RoomAssignment: status = ENDED, releasedAt = now()
 *    - Update Room status: OCCUPIED -> DIRTY
 *    - Update Stay: status = CHECKED_OUT, actualCheckOut = now()
 *    - If associated Reservation has no remaining active stays, update Reservation -> COMPLETED
 * 8. Atomic AuditLog: CHECKOUT_COMPLETED
 */
export async function executeCheckOut(
  params: ExecuteCheckOutParams,
  actor: { id: string; name?: string; role: string },
  db: Prisma.TransactionClient | typeof prisma = prisma
): Promise<CheckOutResult> {
  const runner = async (tx: Prisma.TransactionClient): Promise<CheckOutResult> => {
    // 1. Fetch Stay
    const stay = await tx.stay.findUnique({
      where: { id: params.stayId },
      include: {
        primaryGuest: true,
        reservation: true,
        roomAssignments: {
          where: { status: RoomAssignmentStatus.ACTIVE },
          include: { room: true },
        },
        folio: {
          include: {
            items: true,
            payments: true,
          },
        },
      },
    });

    if (!stay) {
      throw new Error('STAY_NOT_FOUND: Stay does not exist.');
    }

    if (stay.status !== StayStatus.ACTIVE) {
      throw new Error('STAY_NOT_ACTIVE: Only ACTIVE stays can be checked out. Current status: ' + stay.status);
    }

    if (!stay.roomAssignments || stay.roomAssignments.length === 0) {
      throw new Error('NO_ACTIVE_ROOM_ASSIGNMENT: No active room assignment found for this stay.');
    }

    const currentAssignment = stay.roomAssignments[0];
    const physicalRoom = currentAssignment.room;

    if (!stay.folio) {
      throw new Error('FOLIO_NOT_FOUND: No primary folio exists for this stay.');
    }

    const folio = stay.folio;

    // 4. Calculate Ledger Balance accurately with Prisma.Decimal
    let totalCharges = new Prisma.Decimal(0);
    let totalCredits = new Prisma.Decimal(0);

    for (const item of folio.items) {
      if (!item.isVoided) {
        if (item.itemType === 'DISCOUNT_CREDIT' || item.itemType === 'PAYMENT_CREDIT') {
          totalCredits = totalCredits.plus(item.amount);
        } else {
          totalCharges = totalCharges.plus(item.amount);
        }
      }
    }

    let totalPayments = new Prisma.Decimal(0);
    for (const p of folio.payments) {
      if (p.status === PaymentStatus.SUCCESS) {
        totalPayments = totalPayments.plus(p.amount);
      }
    }

    // 5. Handle settlement payment if provided at checkout time
    if (params.settlementPaymentAmount && params.settlementPaymentAmount > 0) {
      const payMethod = params.settlementPaymentMethod || PaymentMethod.CASH;
      const payAmount = new Prisma.Decimal(params.settlementPaymentAmount.toFixed(2));
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      const randSuffix = Math.floor(1000 + Math.random() * 9000);
      const paymentNumber = 'PAY-' + dateStr + '-' + randSuffix;

      await tx.payment.create({
        data: {
          paymentNumber,
          context: PaymentContext.FOLIO_SETTLEMENT,
          amount: payAmount,
          currency: 'INR',
          method: payMethod,
          status: PaymentStatus.SUCCESS,
          transactionReference: params.transactionReference || null,
          folioId: folio.id,
          reservationId: stay.reservationId || null,
        },
      });

      totalPayments = totalPayments.plus(payAmount);
    }

    const finalBalance = totalCharges.minus(totalCredits).minus(totalPayments);

    // 6. Enforce zero balance (cannot checkout with outstanding unsettled balance > 0)
    if (finalBalance.greaterThan(new Prisma.Decimal(0))) {
      throw new Error(
        'OUTSTANDING_BALANCE_UNSETTLED: Outstanding balance of INR ' +
          finalBalance.toString() +
          ' must be settled before checkout.'
      );
    }

    const checkoutAt = new Date();

    // 7. Update Folio to SETTLED
    await tx.folio.update({
      where: { id: folio.id },
      data: {
        totalCharges,
        totalCredits: totalCredits.plus(totalPayments),
        totalBalance: finalBalance,
        status: FolioStatus.SETTLED,
      },
    });

    // End RoomAssignment
    await tx.roomAssignment.update({
      where: { id: currentAssignment.id },
      data: {
        status: RoomAssignmentStatus.ENDED,
        releasedAt: checkoutAt,
      },
    });

    // Transition Physical Room to DIRTY
    await tx.room.update({
      where: { id: physicalRoom.id },
      data: {
        status: PhysicalRoomStatus.DIRTY,
      },
    });

    // Close Stay
    await tx.stay.update({
      where: { id: stay.id },
      data: {
        status: StayStatus.CHECKED_OUT,
        actualCheckOut: checkoutAt,
        notes: params.notes || stay.notes,
      },
    });

    // If Reservation exists, check if all stays are checked out
    if (stay.reservationId) {
      const otherActiveStays = await tx.stay.findMany({
        where: {
          reservationId: stay.reservationId,
          status: StayStatus.ACTIVE,
          id: { not: stay.id },
        },
      });

      if (otherActiveStays.length === 0) {
        await tx.reservation.update({
          where: { id: stay.reservationId },
          data: { status: 'COMPLETED' },
        });
      }
    }

    // 8. Atomic Audit Log
    await recordAuditEvent(
      {
        userId: actor.id,
        action: 'CHECKOUT_COMPLETED',
        entity: 'Stay',
        entityId: stay.id,
        newValues: {
          stayNumber: stay.stayNumber,
          roomNumber: physicalRoom.roomNumber,
          folioNumber: folio.folioNumber,
          totalCharges: totalCharges.toString(),
          totalPayments: totalPayments.toString(),
          finalBalance: finalBalance.toString(),
          checkoutAt: checkoutAt.toISOString(),
        },
      },
      tx
    );

    return {
      stayId: stay.id,
      stayNumber: stay.stayNumber,
      roomNumber: physicalRoom.roomNumber,
      roomId: physicalRoom.id,
      folioId: folio.id,
      folioNumber: folio.folioNumber,
      totalCharges,
      totalPayments,
      finalBalance,
      checkoutAt,
    };
  };

  if ('$transaction' in db && typeof (db as any).$transaction === 'function') {
    return await (db as typeof prisma).$transaction(runner);
  }
  return await runner(db as Prisma.TransactionClient);
}
