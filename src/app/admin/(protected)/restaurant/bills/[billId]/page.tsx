import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { requirePermission } from '@/lib/auth/auth';
import { RestaurantHeader } from '@/components/restaurant/RestaurantHeader';
import { BillDetailView, BillDetailData } from '@/components/restaurant/BillDetailView';

export const dynamic = 'force-dynamic';

export default async function BillDetailPage({
  params,
}: {
  params: Promise<{ billId: string }>;
}) {
  await requirePermission('restaurant:bill:create');
  const { billId } = await params;

  const bill = await prisma.restaurantBill.findUnique({
    where: { id: billId },
    include: {
      order: {
        include: {
          items: {
            include: { menuItem: true },
          },
          tableSession: {
            include: {
              tables: { include: { table: true } },
            },
          },
          room: true,
          stay: {
            include: {
              primaryGuest: true,
              roomAssignments: {
                where: { status: 'ACTIVE' },
                include: { room: true },
              },
            },
          },
        },
      },
      payments: {
        orderBy: { createdAt: 'desc' },
      },
      folioItem: true,
      childBills: true,
    },
  });

  if (!bill) {
    notFound();
  }

  let tableOrRoom = 'Take-Away';
  if (bill.order.orderType === 'DINE_IN' && bill.order.tableSession) {
    tableOrRoom = `Table ${bill.order.tableSession.tables.map((t) => t.table.tableNumber).join(', ')}`;
  } else if (bill.order.orderType === 'ROOM_SERVICE' && bill.order.room) {
    tableOrRoom = `Room ${bill.order.room.roomNumber}`;
  }

  const activeStayAssignment = bill.order.stay?.roomAssignments[0];

  const formattedBill: BillDetailData = {
    id: bill.id,
    billNumber: bill.billNumber,
    status: bill.status,
    subtotal: bill.subtotal.toNumber(),
    discountAmount: bill.discountAmount.toNumber(),
    taxAmount: bill.taxAmount.toNumber(),
    totalAmount: bill.totalAmount.toNumber(),
    createdAt: bill.createdAt.toISOString(),
    order: {
      id: bill.order.id,
      orderNumber: bill.order.orderNumber,
      orderType: bill.order.orderType,
      tableOrRoom,
      items: bill.order.items.map((i) => ({
        id: i.id,
        name: i.menuItem.name,
        quantity: i.quantity,
        unitPrice: i.unitPrice.toNumber(),
        taxRate: i.taxRate.toNumber(),
        totalPrice: i.unitPrice.toNumber() * i.quantity,
      })),
      stay: bill.order.stay && activeStayAssignment
        ? {
            id: bill.order.stay.id,
            stayNumber: bill.order.stay.stayNumber,
            guestName: `${bill.order.stay.primaryGuest.firstName} ${bill.order.stay.primaryGuest.lastName}`,
            roomId: activeStayAssignment.room.id,
            roomNumber: activeStayAssignment.room.roomNumber,
          }
        : null,
    },
    payments: bill.payments.map((p) => ({
      id: p.id,
      paymentNumber: p.paymentNumber,
      amount: p.amount.toNumber(),
      method: p.method,
      paymentDate: p.paymentDate.toISOString(),
      status: p.status,
      transactionReference: p.transactionReference,
    })),
    folioItem: bill.folioItem
      ? {
          id: bill.folioItem.id,
        }
      : null,
    parentBillId: bill.parentBillId,
    childBills: bill.childBills.map((c) => ({
      id: c.id,
      billNumber: c.billNumber,
      totalAmount: c.totalAmount.toNumber(),
      status: c.status,
    })),
  };

  return (
    <div className="space-y-6">
      <RestaurantHeader
        title={`Restaurant Bill #${bill.billNumber}`}
        subtitle={`Order #${bill.order.orderNumber} • ${tableOrRoom}`}
      />
      <BillDetailView bill={formattedBill} />
    </div>
  );
}
