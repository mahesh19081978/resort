import { prisma } from '@/lib/db/prisma';
import {
  Prisma,
  FolioItemType,
  PaymentStatus,
  RefundStatus,
} from '@prisma/client';
import { getCurrentYearMonth } from '@/lib/util/business-time';
import { recordAuditEvent } from '@/lib/auth/audit';

export interface BillLineItem {
  date: string;
  description: string;
  quantity: number;
  rate: string;
  tax: string;
  total: string;
  itemType: string;
}

export interface BillSummary {
  guestName: string;
  guestPhone: string | null;
  roomNumber: string;
  roomTypeName: string;
  stayNumber: string;
  reservationNumber: string | null;
  folioNumber: string;
  actualCheckIn: string;
  expectedCheckOut: string;
  actualCheckOut: string | null;
  billDate: string;

  // Invoice & Property Branding Metadata
  invoiceNumber: string | null;
  invoiceIssuedAt: string | null;
  propertyName: string;
  propertyAddress: string;
  propertyCityState: string;
  propertyPhone: string;
  propertyEmail: string;
  propertyWebsite: string | null;
  propertyGstin: string | null;
  propertyLogoUrl: string | null;
  invoiceTerms: string | null;
  invoiceFooter: string | null;

  roomBillItems: BillLineItem[];
  additionalBillItems: BillLineItem[];
  restaurantBillItems: BillLineItem[];
  otherBillItems: BillLineItem[];
  discountItems: BillLineItem[];

  roomSubtotal: string;
  roomTax: string;
  roomTotal: string;

  additionalSubtotal: string;
  additionalTax: string;
  additionalTotal: string;

  restaurantSubtotal: string;
  restaurantTax: string;
  restaurantTotal: string;

  otherSubtotal: string;
  otherTax: string;
  otherTotal: string;

  grossCharges: string;
  totalTax: string;
  totalDiscounts: string;

  advancePaid: string;
  stayPayments: string;
  totalPayments: string;
  totalRefunds: string;
  outstandingBalance: string;

  allItems: BillLineItem[];
  allPayments: Array<{
    date: string;
    method: string;
    amount: string;
    reference: string | null;
  }>;
}

function classifyFolioItem(itemType: string): 'room' | 'additional' | 'restaurant' | 'other' | 'discount' {
  switch (itemType as FolioItemType) {
    case FolioItemType.ROOM_CHARGE:
      return 'room';
    case FolioItemType.RESTAURANT_CHARGE:
    case FolioItemType.ROOM_SERVICE_CHARGE:
      return 'restaurant';
    case FolioItemType.DISCOUNT_CREDIT:
      return 'discount';
    case FolioItemType.LAUNDRY_CHARGE:
    case FolioItemType.EXTRA_SERVICE_CHARGE:
    case FolioItemType.DAMAGE_FEE:
    case FolioItemType.MISC_CHARGE:
      return 'additional';
    case FolioItemType.TAX_CHARGE:
      return 'other';
    default:
      return 'other';
  }
}

export async function getStayBillData(stayId: string): Promise<BillSummary | null> {
  const stay = await prisma.stay.findUnique({
    where: { id: stayId },
    include: {
      primaryGuest: true,
      reservation: { select: { reservationNumber: true } },
      roomAssignments: {
        where: { status: 'ACTIVE' },
        include: {
          room: {
            include: {
              roomType: { select: { name: true } },
            },
          },
        },
      },
      folio: {
        include: {
          items: {
            where: { isVoided: false },
            orderBy: { postedAt: 'asc' },
          },
          payments: {
            orderBy: { createdAt: 'asc' },
            include: {
              refunds: {
                where: { status: RefundStatus.PROCESSED },
                select: { amount: true },
              },
            },
          },
        },
      },
    },
  });

  if (!stay) return null;

  const property = await prisma.property.findFirst();
  const invoiceConfig = await prisma.invoiceConfig.findUnique({
    where: { singletonKey: 'DEFAULT' },
  });

  const room = stay.roomAssignments[0]?.room;
  const folio = stay.folio;

  const roomItems: BillLineItem[] = [];
  const additionalItems: BillLineItem[] = [];
  const restaurantItems: BillLineItem[] = [];
  const otherItems: BillLineItem[] = [];
  const discountItems: BillLineItem[] = [];
  const allItems: BillLineItem[] = [];

  let roomSubtotal = new Prisma.Decimal(0);
  let roomTax = new Prisma.Decimal(0);
  let additionalSubtotal = new Prisma.Decimal(0);
  let additionalTax = new Prisma.Decimal(0);
  let restaurantSubtotal = new Prisma.Decimal(0);
  let restaurantTax = new Prisma.Decimal(0);
  let otherSubtotal = new Prisma.Decimal(0);
  let otherTax = new Prisma.Decimal(0);
  let totalDiscounts = new Prisma.Decimal(0);

  if (folio) {
    for (const item of folio.items) {
      const line: BillLineItem = {
        date: item.postedAt.toISOString(),
        description: item.description,
        quantity: item.quantity,
        rate: item.unitPrice.toFixed(2),
        tax: item.taxAmount.toFixed(2),
        total: item.amount.toFixed(2),
        itemType: item.itemType,
      };

      allItems.push(line);
      const cat = classifyFolioItem(item.itemType);

      // Financial Snapshot Invariant:
      // FolioItem.amount is always the authoritative gross amount.
      // Net base is derived strictly from stored snapshots: net = amount - taxAmount.
      // Never re-tax gross amounts or recalculate tax rates from live Tax config.
      const netBase = item.amount.minus(item.taxAmount);

      switch (cat) {
        case 'room':
          roomItems.push(line);
          roomSubtotal = roomSubtotal.plus(netBase);
          roomTax = roomTax.plus(item.taxAmount);
          break;
        case 'additional':
          additionalItems.push(line);
          additionalSubtotal = additionalSubtotal.plus(netBase);
          additionalTax = additionalTax.plus(item.taxAmount);
          break;
        case 'restaurant':
          restaurantItems.push(line);
          restaurantSubtotal = restaurantSubtotal.plus(netBase);
          restaurantTax = restaurantTax.plus(item.taxAmount);
          break;
        case 'discount':
          discountItems.push(line);
          totalDiscounts = totalDiscounts.plus(item.amount);
          break;
        default:
          otherItems.push(line);
          otherSubtotal = otherSubtotal.plus(netBase);
          otherTax = otherTax.plus(item.taxAmount);
          break;
      }
    }
  }

  const roomTotal = roomSubtotal.plus(roomTax);
  const additionalTotal = additionalSubtotal.plus(additionalTax);
  const restaurantTotal = restaurantSubtotal.plus(restaurantTax);
  const otherTotal = otherSubtotal.plus(otherTax);

  const grossCharges = roomTotal.plus(additionalTotal).plus(restaurantTotal).plus(otherTotal).minus(totalDiscounts);
  const totalTax = roomTax.plus(additionalTax).plus(restaurantTax).plus(otherTax);

  let totalPayments = new Prisma.Decimal(0);
  const allPayments: BillSummary['allPayments'] = [];
  let advancePaid = new Prisma.Decimal(0);
  let stayPayments = new Prisma.Decimal(0);
  let totalRefunds = new Prisma.Decimal(0);

  if (folio) {
    for (const p of folio.payments) {
      if (p.status === PaymentStatus.SUCCESS) {
        totalPayments = totalPayments.plus(p.amount);
        if (p.context === 'RESERVATION_ADVANCE') {
          advancePaid = advancePaid.plus(p.amount);
        } else {
          stayPayments = stayPayments.plus(p.amount);
        }
        allPayments.push({
          date: p.paymentDate.toISOString(),
          method: p.method,
          amount: p.amount.toFixed(2),
          reference: p.transactionReference,
        });
      }
      for (const r of p.refunds) {
        totalRefunds = totalRefunds.plus(r.amount);
      }
    }
  }
  const outstandingBalance = grossCharges.minus(totalPayments).plus(totalRefunds);

  return {
    guestName: `${stay.primaryGuest.firstName} ${stay.primaryGuest.lastName}`,
    guestPhone: stay.primaryGuest.phone,
    roomNumber: room?.roomNumber ?? 'Unassigned',
    roomTypeName: room?.roomType?.name ?? '',
    stayNumber: stay.stayNumber,
    reservationNumber: stay.reservation?.reservationNumber ?? null,
    folioNumber: folio?.folioNumber ?? 'N/A',
    actualCheckIn: stay.actualCheckIn.toISOString(),
    expectedCheckOut: stay.expectedCheckOut.toISOString(),
    actualCheckOut: stay.actualCheckOut?.toISOString() ?? null,
    billDate: new Date().toISOString(),

    invoiceNumber: folio?.invoiceNumber ?? null,
    invoiceIssuedAt: folio?.invoiceIssuedAt?.toISOString() ?? null,
    propertyName: property?.name ?? 'Infinity Resort & Restaurant',
    propertyAddress: property?.address ?? '',
    propertyCityState: property ? `${property.city}, ${property.state} - ${property.postalCode}` : '',
    propertyPhone: property?.contactPhone ?? '',
    propertyEmail: property?.contactEmail ?? '',
    propertyWebsite: property?.website ?? null,
    propertyGstin: property?.gstin ?? null,
    propertyLogoUrl: property?.logoUrl ?? null,
    invoiceTerms: invoiceConfig?.termsAndConditions ?? null,
    invoiceFooter: invoiceConfig?.footerNote ?? null,

    roomBillItems: roomItems,
    additionalBillItems: additionalItems,
    restaurantBillItems: restaurantItems,
    otherBillItems: otherItems,
    discountItems,

    roomSubtotal: roomSubtotal.toFixed(2),
    roomTax: roomTax.toFixed(2),
    roomTotal: roomTotal.toFixed(2),

    additionalSubtotal: additionalSubtotal.toFixed(2),
    additionalTax: additionalTax.toFixed(2),
    additionalTotal: additionalTotal.toFixed(2),

    restaurantSubtotal: restaurantSubtotal.toFixed(2),
    restaurantTax: restaurantTax.toFixed(2),
    restaurantTotal: restaurantTotal.toFixed(2),

    otherSubtotal: otherSubtotal.toFixed(2),
    otherTax: otherTax.toFixed(2),
    otherTotal: otherTotal.toFixed(2),

    grossCharges: grossCharges.toFixed(2),
    totalTax: totalTax.toFixed(2),
    totalDiscounts: totalDiscounts.toFixed(2),

    advancePaid: advancePaid.toFixed(2),
    stayPayments: stayPayments.toFixed(2),
    totalPayments: totalPayments.toFixed(2),
    totalRefunds: totalRefunds.toFixed(2),
    outstandingBalance: outstandingBalance.toFixed(2),

    allItems,
    allPayments,
  };
}

/**
 * Concurrency-safe, idempotent invoice issuance with bounded retry.
 * 
 * Rules:
 * - If invoice already issued for this folio, returns existing invoice number immediately.
 * - Locks singleton row using singletonKey='DEFAULT'. No findFirst / LIMIT 1.
 * - Calculates YYYYMM using Property.timezone.
 * - Bounded retry for transient serialization conflicts.
 * - Sequence gaps after rollback are acceptable.
 */
export async function issueInvoice(
  stayId: string,
  actor: { id: string }
): Promise<{ invoiceNumber: string; isNew: boolean }> {
  // Pre-lock cheap idempotency check:
  const initialStay = await prisma.stay.findUnique({
    where: { id: stayId },
    include: { folio: true },
  });

  if (!initialStay) {
    throw new Error('STAY_NOT_FOUND: Stay does not exist.');
  }
  if (!initialStay.folio) {
    throw new Error('FOLIO_NOT_FOUND: No folio exists for this stay.');
  }

  if (initialStay.folio.invoiceNumber) {
    return { invoiceNumber: initialStay.folio.invoiceNumber, isNew: false };
  }

  const property = await prisma.property.findFirst();
  const timezone = property?.timezone || 'Asia/Kolkata';

  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      return await prisma.$transaction(
        async (tx) => {
          // 1. Post-lock reread folio
          const lockedFolio = await tx.folio.findUniqueOrThrow({
            where: { id: initialStay.folio!.id },
          });

          if (lockedFolio.invoiceNumber) {
            return { invoiceNumber: lockedFolio.invoiceNumber, isNew: false };
          }

          // 2. Lock InvoiceConfig singleton row strictly by singletonKey
          await tx.$queryRaw`SELECT id FROM "InvoiceConfig" WHERE "singletonKey" = 'DEFAULT' FOR UPDATE`;
          const config = await tx.invoiceConfig.findUnique({
            where: { singletonKey: 'DEFAULT' },
          });

          if (!config) {
            throw new Error('INVOICE_CONFIG_NOT_SEEDED: Invoice configuration singleton not found.');
          }

          // 3. Property timezone-derived yearMonth
          const currentYM = getCurrentYearMonth(timezone);

          // 4. Resolve sequence (reset monthly)
          let seq = config.nextSequence;
          if (config.yearMonth !== currentYM) {
            seq = 1;
          }

          const invoiceNumber = `${config.prefix}-${currentYM}-${String(seq).padStart(4, '0')}`;

          // 5. Update InvoiceConfig sequence
          await tx.invoiceConfig.update({
            where: { singletonKey: 'DEFAULT' },
            data: {
              nextSequence: seq + 1,
              yearMonth: currentYM,
            },
          });

          // 6. Assign invoiceNumber to Folio (@unique is race guard)
          await tx.folio.update({
            where: { id: lockedFolio.id },
            data: {
              invoiceNumber,
              invoiceIssuedAt: new Date(),
            },
          });

          // 7. Audit log
          await recordAuditEvent(
            {
              userId: actor.id,
              action: 'INVOICE_ISSUED',
              entity: 'Folio',
              entityId: lockedFolio.id,
              newValues: {
                invoiceNumber,
                stayId,
                folioNumber: lockedFolio.folioNumber,
              },
            },
            tx
          );

          return { invoiceNumber, isNew: true };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 15000,
          maxWait: 5000,
        }
      );
    } catch (err: any) {
      const isRetryable =
        err?.code === 'P2034' || // Transaction failed due to write conflict or deadlock
        err?.message?.includes('could not serialize access') ||
        err?.message?.includes('deadlock detected');

      if (isRetryable && attempts < maxAttempts) {
        await new Promise((res) => setTimeout(res, 50 * attempts));
        continue;
      }

      // Check if another concurrent transaction just committed the invoiceNumber
      const recheck = await prisma.folio.findUnique({
        where: { id: initialStay.folio.id },
      });
      if (recheck?.invoiceNumber) {
        return { invoiceNumber: recheck.invoiceNumber, isNew: false };
      }

      throw err;
    }
  }

  throw new Error('INVOICE_ISSUANCE_FAILED: Max transaction retry attempts exceeded.');
}
