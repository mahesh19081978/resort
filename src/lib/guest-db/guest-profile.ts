import { prisma } from '@/lib/db/prisma';
import { Prisma, StayStatus, PaymentStatus, RefundStatus, ReservationStatus } from '@prisma/client';

export interface GuestProfileData {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  alternatePhone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  dateOfBirth: string | null;
  nationality: string | null;
  vip: boolean;
  blacklisted: boolean;
  notes: string | null;
  createdAt: string;
  stayCount: number;
  totalSpent: string;
  totalPaid: string;
  outstandingBalance: string;
  averageStayDuration: number;
  totalRoomNights: number;
  lastStayDate: string | null;
  lastStayRoom: string | null;
}

export interface GuestStayHistoryEntry {
  stayId: string;
  stayNumber: string;
  reservationNumber: string | null;
  roomNumber: string;
  roomTypeName: string;
  actualCheckIn: string;
  expectedCheckOut: string;
  actualCheckOut: string | null;
  status: string;
  folioBalance: string;
  totalPaid: string;
  nights: number;
}

export interface GuestUpcomingBooking {
  reservationId: string;
  reservationNumber: string;
  checkInDate: string;
  checkOutDate: string;
  roomTypeName: string;
  status: string;
  totalAmount: string;
  advancePaid: string;
  nights: number;
  source: string;
}

export interface GuestDocumentEntry {
  id: string;
  documentType: string;
  maskedDocumentNumber: string;
  verificationStatus: string;
  uploadedAt: string;
  verifiedAt: string | null;
  verifiedByName: string | null;
}

export interface GuestPhotoEntry {
  id: string;
  hasData: boolean;
  mimeType: string;
  capturedAt: string;
}

export interface GuestFinancialSummary {
  totalBilled: string;
  totalPaid: string;
  outstandingBalance: string;
  averageBillPerStay: string;
  highestBill: string;
  lowestBill: string;
  totalTaxPaid: string;
  totalRefunds: string;
}

export interface GuestProfile {
  guest: GuestProfileData;
  photo: GuestPhotoEntry | null;
  documents: GuestDocumentEntry[];
  stays: GuestStayHistoryEntry[];
  upcomingBookings: GuestUpcomingBooking[];
  financialSummary: GuestFinancialSummary;
}

function maskDocumentNumber(docNumber: string): string {
  if (docNumber.length <= 4) return '****';
  return '*'.repeat(docNumber.length - 4) + docNumber.slice(-4);
}

export async function getGuestProfile(guestId: string): Promise<GuestProfile | null> {
  const guest = await prisma.guest.findUnique({
    where: { id: guestId },
    include: {
      photos: {
        orderBy: { capturedAt: 'desc' },
        take: 1,
      },
      documents: {
        orderBy: { createdAt: 'desc' },
        include: {
          verifiedBy: { select: { name: true } },
        },
      },
      stays: {
        orderBy: { actualCheckIn: 'desc' },
        include: {
          reservation: { select: { reservationNumber: true } },
          roomAssignments: {
            include: {
              room: { include: { roomType: { select: { name: true } } } },
            },
          },
          folio: {
            include: {
              items: { where: { isVoided: false }, select: { amount: true, taxAmount: true } },
              payments: {
                where: { status: PaymentStatus.SUCCESS },
                select: { amount: true },
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
      },
      reservations: {
        where: {
          status: { in: [ReservationStatus.CONFIRMED, ReservationStatus.PENDING] },
          checkInDate: { gte: new Date() },
        },
        orderBy: { checkInDate: 'asc' },
        select: {
          id: true,
          reservationNumber: true,
          checkInDate: true,
          checkOutDate: true,
          status: true,
          totalAmount: true,
          advancePaidAmount: true,
          source: true,
          createdAt: true,
          reservedRooms: { select: { roomType: { select: { name: true } } } },
        },
      },
    },
  });

  if (!guest) return null;

  let totalSpent = new Prisma.Decimal(0);
  let totalPaid = new Prisma.Decimal(0);
  let totalTaxPaid = new Prisma.Decimal(0);
  let totalRefunds = new Prisma.Decimal(0);
  let totalRoomNights = 0;
  const totalBillAmounts: number[] = [];

  for (const stay of guest.stays) {
    let stayBill = new Prisma.Decimal(0);

    if (stay.folio) {
      for (const item of stay.folio.items) {
        totalSpent = totalSpent.plus(item.amount);
        stayBill = stayBill.plus(item.amount);
        totalTaxPaid = totalTaxPaid.plus(item.taxAmount);
      }
      for (const payment of stay.folio.payments) {
        totalPaid = totalPaid.plus(payment.amount);
        for (const refund of payment.refunds) {
          totalRefunds = totalRefunds.plus(refund.amount);
        }
      }
    }

    totalBillAmounts.push(parseFloat(stayBill.toFixed(2)));

    const checkIn = new Date(stay.actualCheckIn);
    const checkOut = stay.actualCheckOut ? new Date(stay.actualCheckOut) : new Date();
    const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
    totalRoomNights += nights;
  }

  const outstandingBalance = totalSpent.minus(totalPaid);
  const stayCount = guest.stays.length;
  const averageStayDuration = stayCount > 0 ? Math.round(totalRoomNights / stayCount) : 0;
  const averageBillPerStay = stayCount > 0 ? totalSpent.div(stayCount).toFixed(2) : '0.00';
  const highestBill = totalBillAmounts.length > 0 ? Math.max(...totalBillAmounts).toFixed(2) : '0.00';
  const lowestBill = totalBillAmounts.length > 0 ? Math.min(...totalBillAmounts).toFixed(2) : '0.00';

  const lastStay = guest.stays[0];
  const lastStayRoom = lastStay?.roomAssignments[0]?.room?.roomNumber ?? null;

  const photo = guest.photos[0] ?? null;

  const profile: GuestProfile = {
    guest: {
      id: guest.id,
      firstName: guest.firstName,
      lastName: guest.lastName,
      email: guest.email,
      phone: guest.phone,
      alternatePhone: guest.alternatePhone,
      address: guest.address,
      city: guest.city,
      state: guest.state,
      postalCode: guest.postalCode,
      country: guest.country,
      dateOfBirth: guest.dateOfBirth?.toISOString() ?? null,
      nationality: guest.nationality,
      vip: guest.vip,
      blacklisted: guest.blacklisted,
      notes: guest.notes,
      createdAt: guest.createdAt.toISOString(),
      stayCount,
      totalSpent: totalSpent.toFixed(2),
      totalPaid: totalPaid.toFixed(2),
      outstandingBalance: outstandingBalance.toFixed(2),
      averageStayDuration,
      totalRoomNights,
      lastStayDate: lastStay?.actualCheckIn.toISOString() ?? null,
      lastStayRoom,
    },
    photo: photo
      ? {
          id: photo.id,
          hasData: !!(photo as any).fileDataBase64,
          mimeType: (photo.mimeType || 'image/jpeg') as string,
          capturedAt: photo.capturedAt.toISOString(),
        }
      : null,
    documents: guest.documents.map((doc) => ({
      id: doc.id,
      documentType: doc.documentType,
      maskedDocumentNumber: maskDocumentNumber(doc.documentNumber),
      verificationStatus: doc.verificationStatus,
      uploadedAt: doc.createdAt.toISOString(),
      verifiedAt: doc.verifiedAt?.toISOString() ?? null,
      verifiedByName: (doc.verifiedBy as any)?.name ?? null,
    })),
    stays: guest.stays.map((stay) => {
      const assignment = stay.roomAssignments[0];
      const room = assignment?.room;
      const folio = stay.folio;

      let stayPaid = new Prisma.Decimal(0);
      if (folio) {
        for (const p of folio.payments) {
          stayPaid = stayPaid.plus(p.amount);
        }
      }

      const checkIn = new Date(stay.actualCheckIn);
      const checkOut = stay.actualCheckOut ? new Date(stay.actualCheckOut) : new Date();
      const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

      return {
        stayId: stay.id,
        stayNumber: stay.stayNumber,
        reservationNumber: stay.reservation?.reservationNumber ?? null,
        roomNumber: room?.roomNumber ?? 'Unassigned',
        roomTypeName: room?.roomType?.name ?? '',
        actualCheckIn: stay.actualCheckIn.toISOString(),
        expectedCheckOut: stay.expectedCheckOut.toISOString(),
        actualCheckOut: stay.actualCheckOut?.toISOString() ?? null,
        status: stay.status,
        folioBalance: (folio?.totalBalance ?? new Prisma.Decimal(0)).toFixed(2),
        totalPaid: stayPaid.toFixed(2),
        nights,
      };
    }),
    upcomingBookings: guest.reservations.map((res) => {
      const checkIn = new Date(res.checkInDate);
      const checkOut = new Date(res.checkOutDate);
      const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

      return {
        reservationId: res.id,
        reservationNumber: res.reservationNumber,
        checkInDate: res.checkInDate.toISOString(),
        checkOutDate: res.checkOutDate.toISOString(),
        roomTypeName: res.reservedRooms[0]?.roomType?.name ?? '',
        status: res.status,
        totalAmount: res.totalAmount.toFixed(2),
        advancePaid: res.advancePaidAmount.toFixed(2),
        nights,
        source: res.source,
      };
    }),
    financialSummary: {
      totalBilled: totalSpent.toFixed(2),
      totalPaid: totalPaid.toFixed(2),
      outstandingBalance: outstandingBalance.toFixed(2),
      averageBillPerStay,
      highestBill,
      lowestBill,
      totalTaxPaid: totalTaxPaid.toFixed(2),
      totalRefunds: totalRefunds.toFixed(2),
    },
  };

  return profile;
}

export async function getGuestFullProfile(guestId: string): Promise<GuestProfile | null> {
  return getGuestProfile(guestId);
}

export async function getGuestPhotoData(
  guestId: string,
  photoId?: string
): Promise<{ fileDataBase64: string; mimeType: string } | null> {
  const where = photoId
    ? { id: photoId, guestId }
    : { guestId };

  const photo = await prisma.guestPhoto.findFirst({
    where,
    orderBy: { capturedAt: 'desc' },
    select: { fileDataBase64: true, mimeType: true },
  });

  if (!photo || !(photo as any).fileDataBase64) return null;

  return {
    fileDataBase64: (photo as any).fileDataBase64 as string,
    mimeType: (photo.mimeType || 'image/jpeg') as string,
  };
}

export async function getGuestDocumentData(
  documentId: string,
  guestId: string
): Promise<{ fileDataBase64: string; mimeType: string; fileName: string } | null> {
  const doc = await prisma.guestDocument.findFirst({
    where: { id: documentId, guestId },
    select: { fileDataBase64: true, mimeType: true, fileName: true },
  });

  if (!doc || !(doc as any).fileDataBase64) return null;

  return {
    fileDataBase64: (doc as any).fileDataBase64 as string,
    mimeType: doc.mimeType,
    fileName: doc.fileName,
  };
}
