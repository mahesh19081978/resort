import { prisma } from '@/lib/db/prisma';
import {
  Prisma,
  StayStatus,
  RoomAssignmentStatus,
  PaymentStatus,
  FolioItemType,
  OrderStatus,
} from '@prisma/client';

export interface StayDetailData {
  stayId: string;
  stayNumber: string;
  status: string;
  actualCheckIn: string;
  expectedCheckOut: string;
  actualCheckOut: string | null;
  notes: string | null;
  createdAt: string;

  primaryGuest: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string | null;
  };

  reservation: {
    id: string;
    reservationNumber: string;
    source: string;
  } | null;

  roomAssignments: Array<{
    id: string;
    roomNumber: string;
    roomTypeName: string;
    assignedAt: string;
    releasedAt: string | null;
    status: string;
  }>;

  accompanyingGuests: Array<{
    id: string;
    guestId: string;
    firstName: string;
    lastName: string;
    phone: string;
    isPrimary: boolean;
  }>;

  financialSummary: {
    accommodationCharges: string;
    additionalCharges: string;
    restaurantCharges: string;
    serviceCharges: string;
    taxCharges: string;
    discountCredits: string;
    grossCharges: string;
    totalPaid: string;
    totalRefunds: string;
    outstandingBalance: string;
    lineItems: Array<{
      date: string;
      description: string;
      quantity: number;
      unitPrice: string;
      taxAmount: string;
      amount: string;
      itemType: string;
      category: string;
    }>;
    payments: Array<{
      date: string;
      method: string;
      amount: string;
      reference: string | null;
      context: string;
    }>;
  };

  restaurantOrders: Array<{
    orderId: string;
    orderNumber: string;
    date: string;
    orderType: string;
    status: string;
    totalAmount: string;
    isPaid: boolean;
    isChargedToRoom: boolean;
    tableNumber: string | null;
    roomNumber: string | null;
    items: Array<{
      name: string;
      quantity: number;
      unitPrice: string;
      amount: string;
    }>;
  }>;

  serviceRequests: Array<{
    id: string;
    requestNo: string;
    serviceName: string;
    date: string;
    quantity: number;
    status: string;
    chargedToRoom: boolean;
    amount: string;
  }>;

  timeline: Array<{
    date: string;
    type: string;
    description: string;
    amount: string | null;
    icon: string;
  }>;
}

function classifyFolioItem(itemType: string): string {
  switch (itemType as FolioItemType) {
    case FolioItemType.ROOM_CHARGE:
      return 'accommodation';
    case FolioItemType.RESTAURANT_CHARGE:
    case FolioItemType.ROOM_SERVICE_CHARGE:
      return 'restaurant';
    case FolioItemType.LAUNDRY_CHARGE:
    case FolioItemType.EXTRA_SERVICE_CHARGE:
    case FolioItemType.DAMAGE_FEE:
    case FolioItemType.MISC_CHARGE:
      return 'additional';
    case FolioItemType.TAX_CHARGE:
      return 'tax';
    case FolioItemType.DISCOUNT_CREDIT:
      return 'discount';
    default:
      return 'other';
  }
}

export async function getStayDetail(stayId: string): Promise<StayDetailData | null> {
  const stay = await prisma.stay.findUnique({
    where: { id: stayId },
    include: {
      primaryGuest: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
        },
      },
      reservation: {
        select: {
          id: true,
          reservationNumber: true,
          source: true,
        },
      },
      roomAssignments: {
        orderBy: { assignedAt: 'asc' },
        include: {
          room: {
            include: { roomType: { select: { name: true } } },
          },
        },
      },
      stayGuests: {
        include: {
          guest: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
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
              refunds: true,
            },
          },
        },
      },
      restaurantOrders: {
        include: {
          items: {
            include: {
              menuItem: { select: { name: true } },
            },
          },
          bills: {
            include: {
              payments: {
                where: { status: PaymentStatus.SUCCESS },
              },
              allocations: true,
            },
          },
          tableSession: {
            include: {
              tables: {
                include: {
                  table: { select: { tableNumber: true } },
                },
              },
            },
          },
          room: { select: { roomNumber: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      serviceRequests: {
        include: {
          service: { select: { name: true, basePrice: true } },
        },
        orderBy: { requestedAt: 'asc' },
      },
    },
  });

  if (!stay) return null;

  // Financial summary
  const folio = stay.folio;
  let accommodationCharges = new Prisma.Decimal(0);
  let additionalCharges = new Prisma.Decimal(0);
  let restaurantCharges = new Prisma.Decimal(0);
  let serviceCharges = new Prisma.Decimal(0);
  let taxCharges = new Prisma.Decimal(0);
  let discountCredits = new Prisma.Decimal(0);

  const lineItems: StayDetailData['financialSummary']['lineItems'] = [];

  if (folio) {
    for (const item of folio.items) {
      const category = classifyFolioItem(item.itemType);
      lineItems.push({
        date: item.postedAt.toISOString(),
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toFixed(2),
        taxAmount: item.taxAmount.toFixed(2),
        amount: item.amount.toFixed(2),
        itemType: item.itemType,
        category,
      });

      switch (category) {
        case 'accommodation':
          accommodationCharges = accommodationCharges.plus(item.amount);
          break;
        case 'additional':
          additionalCharges = additionalCharges.plus(item.amount);
          break;
        case 'restaurant':
          restaurantCharges = restaurantCharges.plus(item.amount);
          break;
        case 'tax':
          taxCharges = taxCharges.plus(item.amount);
          break;
        case 'discount':
          discountCredits = discountCredits.plus(item.amount);
          break;
        default:
          additionalCharges = additionalCharges.plus(item.amount);
      }
    }
  }

  const grossCharges = accommodationCharges
    .plus(additionalCharges)
    .plus(restaurantCharges)
    .plus(serviceCharges)
    .plus(taxCharges)
    .minus(discountCredits);

  // Payments
  let totalPaid = new Prisma.Decimal(0);
  const payments: StayDetailData['financialSummary']['payments'] = [];

  if (folio) {
    for (const p of folio.payments) {
      if (p.status === PaymentStatus.SUCCESS) {
        totalPaid = totalPaid.plus(p.amount);
        payments.push({
          date: p.paymentDate.toISOString(),
          method: p.method,
          amount: p.amount.toFixed(2),
          reference: p.transactionReference,
          context: p.context,
        });
      }
    }
  }

  // Refunds
  let totalRefunds = new Prisma.Decimal(0);
  if (folio) {
    for (const p of folio.payments) {
      for (const r of p.refunds) {
        if (r.status === 'PROCESSED') {
          totalRefunds = totalRefunds.plus(r.amount);
        }
      }
    }
  }

  const outstandingBalance = grossCharges.minus(totalPaid).plus(totalRefunds);

  // Restaurant orders
  const restaurantOrders: StayDetailData['restaurantOrders'] = stay.restaurantOrders.map((order) => {
    const isPaid = order.bills.some((b) =>
      b.payments.some((p) => p.status === PaymentStatus.SUCCESS)
    );
    const isChargedToRoom = order.bills.some((b) => b.status === 'CHARGED_TO_ROOM');

    let totalAmount = new Prisma.Decimal(0);
    for (const item of order.items) {
      totalAmount = totalAmount.plus(item.unitPrice.mul(item.quantity));
    }

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      date: order.createdAt.toISOString(),
      orderType: order.orderType,
      status: order.status,
      totalAmount: totalAmount.toFixed(2),
      isPaid,
      isChargedToRoom,
      tableNumber: order.tableSession?.tables?.[0]?.table?.tableNumber ?? null,
      roomNumber: order.room?.roomNumber ?? null,
      items: order.items.map((item) => ({
        name: item.menuItem.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toFixed(2),
        amount: item.unitPrice.mul(item.quantity).toFixed(2),
      })),
    };
  });

  // Service requests
  const serviceRequests: StayDetailData['serviceRequests'] = stay.serviceRequests.map((sr) => {
    const folioItem = folio?.items.find((fi) => fi.serviceRequestId === sr.id);
    return {
      id: sr.id,
      requestNo: sr.requestNo,
      serviceName: sr.service.name,
      date: sr.requestedAt.toISOString(),
      quantity: sr.quantity,
      status: sr.status,
      chargedToRoom: !!folioItem,
      amount: folioItem ? folioItem.amount.toFixed(2) : sr.service.basePrice.mul(sr.quantity).toFixed(2),
    };
  });

  // Room assignment history
  const roomAssignments: StayDetailData['roomAssignments'] = stay.roomAssignments.map((ra) => ({
    id: ra.id,
    roomNumber: ra.room.roomNumber,
    roomTypeName: ra.room.roomType.name,
    assignedAt: ra.assignedAt.toISOString(),
    releasedAt: ra.releasedAt?.toISOString() ?? null,
    status: ra.status,
  }));

  // Accompanying guests
  const accompanyingGuests: StayDetailData['accompanyingGuests'] = stay.stayGuests.map((sg) => ({
    id: sg.id,
    guestId: sg.guest.id,
    firstName: sg.guest.firstName,
    lastName: sg.guest.lastName,
    phone: sg.guest.phone,
    isPrimary: sg.isPrimary,
  }));

  // Timeline
  const timeline: StayDetailData['timeline'] = [];

  timeline.push({
    date: stay.actualCheckIn.toISOString(),
    type: 'CHECK_IN',
    description: `Checked in to Room ${roomAssignments[0]?.roomNumber ?? 'Unassigned'}`,
    amount: null,
    icon: 'door-open',
  });

  for (const item of lineItems) {
    const cat = classifyFolioItem(item.itemType);
    let type = 'CHARGE';
    let icon = 'receipt';
    if (cat === 'restaurant') { type = 'RESTAURANT'; icon = 'utensils'; }
    else if (cat === 'additional') { type = 'SERVICE'; icon = 'wrench'; }
    else if (cat === 'accommodation') { type = 'ROOM_CHARGE'; icon = 'bed'; }

    timeline.push({
      date: item.date,
      type,
      description: item.description,
      amount: item.amount,
      icon,
    });
  }

  for (const order of restaurantOrders) {
    timeline.push({
      date: order.date,
      type: 'RESTAURANT_ORDER',
      description: `Restaurant Order ${order.orderNumber} (${order.orderType})`,
      amount: order.totalAmount,
      icon: 'utensils',
    });
  }

  for (const sr of serviceRequests) {
    timeline.push({
      date: sr.date,
      type: 'SERVICE_REQUEST',
      description: `${sr.serviceName} (${sr.requestNo})`,
      amount: sr.amount,
      icon: 'wrench',
    });
  }

  for (const p of payments) {
    timeline.push({
      date: p.date,
      type: 'PAYMENT',
      description: `Payment via ${p.method}`,
      amount: p.amount,
      icon: 'credit-card',
    });
  }

  if (stay.actualCheckOut) {
    timeline.push({
      date: stay.actualCheckOut.toISOString(),
      type: 'CHECK_OUT',
      description: 'Checked out',
      amount: null,
      icon: 'door-closed',
    });
  }

  timeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return {
    stayId: stay.id,
    stayNumber: stay.stayNumber,
    status: stay.status,
    actualCheckIn: stay.actualCheckIn.toISOString(),
    expectedCheckOut: stay.expectedCheckOut.toISOString(),
    actualCheckOut: stay.actualCheckOut?.toISOString() ?? null,
    notes: stay.notes,
    createdAt: stay.createdAt.toISOString(),
    primaryGuest: stay.primaryGuest,
    reservation: stay.reservation,
    roomAssignments,
    accompanyingGuests,
    financialSummary: {
      accommodationCharges: accommodationCharges.toFixed(2),
      additionalCharges: additionalCharges.toFixed(2),
      restaurantCharges: restaurantCharges.toFixed(2),
      serviceCharges: serviceCharges.toFixed(2),
      taxCharges: taxCharges.toFixed(2),
      discountCredits: discountCredits.toFixed(2),
      grossCharges: grossCharges.toFixed(2),
      totalPaid: totalPaid.toFixed(2),
      totalRefunds: totalRefunds.toFixed(2),
      outstandingBalance: outstandingBalance.toFixed(2),
      lineItems,
      payments,
    },
    restaurantOrders,
    serviceRequests,
    timeline,
  };
}
