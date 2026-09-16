import { prisma } from '@/lib/db/prisma';
import { Prisma, StockRequestStatus, TransferStatus, StockMovementType } from '@prisma/client';
import { generateInventoryNumber } from './numbers';
import { postStockMovement } from './stock-ledger-service';
import { recordAuditEvent } from '@/lib/auth/audit';

export const DEPARTMENT_STORE_CODE_MAP: Record<string, string> = {
  Kitchen: 'STORE-KIT',
  Bar: 'STORE-BAR',
  Housekeeping: 'STORE-HK',
  Maintenance: 'STORE-MAINT',
  Garden: 'STORE-GARDEN',
};

export interface CreateStockRequestParams {
  department: string;
  sourceStoreId?: string; // Optional: defaults to STORE-MAIN
  destinationStoreId?: string; // Optional: defaults to department store
  requestedById: string;
  reason?: string | null;
  submitImmediately?: boolean;
  items: Array<{
    itemId: string;
    requestedQty: Prisma.Decimal | number | string;
    unitId?: string | null;
    notes?: string | null;
  }>;
}

export interface ApproveStockRequestParams {
  requestId: string;
  approvedById: string;
  items?: Array<{
    itemId: string;
    approvedQty: Prisma.Decimal | number | string;
  }>;
  notes?: string | null;
}

export interface RejectStockRequestParams {
  requestId: string;
  rejectedById: string;
  rejectionReason: string;
}

export interface CancelStockRequestParams {
  requestId: string;
  cancelledById: string;
  reason?: string | null;
}

export interface IssueStockRequestParams {
  requestId: string;
  performedById: string;
  remarks?: string | null;
  /**
   * Optional item-level issued quantities. If omitted, uses approvedQty.
   * issuedQty must satisfy: 0 <= issuedQty <= approvedQty and <= available source stock.
   */
  items?: Array<{
    itemId: string;
    issuedQty: Prisma.Decimal | number | string;
    shortReason?: string | null;
  }>;
}

/**
 * Validates department and store mapping, ensuring normal department requests
 * correctly target Central Store -> Department Store.
 */
export async function validateDepartmentStoreMapping(
  department: string,
  destStoreId?: string,
  sourceStoreId?: string,
  tx: Prisma.TransactionClient = prisma
): Promise<{ sourceStore: { id: string; code: string; name: string }; destStore: { id: string; code: string; name: string } }> {
  const expectedDestCode = DEPARTMENT_STORE_CODE_MAP[department];
  if (!expectedDestCode) {
    throw new Error(`Unsupported requesting department: [${department}]. Must be Kitchen, Bar, Housekeeping, Maintenance, or Garden.`);
  }

  // Resolve source store (default to Central Store)
  let sourceStore;
  if (sourceStoreId) {
    sourceStore = await tx.store.findUnique({ where: { id: sourceStoreId } });
    if (!sourceStore) throw new Error(`Source store [${sourceStoreId}] not found.`);
    if (!sourceStore.isActive) throw new Error(`Source store [${sourceStore.name}] is inactive.`);
  } else {
    sourceStore = await tx.store.findUnique({ where: { code: 'STORE-MAIN' } });
    if (!sourceStore) throw new Error('Central Warehouse Store [STORE-MAIN] not found or inactive.');
  }

  // Resolve destination store
  let destStore;
  if (destStoreId) {
    destStore = await tx.store.findUnique({ where: { id: destStoreId } });
    if (!destStore) throw new Error(`Destination store [${destStoreId}] not found.`);
    if (!destStore.isActive) throw new Error(`Destination store [${destStore.name}] is inactive.`);
    if (destStore.code !== expectedDestCode) {
      throw new Error(`Invalid destination store [${destStore.code}] for department [${department}]. Expected store [${expectedDestCode}].`);
    }
  } else {
    destStore = await tx.store.findUnique({ where: { code: expectedDestCode } });
    if (!destStore) throw new Error(`Department store [${expectedDestCode}] for [${department}] not found or inactive.`);
  }

  if (sourceStore.id === destStore.id) {
    throw new Error('Source store and destination store cannot be the same.');
  }

  return { sourceStore, destStore };
}

/**
 * Creates a StockRequest in DRAFT (or SUBMITTED) status.
 * DOES NOT MOVE STOCK.
 */
export async function createStockRequest(
  params: CreateStockRequestParams,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const { department, sourceStoreId, destinationStoreId, requestedById, reason, submitImmediately, items } = params;

  if (!items || items.length === 0) {
    throw new Error('Stock request must contain at least one item.');
  }

  // Check for duplicate items in the input
  const itemIds = new Set<string>();
  for (const it of items) {
    if (itemIds.has(it.itemId)) {
      throw new Error(`Duplicate item [${it.itemId}] detected in request.`);
    }
    itemIds.add(it.itemId);

    const qty = new Prisma.Decimal(it.requestedQty);
    if (qty.lessThanOrEqualTo(0)) {
      throw new Error('Requested quantity must be greater than zero.');
    }
  }

  return await (client === prisma
    ? prisma.$transaction(async (tx) => runCreate(tx), { maxWait: 15000, timeout: 30000 })
    : runCreate(client as Prisma.TransactionClient));

  async function runCreate(tx: Prisma.TransactionClient) {
    const { sourceStore, destStore } = await validateDepartmentStoreMapping(
      department,
      destinationStoreId,
      sourceStoreId,
      tx
    );

    const initialStatus = submitImmediately ? StockRequestStatus.SUBMITTED : StockRequestStatus.DRAFT;
    const requestNumber = generateInventoryNumber('SRQ');

    // Batch fetch inventory items
    const itemIdsList = items.map((i) => i.itemId);
    const invItems = await tx.inventoryItem.findMany({
      where: { id: { in: itemIdsList } },
      include: { baseUnit: true },
    });
    const itemMap = new Map(invItems.map((it) => [it.id, it]));

    for (const it of items) {
      const invItem = itemMap.get(it.itemId);
      if (!invItem || !invItem.isActive) {
        throw new Error(`Inventory item [${it.itemId}] not found or inactive.`);
      }
    }

    const request = await tx.stockRequest.create({
      data: {
        requestNumber,
        department,
        sourceStoreId: sourceStore.id,
        destinationStoreId: destStore.id,
        requestedById,
        status: initialStatus,
        reason: reason || null,
        items: {
          create: items.map((it) => {
            const invItem = itemMap.get(it.itemId)!;
            return {
              inventoryItemId: it.itemId,
              requestedQty: new Prisma.Decimal(it.requestedQty),
              approvedQty: new Prisma.Decimal(0),
              unitId: it.unitId || invItem.baseUnitId,
              notes: it.notes || null,
            };
          }),
        },
      },
    });

    await recordAuditEvent(
      {
        userId: requestedById,
        action: submitImmediately ? 'STOCK_REQUEST_SUBMIT' : 'STOCK_REQUEST_CREATE',
        entity: 'StockRequest',
        entityId: request.id,
        newValues: {
          requestNumber,
          department,
          status: initialStatus,
          itemCount: items.length,
        },
      },
      tx
    );

    return await tx.stockRequest.findUniqueOrThrow({
      where: { id: request.id },
      include: {
        items: {
          include: {
            inventoryItem: { include: { baseUnit: true } },
            unit: true,
          },
        },
        sourceStore: true,
        destinationStore: true,
        requestedBy: { select: { id: true, name: true, email: true } },
      },
    });
  }
}

/**
 * Submits a DRAFT request -> SUBMITTED.
 * DOES NOT MOVE STOCK.
 */
export async function submitStockRequest(
  requestId: string,
  userId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  return await (client === prisma
    ? prisma.$transaction(async (tx) => runSubmit(tx), { maxWait: 15000, timeout: 30000 })
    : runSubmit(client as Prisma.TransactionClient));

  async function runSubmit(tx: Prisma.TransactionClient) {
    const request = await tx.stockRequest.findUnique({
      where: { id: requestId },
      include: { items: true },
    });

    if (!request) throw new Error(`Stock request [${requestId}] not found.`);
    if (request.status !== StockRequestStatus.DRAFT) {
      throw new Error(`Stock request cannot be submitted in status [${request.status}]. Must be DRAFT.`);
    }
    if (request.items.length === 0) {
      throw new Error('Stock request cannot be submitted without items.');
    }

    const updated = await tx.stockRequest.update({
      where: { id: requestId },
      data: { status: StockRequestStatus.SUBMITTED },
      include: {
        items: { include: { inventoryItem: { include: { baseUnit: true } }, unit: true } },
        sourceStore: true,
        destinationStore: true,
      },
    });

    await recordAuditEvent(
      {
        userId,
        action: 'STOCK_REQUEST_SUBMIT',
        entity: 'StockRequest',
        entityId: requestId,
        oldValues: { status: StockRequestStatus.DRAFT },
        newValues: { status: StockRequestStatus.SUBMITTED },
      },
      tx
    );

    return updated;
  }
}

/**
 * Approves a SUBMITTED request.
 * Allows Store Manager to approve full or partial quantities.
 * Enforces: 0 <= approvedQty <= requestedQty.
 * Sets status: APPROVED (if all items full), PARTIALLY_APPROVED (if any reduced/zero), or REJECTED (if all 0).
 * DOES NOT MOVE STOCK.
 */
export async function approveStockRequest(
  params: ApproveStockRequestParams,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const { requestId, approvedById, items: itemApprovals, notes } = params;

  return await (client === prisma
    ? prisma.$transaction(async (tx) => runApprove(tx), { maxWait: 15000, timeout: 30000 })
    : runApprove(client as Prisma.TransactionClient));

  async function runApprove(tx: Prisma.TransactionClient) {
    const request = await tx.stockRequest.findUnique({
      where: { id: requestId },
      include: { items: true },
    });

    if (!request) throw new Error(`Stock request [${requestId}] not found.`);
    if (request.status !== StockRequestStatus.SUBMITTED) {
      throw new Error(`Stock request cannot be approved in status [${request.status}]. Must be SUBMITTED.`);
    }

    let allFull = true;
    let anyApproved = false;

    for (const reqItem of request.items) {
      let approvedQty: Prisma.Decimal;

      if (itemApprovals && itemApprovals.length > 0) {
        const matching = itemApprovals.find((a) => a.itemId === reqItem.inventoryItemId);
        if (!matching) {
          throw new Error(`Missing approval decision for item [${reqItem.inventoryItemId}].`);
        }
        approvedQty = new Prisma.Decimal(matching.approvedQty);
      } else {
        // Default: approve requested quantity in full
        approvedQty = reqItem.requestedQty;
      }

      if (approvedQty.lessThan(0)) {
        throw new Error(`Approved quantity cannot be negative for item [${reqItem.inventoryItemId}].`);
      }

      if (approvedQty.greaterThan(reqItem.requestedQty)) {
        throw new Error(
          `Approved quantity (${approvedQty}) cannot exceed requested quantity (${reqItem.requestedQty}) for item [${reqItem.inventoryItemId}].`
        );
      }

      if (approvedQty.lessThan(reqItem.requestedQty)) {
        allFull = false;
      }
      if (approvedQty.greaterThan(0)) {
        anyApproved = true;
      }

      await tx.stockRequestItem.update({
        where: { id: reqItem.id },
        data: { approvedQty },
      });
    }

    let targetStatus: StockRequestStatus;
    if (!anyApproved) {
      targetStatus = StockRequestStatus.REJECTED;
    } else if (allFull) {
      targetStatus = StockRequestStatus.APPROVED;
    } else {
      targetStatus = StockRequestStatus.PARTIALLY_APPROVED;
    }

    const updated = await tx.stockRequest.update({
      where: { id: requestId },
      data: {
        status: targetStatus,
        approvedById,
        approvedAt: new Date(),
        notes: notes ? `${request.notes || ''}\n${notes}`.trim() : request.notes,
      },
      include: {
        items: { include: { inventoryItem: { include: { baseUnit: true } }, unit: true } },
        sourceStore: true,
        destinationStore: true,
      },
    });

    await recordAuditEvent(
      {
        userId: approvedById,
        action: targetStatus === StockRequestStatus.REJECTED ? 'STOCK_REQUEST_REJECT' : 'STOCK_REQUEST_APPROVE',
        entity: 'StockRequest',
        entityId: requestId,
        oldValues: { status: StockRequestStatus.SUBMITTED },
        newValues: {
          status: targetStatus,
          approvedAt: updated.approvedAt,
        },
      },
      tx
    );

    return updated;
  }
}

/**
 * Rejects a SUBMITTED request with mandatory explanation reason.
 * DOES NOT MOVE STOCK.
 */
export async function rejectStockRequest(
  params: RejectStockRequestParams,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const { requestId, rejectedById, rejectionReason } = params;

  if (!rejectionReason || rejectionReason.trim().length === 0) {
    throw new Error('Mandatory rejection reason must be provided.');
  }

  return await (client === prisma
    ? prisma.$transaction(async (tx) => runReject(tx), { maxWait: 15000, timeout: 30000 })
    : runReject(client as Prisma.TransactionClient));

  async function runReject(tx: Prisma.TransactionClient) {
    const request = await tx.stockRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new Error(`Stock request [${requestId}] not found.`);
    if (request.status !== StockRequestStatus.SUBMITTED) {
      throw new Error(`Stock request cannot be rejected in status [${request.status}]. Must be SUBMITTED.`);
    }

    const updated = await tx.stockRequest.update({
      where: { id: requestId },
      data: {
        status: StockRequestStatus.REJECTED,
        approvedById: rejectedById,
        approvedAt: new Date(),
        rejectionReason: rejectionReason.trim(),
      },
      include: {
        items: { include: { inventoryItem: true, unit: true } },
        sourceStore: true,
        destinationStore: true,
      },
    });

    await recordAuditEvent(
      {
        userId: rejectedById,
        action: 'STOCK_REQUEST_REJECT',
        entity: 'StockRequest',
        entityId: requestId,
        oldValues: { status: StockRequestStatus.SUBMITTED },
        newValues: { status: StockRequestStatus.REJECTED, rejectionReason },
      },
      tx
    );

    return updated;
  }
}

/**
 * Cancels a DRAFT or SUBMITTED stock request.
 */
export async function cancelStockRequest(
  params: CancelStockRequestParams,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const { requestId, cancelledById, reason } = params;

  return await (client === prisma
    ? prisma.$transaction(async (tx) => runCancel(tx), { maxWait: 15000, timeout: 30000 })
    : runCancel(client as Prisma.TransactionClient));

  async function runCancel(tx: Prisma.TransactionClient) {
    const request = await tx.stockRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new Error(`Stock request [${requestId}] not found.`);

    if (request.status !== StockRequestStatus.DRAFT && request.status !== StockRequestStatus.SUBMITTED) {
      throw new Error(`Stock request cannot be cancelled in status [${request.status}].`);
    }

    const updated = await tx.stockRequest.update({
      where: { id: requestId },
      data: {
        status: StockRequestStatus.CANCELLED,
        notes: reason ? `${request.notes || ''}\nCancelled: ${reason}`.trim() : request.notes,
      },
      include: { items: true, sourceStore: true, destinationStore: true },
    });

    await recordAuditEvent(
      {
        userId: cancelledById,
        action: 'STOCK_REQUEST_CANCEL',
        entity: 'StockRequest',
        entityId: requestId,
        oldValues: { status: request.status },
        newValues: { status: StockRequestStatus.CANCELLED },
      },
      tx
    );

    return updated;
  }
}

/**
 * AUTHORITATIVE ISSUE / INTERNAL STORE TRANSFER MUTATION ENGINE
 *
 * Real-world Same-Premises Invariant:
 * 1. Physical handover happens directly within the resort.
 * 2. In a SINGLE ATOMIC TRANSACTION with PostgreSQL row-level locks (SELECT ... FOR UPDATE):
 *    - Validates request is APPROVED or PARTIALLY_APPROVED (fails fast if already FULFILLED, duplicate protection).
 *    - Re-checks live Central Store stock availability under the lock.
 *    - Creates an authoritative StockTransfer linked to the StockRequest.
 *    - Creates TRANSFER_OUT movement at Central Store -> decreases Central Store stock.
 *    - Creates TRANSFER_IN movement at Destination Store -> increases Destination Store stock.
 *    - Records exact issuedQty (and short-issue reason if issuedQty < approvedQty).
 *    - Sets StockTransfer status to RECEIVED (completed).
 *    - Sets StockRequest status to FULFILLED.
 *    - Records an audit log event.
 *
 * Invariant:
 * Central Store balance (-X) + Destination Store balance (+X) => Resort total inventory remains identical.
 */
export async function executeIssueAndTransfer(
  params: IssueStockRequestParams,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const { requestId, performedById, remarks, items: itemIssues } = params;

  return await (client === prisma
    ? prisma.$transaction(async (tx) => runIssue(tx), {
        maxWait: 15000,
        timeout: 30000,
      })
    : runIssue(client as Prisma.TransactionClient));

  async function runIssue(tx: Prisma.TransactionClient) {
    // 1. Lock and load the StockRequest row
    const lockedRequests = await tx.$queryRaw<Array<{ id: string; status: StockRequestStatus }>>`
      SELECT id, status
      FROM "StockRequest"
      WHERE id = ${requestId}
      FOR UPDATE
    `;

    if (!lockedRequests || lockedRequests.length === 0) {
      throw new Error(`Stock request [${requestId}] not found.`);
    }

    const currentStatus = lockedRequests[0].status;

    if (currentStatus === StockRequestStatus.FULFILLED) {
      throw new Error(`Stock request [${requestId}] has already been fulfilled. Duplicate issue prevented.`);
    }

    if (
      currentStatus !== StockRequestStatus.APPROVED &&
      currentStatus !== StockRequestStatus.PARTIALLY_APPROVED
    ) {
      throw new Error(`Stock request cannot be issued in status [${currentStatus}]. Must be APPROVED or PARTIALLY_APPROVED.`);
    }

    const request = await tx.stockRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: {
        items: { include: { inventoryItem: { include: { baseUnit: true } }, unit: true } },
        sourceStore: true,
        destinationStore: true,
      },
    });

    // 2. Validate issue items
    const transferItemsToCreate: Array<{
      itemId: string;
      approvedQty: Prisma.Decimal;
      issuedQty: Prisma.Decimal;
      unitId: string;
      notes: string | null;
    }> = [];

    for (const reqItem of request.items) {
      let issuedQty = reqItem.approvedQty;
      let shortReason: string | null = null;

      if (itemIssues && itemIssues.length > 0) {
        const itemParam = itemIssues.find((i) => i.itemId === reqItem.inventoryItemId);
        if (itemParam) {
          issuedQty = new Prisma.Decimal(itemParam.issuedQty);
          shortReason = itemParam.shortReason || null;
        }
      }

      if (issuedQty.lessThan(0)) {
        throw new Error(`Issued quantity cannot be negative for [${reqItem.inventoryItem.name}].`);
      }

      if (issuedQty.greaterThan(reqItem.approvedQty)) {
        throw new Error(
          `Issued quantity (${issuedQty}) cannot exceed approved quantity (${reqItem.approvedQty}) for [${reqItem.inventoryItem.name}].`
        );
      }

      if (issuedQty.lessThan(reqItem.approvedQty) && !shortReason) {
        shortReason = 'Short issued by Store Manager';
      }

      transferItemsToCreate.push({
        itemId: reqItem.inventoryItemId,
        approvedQty: reqItem.approvedQty,
        issuedQty,
        unitId: reqItem.unitId,
        notes: shortReason,
      });
    }

    const activeTransferItems = transferItemsToCreate.filter((i) => i.issuedQty.greaterThan(0));
    if (activeTransferItems.length === 0) {
      throw new Error('At least one item must have an issued quantity greater than zero.');
    }

    // 3. Create the authoritative StockTransfer record
    const transferNumber = generateInventoryNumber('TRF');
    const transfer = await tx.stockTransfer.create({
      data: {
        transferNumber,
        sourceStoreId: request.sourceStoreId,
        destStoreId: request.destinationStoreId,
        status: TransferStatus.RECEIVED, // Immediately completed in same-premises internal issue
        requestedById: request.requestedById,
        approvedById: performedById,
        dispatchedById: performedById,
        receivedById: performedById,
        approvedAt: new Date(),
        dispatchedAt: new Date(),
        receivedAt: new Date(),
        stockRequestId: request.id,
        notes: remarks || `Handover for Stock Request #${request.requestNumber}`,
      },
    });

    // 4. Execute atomic transfer for each item via postStockMovement
    for (const item of activeTransferItems) {
      // 4a. TRANSFER_OUT at Source Store (Central Store)
      // postStockMovement automatically acquires SELECT FOR UPDATE on Stock row and enforces negative-stock protection
      const outMovement = await postStockMovement(
        {
          storeId: request.sourceStoreId,
          itemId: item.itemId,
          movementType: StockMovementType.TRANSFER_OUT,
          quantity: item.issuedQty,
          unitId: item.unitId,
          transferId: transfer.id,
          toStoreId: request.destinationStoreId,
          stockRequestId: request.id,
          performedById,
          remarks: `Issue / Transfer: #${transfer.transferNumber} for Request #${request.requestNumber} to [${request.destinationStore.name}]`,
          allowNegativeStock: false,
        },
        tx
      );

      // 4b. TRANSFER_IN at Destination Store (Department Store)
      const inMovement = await postStockMovement(
        {
          storeId: request.destinationStoreId,
          itemId: item.itemId,
          movementType: StockMovementType.TRANSFER_IN,
          quantity: item.issuedQty,
          unitId: item.unitId,
          transferId: transfer.id,
          fromStoreId: request.sourceStoreId,
          stockRequestId: request.id,
          performedById,
          remarks: `Transfer Receipt: #${transfer.transferNumber} from [${request.sourceStore.name}] for Request #${request.requestNumber}`,
          allowNegativeStock: false,
        },
        tx
      );

      // 4c. Record transfer item
      await tx.stockTransferItem.create({
        data: {
          transferId: transfer.id,
          itemId: item.itemId,
          requestedQty: item.approvedQty,
          dispatchedQty: item.issuedQty,
          receivedQty: item.issuedQty,
          damagedQty: new Prisma.Decimal(0),
          unitId: item.unitId,
          notes: item.notes,
        },
      });
    }

    // 5. Update StockRequest to FULFILLED
    const fulfilledRequest = await tx.stockRequest.update({
      where: { id: request.id },
      data: {
        status: StockRequestStatus.FULFILLED,
        notes: remarks ? `${request.notes || ''}\nIssued: ${remarks}`.trim() : request.notes,
      },
      include: {
        items: { include: { inventoryItem: { include: { baseUnit: true } }, unit: true } },
        sourceStore: true,
        destinationStore: true,
        transfers: { include: { items: true } },
      },
    });

    // 6. Record AuditLog
    await recordAuditEvent(
      {
        userId: performedById,
        action: 'STOCK_REQUEST_ISSUE_AND_TRANSFER',
        entity: 'StockRequest',
        entityId: request.id,
        newValues: {
          transferNumber: transfer.transferNumber,
          transferId: transfer.id,
          status: StockRequestStatus.FULFILLED,
          sourceStoreId: request.sourceStoreId,
          destStoreId: request.destinationStoreId,
          itemCount: activeTransferItems.length,
        },
      },
      tx
    );

    return {
      success: true,
      request: fulfilledRequest,
      transfer,
    };
  }
}

/**
 * Queries stock requests with filtering, pagination and sorting.
 */
export async function getStockRequestsList(params?: {
  department?: string;
  status?: StockRequestStatus;
  destinationStoreId?: string;
  sourceStoreId?: string;
  requestedById?: string;
  take?: number;
  skip?: number;
}) {
  const where: Prisma.StockRequestWhereInput = {};

  if (params?.department) where.department = params.department;
  if (params?.status) where.status = params.status;
  if (params?.destinationStoreId) where.destinationStoreId = params.destinationStoreId;
  if (params?.sourceStoreId) where.sourceStoreId = params.sourceStoreId;
  if (params?.requestedById) where.requestedById = params.requestedById;

  const [total, requests] = await Promise.all([
    prisma.stockRequest.count({ where }),
    prisma.stockRequest.findMany({
      where,
      take: params?.take || 50,
      skip: params?.skip || 0,
      orderBy: { createdAt: 'desc' },
      include: {
        sourceStore: true,
        destinationStore: true,
        requestedBy: { select: { id: true, name: true, email: true, role: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            inventoryItem: { include: { baseUnit: true } },
            unit: true,
          },
        },
        transfers: {
          select: {
            id: true,
            transferNumber: true,
            status: true,
            createdAt: true,
          },
        },
      },
    }),
  ]);

  return { total, requests };
}