import { prisma } from '@/lib/db/prisma';
import { generateInventoryNumber } from '@/lib/inventory/numbers';
import { recordAuditEvent } from '@/lib/auth/audit';
import { Prisma, PurchaseRequestStatus } from '@prisma/client';

export interface CreatePurchaseRequestInput {
  department: string;
  notes?: string;
  requestedById: string;
  items: {
    itemId: string;
    quantity: number | string | Prisma.Decimal;
    estimatedCost?: number | string | Prisma.Decimal;
    notes?: string;
  }[];
}

export async function createPurchaseRequest(input: CreatePurchaseRequestInput) {
  if (!input.items || input.items.length === 0) {
    throw new Error('A purchase request must have at least one item.');
  }

  return prisma.$transaction(async (tx) => {
    // 1. Verify item catalog existence
    for (const item of input.items) {
      const invItem = await tx.inventoryItem.findUnique({
        where: { id: item.itemId },
      });
      if (!invItem || !invItem.isActive) {
        throw new Error(`Inventory item [${item.itemId}] not found or inactive.`);
      }
      const qty = new Prisma.Decimal(item.quantity);
      if (qty.lessThanOrEqualTo(0)) {
        throw new Error(`Requested quantity for item [${invItem.name}] must be greater than 0.`);
      }
    }

    const requestNumber = generateInventoryNumber('PR');

    const pr = await tx.purchaseRequest.create({
      data: {
        requestNumber,
        department: input.department.trim(),
        notes: input.notes?.trim() || null,
        requestedById: input.requestedById,
        status: PurchaseRequestStatus.DRAFT,
        items: {
          create: input.items.map((it) => ({
            itemId: it.itemId,
            quantity: new Prisma.Decimal(new Prisma.Decimal(it.quantity).toFixed(4)),
            estimatedCost: it.estimatedCost ? new Prisma.Decimal(new Prisma.Decimal(it.estimatedCost).toFixed(2)) : null,
            notes: it.notes?.trim() || null,
          })),
        },
      },
      include: {
        items: {
          include: {
            item: {
              include: { baseUnit: true },
            },
          },
        },
        requestedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    await recordAuditEvent(
      {
        userId: input.requestedById,
        action: 'PURCHASE_REQUEST_CREATED',
        entity: 'PurchaseRequest',
        entityId: pr.id,
        newValues: {
          requestNumber: pr.requestNumber,
          department: pr.department,
          itemCount: pr.items.length,
        },
      },
      tx
    );

    return pr;
  });
}

export async function submitPurchaseRequest(requestId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const pr = await tx.purchaseRequest.findUnique({
      where: { id: requestId },
      include: { items: true },
    });

    if (!pr) {
      throw new Error(`Purchase request [${requestId}] not found.`);
    }

    if (pr.status !== PurchaseRequestStatus.DRAFT) {
      throw new Error(`Cannot submit purchase request with status [${pr.status}]. Must be in DRAFT state.`);
    }

    const updated = await tx.purchaseRequest.update({
      where: { id: requestId },
      data: { status: PurchaseRequestStatus.PENDING_APPROVAL },
    });

    await recordAuditEvent(
      {
        userId,
        action: 'PURCHASE_REQUEST_SUBMITTED',
        entity: 'PurchaseRequest',
        entityId: pr.id,
        oldValues: { status: pr.status },
        newValues: { status: updated.status },
      },
      tx
    );

    return updated;
  });
}

export async function approvePurchaseRequest(requestId: string, approvedById: string) {
  return prisma.$transaction(async (tx) => {
    const pr = await tx.purchaseRequest.findUnique({
      where: { id: requestId },
    });

    if (!pr) {
      throw new Error(`Purchase request [${requestId}] not found.`);
    }

    if (pr.status !== PurchaseRequestStatus.PENDING_APPROVAL) {
      throw new Error(`Cannot approve request in status [${pr.status}]. Must be PENDING_APPROVAL.`);
    }

    const updated = await tx.purchaseRequest.update({
      where: { id: requestId },
      data: {
        status: PurchaseRequestStatus.APPROVED,
        approvedById,
        approvedAt: new Date(),
      },
      include: {
        approvedBy: { select: { id: true, name: true } },
      },
    });

    await recordAuditEvent(
      {
        userId: approvedById,
        action: 'PURCHASE_REQUEST_APPROVED',
        entity: 'PurchaseRequest',
        entityId: pr.id,
        oldValues: { status: pr.status },
        newValues: { status: updated.status, approvedById },
      },
      tx
    );

    return updated;
  });
}

export async function rejectPurchaseRequest(requestId: string, rejectedById: string, reason?: string) {
  return prisma.$transaction(async (tx) => {
    const pr = await tx.purchaseRequest.findUnique({
      where: { id: requestId },
    });

    if (!pr) {
      throw new Error(`Purchase request [${requestId}] not found.`);
    }

    if (pr.status !== PurchaseRequestStatus.PENDING_APPROVAL) {
      throw new Error(`Cannot reject request in status [${pr.status}]. Must be PENDING_APPROVAL.`);
    }

    const updated = await tx.purchaseRequest.update({
      where: { id: requestId },
      data: {
        status: PurchaseRequestStatus.REJECTED,
        notes: reason ? `${pr.notes ? pr.notes + ' | ' : ''}Rejection reason: ${reason}` : pr.notes,
      },
    });

    await recordAuditEvent(
      {
        userId: rejectedById,
        action: 'PURCHASE_REQUEST_REJECTED',
        entity: 'PurchaseRequest',
        entityId: pr.id,
        oldValues: { status: pr.status },
        newValues: { status: updated.status, reason },
      },
      tx
    );

    return updated;
  });
}

export async function cancelPurchaseRequest(requestId: string, cancelledById: string) {
  return prisma.$transaction(async (tx) => {
    const pr = await tx.purchaseRequest.findUnique({
      where: { id: requestId },
    });

    if (!pr) {
      throw new Error(`Purchase request [${requestId}] not found.`);
    }

    if (pr.status === PurchaseRequestStatus.APPROVED) {
      // Check if any POs are attached
      const poCount = await tx.purchaseOrder.count({ where: { requestId } });
      if (poCount > 0) {
        throw new Error(`Cannot cancel purchase request with existing purchase orders attached.`);
      }
    } else if (pr.status !== PurchaseRequestStatus.DRAFT && pr.status !== PurchaseRequestStatus.PENDING_APPROVAL) {
      throw new Error(`Cannot cancel request in status [${pr.status}].`);
    }

    const updated = await tx.purchaseRequest.update({
      where: { id: requestId },
      data: { status: PurchaseRequestStatus.CANCELLED },
    });

    await recordAuditEvent(
      {
        userId: cancelledById,
        action: 'PURCHASE_REQUEST_CANCELLED',
        entity: 'PurchaseRequest',
        entityId: pr.id,
        oldValues: { status: pr.status },
        newValues: { status: updated.status },
      },
      tx
    );

    return updated;
  });
}

export async function getPurchaseRequestsList(options?: { status?: PurchaseRequestStatus; search?: string }) {
  const where: Prisma.PurchaseRequestWhereInput = {};
  if (options?.status) {
    where.status = options.status;
  }
  if (options?.search) {
    const q = options.search.trim();
    where.OR = [
      { requestNumber: { contains: q, mode: 'insensitive' } },
      { department: { contains: q, mode: 'insensitive' } },
      { requestedBy: { name: { contains: q, mode: 'insensitive' } } },
    ];
  }

  const list = await prisma.purchaseRequest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      requestedBy: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
      items: {
        include: {
          item: {
            include: { baseUnit: true, category: true },
          },
        },
      },
      purchaseOrders: {
        where: { status: { not: 'CANCELLED' } },
        select: {
          id: true,
          poNumber: true,
          status: true,
          items: {
            select: { itemId: true, orderedQuantity: true },
          },
        },
      },
    },
  });

  return list.map((pr) => {
    let totalEst = new Prisma.Decimal(0);
    for (const it of pr.items) {
      if (it.estimatedCost) {
        const lineEst = new Prisma.Decimal(it.quantity).times(new Prisma.Decimal(it.estimatedCost));
        totalEst = totalEst.plus(lineEst);
      }
    }

    // Determine if all requested item quantities have been fulfilled by active POs
    const activePos = pr.purchaseOrders || [];
    const orderedQuantitiesByItem = new Map<string, Prisma.Decimal>();
    for (const po of activePos) {
      for (const poItem of po.items) {
        const cur = orderedQuantitiesByItem.get(poItem.itemId) || new Prisma.Decimal(0);
        orderedQuantitiesByItem.set(poItem.itemId, cur.plus(new Prisma.Decimal(poItem.orderedQuantity)));
      }
    }

    const isFullyOrdered =
      activePos.length > 0 &&
      pr.items.every((reqItem) => {
        const ordered = orderedQuantitiesByItem.get(reqItem.itemId) || new Prisma.Decimal(0);
        return ordered.greaterThanOrEqualTo(new Prisma.Decimal(reqItem.quantity));
      });

    return {
      ...pr,
      totalEstimatedCost: totalEst.toFixed(2),
      hasIssuedPo: activePos.length > 0,
      isFullyOrdered,
      activePoNumbers: activePos.map((po) => po.poNumber),
    };
  });
}

