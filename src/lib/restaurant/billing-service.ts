import { prisma } from '@/lib/db/prisma';
import {
  Prisma,
  BillStatus,
  PaymentContext,
  PaymentMethod,
  PaymentStatus,
  SplitType,
  FolioItemType,
  StayStatus,
} from '@prisma/client';
import { generateRestaurantNumber } from './numbers';
import { recordAuditEvent } from '@/lib/auth/audit';

export interface GenerateBillParams {
  orderId: string;
  discountAmount?: number;
  discountReason?: string | null;
  userId?: string | null;
}

export interface RecordBillPaymentParams {
  billId: string;
  amount: number;
  method: PaymentMethod;
  transactionReference?: string | null;
  notes?: string | null;
  idempotencyKey?: string | null;
  userId?: string | null;
}

export interface RoomChargeBillParams {
  billId: string;
  stayId: string;
  roomId: string;
  notes?: string | null;
  userId?: string | null;
}

export interface SplitItemAllocationInput {
  orderItemId: string;
  quantity: number;
  childBillIndex: number;
}

export interface SplitBillParams {
  parentBillId: string;
  splitType: SplitType;
  equalParts?: number;
  customAmounts?: number[];
  itemAllocations?: SplitItemAllocationInput[];
  userId?: string | null;
}

/**
 * Calculates financial totals deterministically using Prisma Decimal.
 * Never trust client financial computations.
 */
export function calculateOrderFinancials(
  items: { quantity: number; unitPrice: Prisma.Decimal; taxRate: Prisma.Decimal }[],
  discountInput: number = 0
) {
  let subtotal = new Prisma.Decimal(0);
  let totalTax = new Prisma.Decimal(0);

  for (const item of items) {
    const lineSubtotal = item.unitPrice.times(item.quantity);
    const lineTax = lineSubtotal.times(item.taxRate).dividedBy(100);
    subtotal = subtotal.plus(lineSubtotal);
    totalTax = totalTax.plus(lineTax);
  }

  // Round intermediate tax to 2 decimal places
  const taxAmount = new Prisma.Decimal(totalTax.toFixed(2));
  const discountAmount = new Prisma.Decimal(Math.max(0, discountInput).toFixed(2));

  // Grand Total = Subtotal + Tax - Discount
  let totalAmount = subtotal.plus(taxAmount).minus(discountAmount);
  if (totalAmount.isNegative()) {
    totalAmount = new Prisma.Decimal(0);
  }

  return {
    subtotal: new Prisma.Decimal(subtotal.toFixed(2)),
    taxAmount,
    discountAmount,
    totalAmount: new Prisma.Decimal(totalAmount.toFixed(2)),
  };
}

/**
 * Creates an authoritative RestaurantBill from order line items.
 */
export async function generateRestaurantBill(
  params: GenerateBillParams,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const { orderId, discountAmount = 0, discountReason, userId } = params;

  return await (client === prisma
    ? prisma.$transaction(async (tx) => runGenerate(tx), { timeout: 30000 })
    : runGenerate(client as Prisma.TransactionClient));

  async function runGenerate(tx: Prisma.TransactionClient) {
    const order = await tx.restaurantOrder.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: { menuItem: true },
        },
        bills: {
          where: {
            status: { notIn: [BillStatus.CANCELLED, BillStatus.SPLIT_CHILDREN] },
          },
        },
      },
    });

    if (!order) {
      throw new Error('Restaurant order not found.');
    }

    if (order.status === 'CANCELLED') {
      throw new Error('Cannot generate a bill for a cancelled order.');
    }

    if (order.bills.length > 0) {
      throw new Error(
        `Active bill already exists for this order (${order.bills[0].billNumber}).`
      );
    }

    // Authoritative server-side calculation
    const calc = calculateOrderFinancials(order.items, discountAmount);

    const billNumber = generateRestaurantNumber('BILL');
    const bill = await tx.restaurantBill.create({
      data: {
        billNumber,
        orderId: order.id,
        status: BillStatus.ISSUED,
        subtotal: calc.subtotal,
        discountAmount: calc.discountAmount,
        taxAmount: calc.taxAmount,
        totalAmount: calc.totalAmount,
        items: {
          create: order.items.map((oi) => {
            const lineAmount = oi.unitPrice.times(oi.quantity);
            return {
              description: oi.menuItem.name,
              quantity: oi.quantity,
              unitPrice: oi.unitPrice,
              taxRate: oi.taxRate,
              amount: new Prisma.Decimal(lineAmount.toFixed(2)),
            };
          }),
        },
      },
      include: {
        order: {
          include: { items: { include: { menuItem: true } } },
        },
        items: true,
        payments: true,
      },
    });

    // Update order status to BILLED
    await tx.restaurantOrder.update({
      where: { id: order.id },
      data: { status: 'BILLED' },
    });

    await recordAuditEvent(
      {
        userId,
        action: 'RESTAURANT_BILL_GENERATE',
        entity: 'RestaurantBill',
        entityId: bill.id,
        newValues: {
          billNumber: bill.billNumber,
          orderId,
          totalAmount: calc.totalAmount.toNumber(),
          discountAmount: calc.discountAmount.toNumber(),
          discountReason: discountReason || null,
        },
      },
      tx
    );

    return { success: true, bill };
  }
}

/**
 * Records a direct payment against a RestaurantBill with idempotency and multi-tender settlement.
 * Only SUCCESS payments minus PROCESSED refunds count toward settlement.
 */
export async function recordBillPayment(
  params: RecordBillPaymentParams,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const { billId, amount, method, transactionReference, notes, idempotencyKey, userId } = params;

  if (amount <= 0) {
    throw new Error('Payment amount must be greater than zero.');
  }

  return await (client === prisma
    ? prisma.$transaction(async (tx) => runPayment(tx), { timeout: 30000 })
    : runPayment(client as Prisma.TransactionClient));

  async function runPayment(tx: Prisma.TransactionClient) {
    // 1. Check idempotency key first if provided
    if (idempotencyKey) {
      const existingPayment = await tx.payment.findUnique({
        where: { idempotencyKey },
        include: { restaurantBill: true },
      });
      if (existingPayment) {
        return {
          success: true,
          payment: existingPayment,
          bill: existingPayment.restaurantBill,
          outstanding: 0,
          isFullySettled: existingPayment.restaurantBill?.status === BillStatus.SETTLED,
        };
      }
    }

    const bill = await tx.restaurantBill.findUnique({
      where: { id: billId },
      include: {
        payments: {
          include: { refunds: true },
        },
        order: {
          include: {
            tableSession: true,
          },
        },
      },
    });

    if (!bill) {
      throw new Error('Restaurant bill not found.');
    }

    if (bill.status === BillStatus.SETTLED) {
      throw new Error('Bill is already settled.');
    }

    if (bill.status === BillStatus.CHARGED_TO_ROOM) {
      throw new Error('Bill was already posted to guest room folio.');
    }

    if (bill.status === BillStatus.CANCELLED || bill.status === BillStatus.SPLIT_CHILDREN) {
      throw new Error(`Cannot pay a bill with status ${bill.status}.`);
    }

    // Guardrail 4: Compute effective paid amount = SUCCESS payments minus PROCESSED refunds
    const effectivePaid = bill.payments.reduce((sum, p) => {
      if (p.status !== PaymentStatus.SUCCESS) return sum;
      const totalRefunded = p.refunds
        .filter((r) => r.status === 'PROCESSED')
        .reduce((rSum, r) => rSum.plus(r.amount), new Prisma.Decimal(0));
      return sum.plus(p.amount).minus(totalRefunded);
    }, new Prisma.Decimal(0));

    const outstanding = bill.totalAmount.minus(effectivePaid);
    const payDecimal = new Prisma.Decimal(amount.toFixed(2));

    if (payDecimal.greaterThan(outstanding)) {
      throw new Error(
        `OVERPAYMENT_REJECTED: Payment of INR ${payDecimal} exceeds outstanding balance of INR ${outstanding}.`
      );
    }

    const paymentNumber =
      'PAY-' +
      new Date().toISOString().slice(0, 10).replace(/-/g, '') +
      '-' +
      Math.floor(1000 + Math.random() * 9000);

    let payment;
    try {
      payment = await tx.payment.create({
        data: {
          paymentNumber,
          context: PaymentContext.RESTAURANT_BILL,
          amount: payDecimal,
          currency: 'INR',
          method,
          status: PaymentStatus.SUCCESS,
          transactionReference: transactionReference || null,
          notes: notes || null,
          restaurantBillId: bill.id,
          receivedById: userId || null,
          idempotencyKey: idempotencyKey || null,
        },
      });
    } catch (err) {
      // Catch concurrent unique constraint conflict on idempotencyKey
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        idempotencyKey
      ) {
        const existing = await tx.payment.findUnique({
          where: { idempotencyKey },
          include: { restaurantBill: true },
        });
        if (existing) {
          return {
            success: true,
            payment: existing,
            bill: existing.restaurantBill,
            outstanding: 0,
            isFullySettled: existing.restaurantBill?.status === BillStatus.SETTLED,
          };
        }
      }
      throw err;
    }

    const newTotalPaid = effectivePaid.plus(payDecimal);
    const remainingBalance = bill.totalAmount.minus(newTotalPaid);
    const isFullySettled = remainingBalance.lessThanOrEqualTo(new Prisma.Decimal(0));

    let updatedBill = bill;
    if (isFullySettled) {
      updatedBill = await tx.restaurantBill.update({
        where: { id: bill.id },
        data: { status: BillStatus.SETTLED },
        include: {
          payments: {
            where: { status: PaymentStatus.SUCCESS },
            include: { refunds: true },
          },
          order: {
            include: {
              tableSession: true,
            },
          },
        },
      });

      // Advance order to COMPLETED
      await tx.restaurantOrder.update({
        where: { id: bill.orderId },
        data: { status: 'COMPLETED' },
      });
    }

    await recordAuditEvent(
      {
        userId,
        action: 'RESTAURANT_BILL_PAYMENT',
        entity: 'Payment',
        entityId: payment.id,
        newValues: {
          paymentNumber: payment.paymentNumber,
          billNumber: bill.billNumber,
          amount: payDecimal.toNumber(),
          method,
          isFullySettled,
          remainingBalance: remainingBalance.toNumber(),
          idempotencyKey: idempotencyKey || null,
        },
      },
      tx
    );

    return {
      success: true,
      payment,
      bill: updatedBill,
      outstanding: remainingBalance.toNumber(),
      isFullySettled,
    };
  }
}

/**
 * Posts an unsettled RestaurantBill directly to a guest room Folio.
 * Idempotent: Enforced by unique constraint on FolioItem.restaurantBillId and Prisma P2002 recovery.
 * Does NOT create a Payment record (the guest settles the Folio at checkout).
 */
export async function postBillToRoomCharge(
  params: RoomChargeBillParams,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const { billId, stayId, roomId, notes, userId } = params;

  return await (client === prisma
    ? prisma.$transaction(async (tx) => runRoomCharge(tx), { timeout: 30000 })
    : runRoomCharge(client as Prisma.TransactionClient));

  async function runRoomCharge(tx: Prisma.TransactionClient) {
    // 1. Verify Bill
    const bill = await tx.restaurantBill.findUnique({
      where: { id: billId },
      include: {
        order: true,
        folioItem: {
          include: { folio: true },
        },
      },
    });

    if (!bill) {
      throw new Error('Restaurant bill not found.');
    }

    // If already charged to room or has linked folio item, return idempotently
    if (bill.status === BillStatus.CHARGED_TO_ROOM || bill.folioItem) {
      return {
        success: true,
        bill,
        folioItem: bill.folioItem,
        folioNumber: bill.folioItem?.folio?.folioNumber,
        alreadyProcessed: true,
      };
    }

    if (bill.status === BillStatus.SETTLED) {
      throw new Error('Cannot charge an already settled bill to a room.');
    }

    if (bill.status === BillStatus.CANCELLED || bill.status === BillStatus.SPLIT_CHILDREN) {
      throw new Error(`Cannot charge bill in state ${bill.status}.`);
    }

    // 2. Authoritative Verification of Stay, Room, and Folio
    const stay = await tx.stay.findUnique({
      where: { id: stayId },
      include: {
        folio: true,
        roomAssignments: {
          where: { status: 'ACTIVE' },
          include: { room: true },
        },
      },
    });

    if (!stay || stay.status !== StayStatus.ACTIVE) {
      throw new Error('The specified stay is not active or does not exist.');
    }

    const hasActiveRoom = stay.roomAssignments.some((ra) => ra.roomId === roomId);
    if (!hasActiveRoom) {
      throw new Error('The selected room is not actively assigned to this guest stay.');
    }

    if (!stay.folio || stay.folio.status !== 'OPEN') {
      throw new Error('Guest stay does not have an active open folio.');
    }

    const assignedRoom = stay.roomAssignments.find((ra) => ra.roomId === roomId)?.room;
    const roomNumber = assignedRoom?.roomNumber || 'Room';

    // 3. Create FolioItem linked to RestaurantBill (Atomic & Idempotent via @unique([restaurantBillId]))
    let folioItem;
    try {
      folioItem = await tx.folioItem.create({
        data: {
          folioId: stay.folio.id,
          itemType:
            bill.order.orderType === 'ROOM_SERVICE'
              ? FolioItemType.ROOM_SERVICE_CHARGE
              : FolioItemType.RESTAURANT_CHARGE,
          description: `Restaurant Bill #${bill.billNumber} (${bill.order.orderType}) - ${roomNumber}${notes ? ` - ${notes}` : ''}`,
          quantity: 1,
          unitPrice: bill.subtotal,
          taxAmount: bill.taxAmount,
          amount: bill.totalAmount,
          restaurantOrderId: bill.orderId,
          restaurantBillId: bill.id,
        },
      });
    } catch (err) {
      // Catch concurrent P2002 conflict on restaurantBillId unique constraint
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await tx.folioItem.findUnique({
          where: { restaurantBillId: bill.id },
          include: { folio: true },
        });
        if (existing) {
          return {
            success: true,
            bill,
            folioItem: existing,
            folioNumber: existing.folio.folioNumber,
            alreadyProcessed: true,
          };
        }
      }
      throw err;
    }

    // 4. Update Folio Ledger Balances: Reconcile from authoritative FolioItems
    const allItems = await tx.folioItem.findMany({
      where: { folioId: stay.folio.id, isVoided: false },
      select: { amount: true },
    });
    const calculatedCharges = allItems.reduce(
      (sum, item) => sum.plus(item.amount),
      new Prisma.Decimal(0)
    );
    const calculatedBalance = calculatedCharges.minus(stay.folio.totalCredits);

    await tx.folio.update({
      where: { id: stay.folio.id },
      data: {
        totalCharges: calculatedCharges,
        totalBalance: calculatedBalance,
      },
    });

    // 5. Update Bill Status to CHARGED_TO_ROOM
    const updatedBill = await tx.restaurantBill.update({
      where: { id: bill.id },
      data: { status: BillStatus.CHARGED_TO_ROOM },
    });

    // Advance order to COMPLETED
    await tx.restaurantOrder.update({
      where: { id: bill.orderId },
      data: { status: 'COMPLETED' },
    });

    // 6. Audit Record
    await recordAuditEvent(
      {
        userId,
        action: 'RESTAURANT_ROOM_CHARGE_POST',
        entity: 'FolioItem',
        entityId: folioItem.id,
        newValues: {
          billNumber: bill.billNumber,
          folioNumber: stay.folio.folioNumber,
          stayId,
          roomId,
          amount: bill.totalAmount.toNumber(),
        },
      },
      tx
    );

    return {
      success: true,
      bill: updatedBill,
      folioItem,
      folioNumber: stay.folio.folioNumber,
    };
  }
}

/**
 * Splits a RestaurantBill into child bills.
 * Supported modes: EQUAL, CUSTOM_AMOUNT, BY_ITEM.
 * Persists RestaurantBillItem and RestaurantBillAllocation for full mathematical auditability.
 * Reconciles exact sum using Decimal arithmetic with zero rounding drift.
 */
export async function splitRestaurantBill(
  params: SplitBillParams,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const { parentBillId, splitType, equalParts, customAmounts, itemAllocations, userId } = params;

  return await (client === prisma
    ? prisma.$transaction(async (tx) => runSplit(tx), { timeout: 30000 })
    : runSplit(client as Prisma.TransactionClient));

  async function runSplit(tx: Prisma.TransactionClient) {
    const parentBill = await tx.restaurantBill.findUnique({
      where: { id: parentBillId },
      include: {
        payments: true,
        order: {
          include: {
            items: {
              include: { menuItem: true },
            },
          },
        },
      },
    });

    if (!parentBill) {
      throw new Error('Parent bill not found.');
    }

    if (parentBill.status !== BillStatus.ISSUED) {
      throw new Error(`Cannot split a bill with status ${parentBill.status}.`);
    }

    if (parentBill.payments.length > 0) {
      throw new Error('Cannot split a bill that already has partial payments recorded.');
    }

    interface ChildBillPlan {
      subtotal: Prisma.Decimal;
      tax: Prisma.Decimal;
      total: Prisma.Decimal;
      items: {
        description: string;
        quantity: number;
        unitPrice: Prisma.Decimal;
        taxRate: Prisma.Decimal;
        amount: Prisma.Decimal;
      }[];
      allocations: {
        orderItemId: string;
        allocatedQuantity: number;
        allocatedAmount: Prisma.Decimal;
        taxAmount: Prisma.Decimal;
      }[];
    }

    const childPlans: ChildBillPlan[] = [];

    // Compute parent bill's effective tax rate from historical snapshot
    // NEVER re-query Tax config — preserve parent bill's historical tax data
    const parentEffectiveTaxRate = parentBill.subtotal.greaterThan(0)
      ? parentBill.taxAmount.dividedBy(parentBill.subtotal).times(100)
      : new Prisma.Decimal(0);

    if (splitType === SplitType.EQUAL) {
      if (!equalParts || equalParts < 2) {
        throw new Error('Equal split requires at least 2 parts.');
      }

      // Exact Decimal division with remainder allocation to the last portion
      const totalCents = Math.round(parentBill.totalAmount.toNumber() * 100);
      const subtotalCents = Math.round(parentBill.subtotal.toNumber() * 100);
      const taxCents = Math.round(parentBill.taxAmount.toNumber() * 100);

      const basePortionTotal = Math.floor(totalCents / equalParts);
      const remainderTotal = totalCents % equalParts;

      const basePortionSub = Math.floor(subtotalCents / equalParts);
      const remainderSub = subtotalCents % equalParts;

      const basePortionTax = Math.floor(taxCents / equalParts);
      const remainderTax = taxCents % equalParts;

      for (let i = 0; i < equalParts; i++) {
        const isLast = i === equalParts - 1;
        const pTotal = new Prisma.Decimal(
          ((basePortionTotal + (isLast ? remainderTotal : 0)) / 100).toFixed(2)
        );
        const pSub = new Prisma.Decimal(
          ((basePortionSub + (isLast ? remainderSub : 0)) / 100).toFixed(2)
        );
        const pTax = new Prisma.Decimal(
          ((basePortionTax + (isLast ? remainderTax : 0)) / 100).toFixed(2)
        );

        childPlans.push({
          total: pTotal,
          subtotal: pSub,
          tax: pTax,
          items: [
            {
              description: `Equal split (Part ${i + 1} of ${equalParts})`,
              quantity: 1,
              unitPrice: pSub,
              taxRate: parentEffectiveTaxRate,
              amount: pSub,
            },
          ],
          allocations: [],
        });
      }
    } else if (splitType === SplitType.CUSTOM_AMOUNT) {
      if (!customAmounts || customAmounts.length < 2) {
        throw new Error('Custom split requires at least 2 portions.');
      }

      let sumGiven = new Prisma.Decimal(0);
      for (const amt of customAmounts) {
        if (amt <= 0) throw new Error('Split portions must be positive numbers.');
        sumGiven = sumGiven.plus(new Prisma.Decimal(amt.toFixed(2)));
      }

      if (!sumGiven.equals(parentBill.totalAmount)) {
        throw new Error(
          `SPLIT_RECONCILIATION_ERROR: The sum of split portions (INR ${sumGiven}) must exactly match parent bill total (INR ${parentBill.totalAmount}).`
        );
      }

      let runningSub = new Prisma.Decimal(0);
      let runningTax = new Prisma.Decimal(0);

      for (let i = 0; i < customAmounts.length; i++) {
        const isLast = i === customAmounts.length - 1;
        const pTotal = new Prisma.Decimal(customAmounts[i].toFixed(2));

        let pSub: Prisma.Decimal;
        let pTax: Prisma.Decimal;

        if (isLast) {
          pSub = parentBill.subtotal.minus(runningSub);
          pTax = parentBill.taxAmount.minus(runningTax);
        } else {
          const ratio = pTotal.dividedBy(parentBill.totalAmount);
          pSub = new Prisma.Decimal(parentBill.subtotal.times(ratio).toFixed(2));
          pTax = pTotal.minus(pSub);
          runningSub = runningSub.plus(pSub);
          runningTax = runningTax.plus(pTax);
        }

        childPlans.push({
          total: pTotal,
          subtotal: pSub,
          tax: pTax,
          items: [
            {
              description: `Custom portion (Part ${i + 1} of ${customAmounts.length})`,
              quantity: 1,
              unitPrice: pSub,
              taxRate: parentEffectiveTaxRate,
              amount: pSub,
            },
          ],
          allocations: [],
        });
      }
    } else if (splitType === SplitType.BY_ITEM) {
      if (!itemAllocations || itemAllocations.length === 0) {
        throw new Error('BY_ITEM split requires item allocations.');
      }

      const orderItems = parentBill.order.items;
      const orderItemMap = new Map(orderItems.map((oi) => [oi.id, oi]));

      // Validate that all allocations refer to valid order items
      const allocatedQtyByOrderItem = new Map<string, number>();
      let maxChildIndex = 0;

      for (const alloc of itemAllocations) {
        if (!orderItemMap.has(alloc.orderItemId)) {
          throw new Error(`Order item ${alloc.orderItemId} does not exist on this order.`);
        }
        if (alloc.quantity <= 0) {
          throw new Error('Allocated quantity must be positive.');
        }
        if (alloc.childBillIndex < 0) {
          throw new Error('Child bill index must be non-negative.');
        }
        maxChildIndex = Math.max(maxChildIndex, alloc.childBillIndex);
        const currentTotal = allocatedQtyByOrderItem.get(alloc.orderItemId) || 0;
        allocatedQtyByOrderItem.set(alloc.orderItemId, currentTotal + alloc.quantity);
      }

      // Check completeness: Every order item must have its exact ordered quantity allocated across child bills
      for (const oi of orderItems) {
        const allocated = allocatedQtyByOrderItem.get(oi.id) || 0;
        if (allocated !== oi.quantity) {
          throw new Error(
            `INCOMPLETE_ITEM_ALLOCATION: Item "${oi.menuItem.name}" has quantity ${oi.quantity}, but ${allocated} was allocated.`
          );
        }
      }

      const numChildren = maxChildIndex + 1;
      if (numChildren < 2) {
        throw new Error('BY_ITEM split requires splitting into at least 2 child bills.');
      }

      // Group allocations by childBillIndex
      for (let i = 0; i < numChildren; i++) {
        const childAllocs = itemAllocations.filter((a) => a.childBillIndex === i);
        if (childAllocs.length === 0) {
          throw new Error(`Child bill ${i + 1} has no items allocated to it.`);
        }

        let childSubtotal = new Prisma.Decimal(0);
        let childTax = new Prisma.Decimal(0);
        const childItems = [];
        const dbAllocations = [];

        for (const ca of childAllocs) {
          const oi = orderItemMap.get(ca.orderItemId)!;
          const lineSubtotal = oi.unitPrice.times(ca.quantity);
          const lineTax = lineSubtotal.times(oi.taxRate).dividedBy(100);

          childSubtotal = childSubtotal.plus(lineSubtotal);
          childTax = childTax.plus(lineTax);

          childItems.push({
            description: oi.menuItem.name,
            quantity: ca.quantity,
            unitPrice: oi.unitPrice,
            taxRate: oi.taxRate,
            amount: new Prisma.Decimal(lineSubtotal.toFixed(2)),
          });

          dbAllocations.push({
            orderItemId: oi.id,
            allocatedQuantity: ca.quantity,
            allocatedAmount: new Prisma.Decimal(lineSubtotal.toFixed(2)),
            taxAmount: new Prisma.Decimal(lineTax.toFixed(2)),
          });
        }

        const roundedTax = new Prisma.Decimal(childTax.toFixed(2));
        const roundedSubtotal = new Prisma.Decimal(childSubtotal.toFixed(2));
        const childTotal = roundedSubtotal.plus(roundedTax);

        childPlans.push({
          subtotal: roundedSubtotal,
          tax: roundedTax,
          total: childTotal,
          items: childItems,
          allocations: dbAllocations,
        });
      }

      // Final reconciliation check for total sum
      const totalOfChildren = childPlans.reduce(
        (sum, cp) => sum.plus(cp.total),
        new Prisma.Decimal(0)
      );
      if (!totalOfChildren.equals(parentBill.totalAmount)) {
        // Adjust any penny rounding difference into the last child plan
        const diff = parentBill.totalAmount.minus(totalOfChildren);
        const last = childPlans[childPlans.length - 1];
        last.total = last.total.plus(diff);
        last.tax = last.tax.plus(diff);
      }
    } else {
      throw new Error(`Split type ${splitType} not currently supported.`);
    }

    // Mark parent bill as SPLIT_CHILDREN
    await tx.restaurantBill.update({
      where: { id: parentBill.id },
      data: {
        status: BillStatus.SPLIT_CHILDREN,
        splitType,
      },
    });

    // Create child bills with explicit RestaurantBillItem and RestaurantBillAllocation records
    const createdChildren = [];
    let idx = 1;
    for (const plan of childPlans) {
      const billNumber = `${parentBill.billNumber}-S${idx++}`;
      const child = await tx.restaurantBill.create({
        data: {
          billNumber,
          orderId: parentBill.orderId,
          parentBillId: parentBill.id,
          status: BillStatus.ISSUED,
          subtotal: plan.subtotal,
          discountAmount: new Prisma.Decimal(0),
          taxAmount: plan.tax,
          totalAmount: plan.total,
          items: {
            create: plan.items.map((it) => ({
              description: it.description,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              taxRate: it.taxRate,
              amount: it.amount,
            })),
          },
          allocations: {
            create: plan.allocations.map((al) => ({
              orderItemId: al.orderItemId,
              allocatedQuantity: al.allocatedQuantity,
              allocatedAmount: al.allocatedAmount,
              taxAmount: al.taxAmount,
            })),
          },
        },
        include: {
          items: true,
          allocations: true,
        },
      });
      createdChildren.push(child);
    }

    await recordAuditEvent(
      {
        userId,
        action: 'RESTAURANT_BILL_SPLIT',
        entity: 'RestaurantBill',
        entityId: parentBill.id,
        newValues: {
          splitType,
          parts: createdChildren.length,
          childBillNumbers: createdChildren.map((c) => c.billNumber),
        },
      },
      tx
    );

    return {
      success: true,
      parentBillId: parentBill.id,
      childBills: createdChildren,
    };
  }
}

