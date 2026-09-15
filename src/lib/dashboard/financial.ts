import { prisma } from '@/lib/db/prisma';
import {
  Prisma,
  PaymentContext,
  PaymentStatus,
  FolioItemType,
  FolioStatus,
} from '@prisma/client';
import { getBusinessDateNow, getBusinessDayTimestampRange } from './date';

export interface FinancialMetrics {
  todayGuestPayments: Prisma.Decimal;
  todayReservationAdvances: Prisma.Decimal;
  todayFolioSettlements: Prisma.Decimal;
  todayRestaurantBillPayments: Prisma.Decimal;
  todayRoomRevenuePosted: Prisma.Decimal;
  outstandingGuestLedgerBalance: Prisma.Decimal;
}

/**
 * Calculates authoritative outstanding guest ledger balances across active/open folios.
 * Matches checkout.ts ledger architecture:
 * Net Balance = Sum(Charges) - Sum(Credits) - Sum(Successful Payments)
 */
export async function getOutstandingGuestLedgerBalance(
  propertyId?: string
): Promise<Prisma.Decimal> {
  const activeFoliosWhere: Prisma.FolioWhereInput = {
    status: { in: [FolioStatus.OPEN, FolioStatus.LOCKED] },
    ...(propertyId
      ? {
          stay: {
            roomAssignments: {
              some: {
                status: 'ACTIVE',
                room: { propertyId },
              },
            },
          },
        }
      : {}),
  };

  // 1. Sum unvoided debit charges
  const chargesAgg = await prisma.folioItem.aggregate({
    _sum: { amount: true },
    where: {
      isVoided: false,
      itemType: {
        notIn: [FolioItemType.DISCOUNT_CREDIT, FolioItemType.PAYMENT_CREDIT],
      },
      folio: activeFoliosWhere,
    },
  });

  // 2. Sum unvoided credit items
  const creditsAgg = await prisma.folioItem.aggregate({
    _sum: { amount: true },
    where: {
      isVoided: false,
      itemType: {
        in: [FolioItemType.DISCOUNT_CREDIT, FolioItemType.PAYMENT_CREDIT],
      },
      folio: activeFoliosWhere,
    },
  });

  // 3. Sum successful payments linked to active folios
  const paymentsAgg = await prisma.payment.aggregate({
    _sum: { amount: true },
    where: {
      status: PaymentStatus.SUCCESS,
      folio: activeFoliosWhere,
    },
  });

  const charges = chargesAgg._sum.amount || new Prisma.Decimal(0);
  const credits = creditsAgg._sum.amount || new Prisma.Decimal(0);
  const payments = paymentsAgg._sum.amount || new Prisma.Decimal(0);

  const balance = charges.minus(credits).minus(payments);
  return balance.isNegative() ? new Prisma.Decimal(0) : balance;
}

/**
 * Authoritative Financial Metrics.
 *
 * Rules:
 * 1. Guest payments strictly include RESERVATION_ADVANCE, FOLIO_SETTLEMENT, RESTAURANT_BILL, DIRECT_SERVICE.
 * 2. VENDOR_PAYMENT is strictly excluded.
 * 3. Grouped query over payment context eliminates multiple independent DB queries.
 * 4. Room revenue is derived from unvoided ROOM_CHARGE FolioItem posted within today's business day.
 * 5. Outstanding ledger balance matches checkout.ts ledger invariants.
 */
export async function getFinancialMetrics(
  businessDate: string = getBusinessDateNow(),
  propertyId?: string
): Promise<FinancialMetrics> {
  const { start, end } = getBusinessDayTimestampRange(businessDate);

  const [paymentGroups, roomRevenueAgg, outstandingLedgerBalance] = await Promise.all([
    // ONE grouped query for all payment contexts
    prisma.payment.groupBy({
      by: ['context'],
      where: {
        status: PaymentStatus.SUCCESS,
        paymentDate: { gte: start, lt: end },
        context: {
          in: [
            PaymentContext.RESERVATION_ADVANCE,
            PaymentContext.FOLIO_SETTLEMENT,
            PaymentContext.RESTAURANT_BILL,
            PaymentContext.DIRECT_SERVICE,
          ],
        },
      },
      _sum: { amount: true },
    }),

    // Authoritative room revenue posted today
    prisma.folioItem.aggregate({
      _sum: { amount: true },
      where: {
        itemType: FolioItemType.ROOM_CHARGE,
        isVoided: false,
        postedAt: { gte: start, lt: end },
        ...(propertyId
          ? {
              folio: {
                stay: {
                  roomAssignments: {
                    some: { room: { propertyId } },
                  },
                },
              },
            }
          : {}),
      },
    }),

    // Ledger-derived outstanding guest balance
    getOutstandingGuestLedgerBalance(propertyId),
  ]);

  let todayGuestPayments = new Prisma.Decimal(0);
  let todayReservationAdvances = new Prisma.Decimal(0);
  let todayFolioSettlements = new Prisma.Decimal(0);
  let todayRestaurantBillPayments = new Prisma.Decimal(0);

  for (const group of paymentGroups) {
    const amount = group._sum.amount || new Prisma.Decimal(0);
    todayGuestPayments = todayGuestPayments.plus(amount);

    if (group.context === PaymentContext.RESERVATION_ADVANCE) {
      todayReservationAdvances = amount;
    } else if (group.context === PaymentContext.FOLIO_SETTLEMENT) {
      todayFolioSettlements = amount;
    } else if (group.context === PaymentContext.RESTAURANT_BILL) {
      todayRestaurantBillPayments = amount;
    }
  }

  const todayRoomRevenuePosted =
    roomRevenueAgg._sum.amount || new Prisma.Decimal(0);

  return {
    todayGuestPayments,
    todayReservationAdvances,
    todayFolioSettlements,
    todayRestaurantBillPayments,
    todayRoomRevenuePosted,
    outstandingGuestLedgerBalance: outstandingLedgerBalance,
  };
}
