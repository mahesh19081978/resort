'use server';

import { prisma } from '@/lib/db/prisma';
import { Prisma, StockMovementType } from '@prisma/client';
import { postStockMovement } from '@/lib/inventory/stock-ledger-service';
import { createStockTransfer, approveStockTransfer, dispatchStockTransfer, receiveStockTransfer } from '@/lib/inventory/transfer-service';
import {
  createStockRequest,
  submitStockRequest,
  approveStockRequest,
  rejectStockRequest,
  cancelStockRequest,
  executeIssueAndTransfer,
  getStockRequestsList,
} from '@/lib/inventory/request-service';
import { createStockCount, recordStockCountItems, postStockCount } from '@/lib/inventory/count-service';
import { requirePermission } from '@/lib/permissions/rbac';
import { getCurrentUser } from '@/lib/auth/auth';
import { revalidatePath } from 'next/cache';

export interface ActionResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Safely converts Prisma Decimals, Dates, and nested objects to plain JSON-serializable primitives
 * to prevent Next.js Server Component -> Client Component serialization errors.
 */
function serializeForClient<T>(val: T): T {
  if (val === null || val === undefined) return val;
  return JSON.parse(
    JSON.stringify(val, (_key, value) => {
      if (typeof value === 'object' && value !== null && value.isDecimal) {
        return Number(value.toString());
      }
      return value;
    })
  );
}

// ----------------------------------------------------------------------------
// 1. OPENING BALANCE ACTION
// ----------------------------------------------------------------------------
export async function createOpeningBalanceAction(params: {
  storeId: string;
  itemId: string;
  quantity: number | string;
  unitId?: string | null;
  unitCost?: number | string | null;
  remarks?: string | null;
}): Promise<ActionResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Unauthorized');
    requirePermission(user, 'inventory:opening-balance:create');

    const result = await postStockMovement({
      storeId: params.storeId,
      itemId: params.itemId,
      movementType: StockMovementType.OPENING_BALANCE,
      quantity: params.quantity,
      unitId: params.unitId,
      unitCost: params.unitCost,
      performedById: user.id,
      remarks: params.remarks || 'Initial store opening balance',
      allowNegativeStock: false,
    });

    revalidatePath('/admin/inventory');
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to post opening balance' };
  }
}

// ----------------------------------------------------------------------------
// 2. STOCK ISSUE (DEPARTMENTAL) ACTION
// ----------------------------------------------------------------------------
export async function issueStockAction(params: {
  storeId: string;
  itemId: string;
  quantity: number | string;
  unitId?: string | null;
  department?: string | null;
  remarks?: string | null;
}): Promise<ActionResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Unauthorized');
    requirePermission(user, 'inventory:stock:issue');

    const result = await postStockMovement({
      storeId: params.storeId,
      itemId: params.itemId,
      movementType: StockMovementType.STOCK_ISSUE,
      quantity: params.quantity,
      unitId: params.unitId,
      performedById: user.id,
      remarks: params.remarks || `Department Issue to [${params.department || 'General'}]`,
      allowNegativeStock: false,
    });

    revalidatePath('/admin/inventory');
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to issue stock' };
  }
}

// ----------------------------------------------------------------------------
// 3. STOCK ADJUSTMENT ACTION
// ----------------------------------------------------------------------------
export async function adjustStockAction(params: {
  storeId: string;
  itemId: string;
  direction: 'IN' | 'OUT';
  quantity: number | string;
  unitId?: string | null;
  reason: string;
}): Promise<ActionResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Unauthorized');
    requirePermission(user, 'inventory:stock:adjust');

    if (!params.reason || params.reason.trim().length === 0) {
      throw new Error('Mandatory explanation reason must be provided for stock adjustments.');
    }

    const movementType =
      params.direction === 'IN' ? StockMovementType.ADJUSTMENT_IN : StockMovementType.ADJUSTMENT_OUT;

    const result = await postStockMovement({
      storeId: params.storeId,
      itemId: params.itemId,
      movementType,
      quantity: params.quantity,
      unitId: params.unitId,
      performedById: user.id,
      remarks: `Manual Adjustment: ${params.reason}`,
      allowNegativeStock: false,
    });

    revalidatePath('/admin/inventory');
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to adjust stock' };
  }
}

// ----------------------------------------------------------------------------
// 4. WASTAGE & DAMAGE LOG ACTION
// ----------------------------------------------------------------------------
export async function logWastageDamageAction(params: {
  storeId: string;
  itemId: string;
  type: 'WASTAGE' | 'DAMAGE';
  quantity: number | string;
  unitId?: string | null;
  reason: string;
}): Promise<ActionResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Unauthorized');
    requirePermission(user, 'inventory:stock:wastage');

    const movementType =
      params.type === 'WASTAGE' ? StockMovementType.WASTAGE : StockMovementType.DAMAGE;

    const result = await postStockMovement({
      storeId: params.storeId,
      itemId: params.itemId,
      movementType,
      quantity: params.quantity,
      unitId: params.unitId,
      performedById: user.id,
      remarks: `${params.type}: ${params.reason}`,
      allowNegativeStock: false,
    });

    revalidatePath('/admin/inventory');
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to log wastage/damage' };
  }
}

// ----------------------------------------------------------------------------
// 5. INTER-STORE TRANSFER ACTIONS
// ----------------------------------------------------------------------------
export async function createStockTransferAction(params: {
  sourceStoreId: string;
  destStoreId: string;
  notes?: string | null;
  items: Array<{
    itemId: string;
    requestedQty: number | string;
    unitId?: string | null;
    notes?: string | null;
  }>;
}): Promise<ActionResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Unauthorized');
    requirePermission(user, 'inventory:stock:transfer');

    const result = await createStockTransfer({
      ...params,
      requestedById: user.id,
    });

    revalidatePath('/admin/inventory');
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create transfer' };
  }
}

export async function approveStockTransferAction(params: {
  transferId: string;
  notes?: string | null;
}): Promise<ActionResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Unauthorized');
    requirePermission(user, 'inventory:transfer:approve');

    const result = await approveStockTransfer({
      ...params,
      approvedById: user.id,
    });

    revalidatePath('/admin/inventory');
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to approve transfer' };
  }
}

export async function dispatchStockTransferAction(params: {
  transferId: string;
  notes?: string | null;
}): Promise<ActionResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Unauthorized');
    requirePermission(user, 'inventory:transfer:dispatch');

    const result = await dispatchStockTransfer({
      ...params,
      dispatchedById: user.id,
    });

    revalidatePath('/admin/inventory');
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to dispatch transfer' };
  }
}

export async function receiveStockTransferAction(params: {
  transferId: string;
  items?: Array<{
    itemId: string;
    receivedQty: number | string;
    damagedQty?: number | string;
  }>;
  notes?: string | null;
}): Promise<ActionResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Unauthorized');
    requirePermission(user, 'inventory:transfer:receive');

    const result = await receiveStockTransfer({
      ...params,
      receivedById: user.id,
    });

    revalidatePath('/admin/inventory');
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to receive transfer' };
  }
}

// ----------------------------------------------------------------------------
// 6. STOCK COUNT ACTIONS
// ----------------------------------------------------------------------------
export async function createStockCountAction(params: {
  storeId: string;
  notes?: string | null;
}): Promise<ActionResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Unauthorized');
    requirePermission(user, 'inventory:count:create');

    const result = await createStockCount({
      ...params,
      userId: user.id,
    });

    revalidatePath('/admin/inventory');
    return { success: true, data: serializeForClient(result) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to start stock count' };
  }
}

export async function recordStockCountItemsAction(params: {
  stockCountId: string;
  items: Array<{
    itemId: string;
    actualCount: number | string;
    notes?: string | null;
  }>;
}): Promise<ActionResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Unauthorized');
    requirePermission(user, 'inventory:count:create');

    const result = await recordStockCountItems({
      ...params,
      userId: user.id,
    });

    revalidatePath('/admin/inventory');
    return { success: true, data: serializeForClient(result) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to record count items' };
  }
}

export async function postStockCountAction(params: {
  stockCountId: string;
  notes?: string | null;
}): Promise<ActionResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Unauthorized');
    requirePermission(user, 'inventory:count:post');

    const result = await postStockCount({
      ...params,
      userId: user.id,
    });

    revalidatePath('/admin/inventory');
    return { success: true, data: serializeForClient(result) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to post stock count' };
  }
}

// ----------------------------------------------------------------------------
// 7. STOCK REQUEST ACTIONS
// ----------------------------------------------------------------------------
export async function createStockRequestAction(params: {
  department: string;
  sourceStoreId?: string;
  destinationStoreId?: string;
  reason?: string | null;
  submitImmediately?: boolean;
  items: Array<{
    itemId: string;
    requestedQty: number | string;
    unitId?: string | null;
    notes?: string | null;
  }>;
}): Promise<ActionResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Unauthorized');
    requirePermission(user, 'inventory:request:create');

    const result = await createStockRequest({
      ...params,
      requestedById: user.id,
    });

    revalidatePath('/admin/inventory');
    revalidatePath('/admin/inventory/requests');
    return { success: true, data: serializeForClient(result) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create stock request' };
  }
}

export async function submitStockRequestAction(requestId: string): Promise<ActionResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Unauthorized');
    requirePermission(user, 'inventory:request:create');

    const result = await submitStockRequest(requestId, user.id);

    revalidatePath('/admin/inventory');
    revalidatePath('/admin/inventory/requests');
    return { success: true, data: serializeForClient(result) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to submit stock request' };
  }
}

export async function approveStockRequestAction(params: {
  requestId: string;
  items?: Array<{
    itemId: string;
    approvedQty: number | string;
  }>;
  notes?: string | null;
}): Promise<ActionResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Unauthorized');
    requirePermission(user, 'inventory:request:approve');

    const result = await approveStockRequest({
      ...params,
      approvedById: user.id,
    });

    revalidatePath('/admin/inventory');
    revalidatePath('/admin/inventory/requests');
    return { success: true, data: serializeForClient(result) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to approve stock request' };
  }
}

export async function rejectStockRequestAction(params: {
  requestId: string;
  rejectionReason: string;
}): Promise<ActionResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Unauthorized');
    requirePermission(user, 'inventory:request:approve');

    const result = await rejectStockRequest({
      ...params,
      rejectedById: user.id,
    });

    revalidatePath('/admin/inventory');
    revalidatePath('/admin/inventory/requests');
    return { success: true, data: serializeForClient(result) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to reject stock request' };
  }
}

export async function cancelStockRequestAction(params: {
  requestId: string;
  reason?: string | null;
}): Promise<ActionResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Unauthorized');

    const result = await cancelStockRequest({
      ...params,
      cancelledById: user.id,
    });

    revalidatePath('/admin/inventory');
    revalidatePath('/admin/inventory/requests');
    return { success: true, data: serializeForClient(result) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to cancel stock request' };
  }
}

export async function issueAndTransferStockAction(params: {
  requestId: string;
  remarks?: string | null;
  items?: Array<{
    itemId: string;
    issuedQty: number | string;
    shortReason?: string | null;
  }>;
}): Promise<ActionResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Unauthorized');
    requirePermission(user, 'inventory:stock:transfer');

    const result = await executeIssueAndTransfer({
      ...params,
      performedById: user.id,
    });

    revalidatePath('/admin/inventory');
    revalidatePath('/admin/inventory/requests');
    return { success: true, data: serializeForClient(result) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to issue/transfer stock' };
  }
}

export async function getStockRequestsAction(params?: {
  department?: string;
  status?: any;
  destinationStoreId?: string;
  sourceStoreId?: string;
  take?: number;
  skip?: number;
}): Promise<ActionResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Unauthorized');
    requirePermission(user, 'inventory:read');

    const result = await getStockRequestsList(params);
    return { success: true, data: serializeForClient(result) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch stock requests' };
  }
}

export async function getStockRequestLookupDataAction(): Promise<ActionResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Unauthorized');

    const [items, stores, mainStoreStocks] = await Promise.all([
      prisma.inventoryItem.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          code: true,
          baseUnitId: true,
          baseUnit: { select: { id: true, name: true, code: true } },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.store.findMany({
        where: { isActive: true },
        select: { id: true, name: true, code: true, department: true },
        orderBy: { name: 'asc' },
      }),
      prisma.stock.findMany({
        where: { store: { code: 'STORE-MAIN' } },
        select: { itemId: true, quantityOnHand: true },
      }),
    ]);

    const centralStockMap: Record<string, string> = {};
    for (const s of mainStoreStocks) {
      centralStockMap[s.itemId] = s.quantityOnHand.toFixed(4);
    }

    return {
      success: true,
      data: {
        currentUser: {
          id: user.id,
          name: user.name,
          role: user.role,
        },
        items,
        stores,
        centralStockMap,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to load stock request lookups' };
  }
}

// ----------------------------------------------------------------------------
// 10. PHYSICAL STORE MANAGEMENT ACTIONS
// ----------------------------------------------------------------------------
export async function createStoreAction(params: {
  name: string;
  code: string;
  department: string;
}): Promise<ActionResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Unauthorized');
    requirePermission(user, 'inventory:item:manage');

    const name = params.name?.trim();
    const code = params.code?.trim().toUpperCase();
    const department = params.department?.trim();

    if (!name || !code || !department) {
      throw new Error('Name, code, and department are all required.');
    }

    const existing = await prisma.store.findUnique({ where: { code } });
    if (existing) {
      throw new Error(`Store with code "${code}" already exists.`);
    }

    const store = await prisma.store.create({
      data: {
        name,
        code,
        department,
        isActive: true,
      },
    });

    revalidatePath('/admin/inventory');
    return { success: true, data: store };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to create physical store' };
  }
}

export async function updateStoreAction(params: {
  storeId: string;
  name: string;
  department: string;
}): Promise<ActionResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Unauthorized');
    requirePermission(user, 'inventory:item:manage');

    const name = params.name?.trim();
    const department = params.department?.trim();

    if (!name || !department) {
      throw new Error('Name and department are required.');
    }

    const store = await prisma.store.update({
      where: { id: params.storeId },
      data: { name, department },
    });

    revalidatePath('/admin/inventory');
    return { success: true, data: store };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update physical store' };
  }
}

export async function toggleStoreActiveAction(storeId: string): Promise<ActionResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Unauthorized');
    requirePermission(user, 'inventory:item:manage');

    const store = await prisma.store.findUniqueOrThrow({ where: { id: storeId } });

    // If deactivating, ensure we don't deactivate Central Store
    if (store.code === 'STORE-MAIN' && store.isActive) {
      throw new Error('Central Warehouse Store (STORE-MAIN) cannot be deactivated.');
    }

    const updated = await prisma.store.update({
      where: { id: storeId },
      data: { isActive: !store.isActive },
    });

    revalidatePath('/admin/inventory');
    return { success: true, data: updated };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to toggle store status' };
  }
}

export async function deleteStoreAction(storeId: string): Promise<ActionResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Unauthorized');
    requirePermission(user, 'inventory:item:manage');

    const store = await prisma.store.findUniqueOrThrow({
      where: { id: storeId },
      include: {
        stocks: { where: { quantityOnHand: { gt: 0 } } },
        _count: {
          select: {
            movements: true,
            transfersFrom: true,
            transfersTo: true,
            stockRequestsFrom: true,
            stockRequestsTo: true,
          },
        },
      },
    });

    if (store.code === 'STORE-MAIN') {
      throw new Error('Central Warehouse Store (STORE-MAIN) cannot be deleted.');
    }

    if (store.stocks.length > 0) {
      throw new Error(`Cannot delete "${store.name}". It currently has ${store.stocks.length} item(s) with active stock.`);
    }

    const totalTransactions =
      store._count.movements +
      store._count.transfersFrom +
      store._count.transfersTo +
      store._count.stockRequestsFrom +
      store._count.stockRequestsTo;

    if (totalTransactions > 0) {
      throw new Error(
        `Cannot delete "${store.name}". It has ${totalTransactions} historical transaction records. You can deactivate it instead.`
      );
    }

    // Clean any zero-balance stock rows
    await prisma.stock.deleteMany({ where: { storeId } });

    await prisma.store.delete({ where: { id: storeId } });

    revalidatePath('/admin/inventory');
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to delete store' };
  }
}

// ----------------------------------------------------------------------------
// 11. INVENTORY OPERATIONS LOOKUP DATA (FOR QUICK ACTION MODALS)
// ----------------------------------------------------------------------------
export async function getOperationsLookupDataAction(): Promise<ActionResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Unauthorized');

    const [items, stores, allStocks] = await Promise.all([
      prisma.inventoryItem.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          code: true,
          baseUnitId: true,
          baseUnit: { select: { id: true, name: true, code: true } },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.store.findMany({
        where: { isActive: true },
        select: { id: true, name: true, code: true, department: true },
        orderBy: { name: 'asc' },
      }),
      prisma.stock.findMany({
        where: { quantityOnHand: { gt: 0 } },
        select: { storeId: true, itemId: true, quantityOnHand: true },
      }),
    ]);

    // StoreId -> ItemId -> quantityOnHand
    const stockMap: Record<string, Record<string, string>> = {};
    for (const s of allStocks) {
      if (!stockMap[s.storeId]) stockMap[s.storeId] = {};
      stockMap[s.storeId][s.itemId] = s.quantityOnHand.toFixed(4);
    }

    return {
      success: true,
      data: {
        items,
        stores,
        stockMap,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to load operations lookup data' };
  }
}

export async function performQuickStockCountAction(params: {
  storeId: string;
  itemId: string;
  actualCount: number | string;
  notes?: string | null;
}): Promise<ActionResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Unauthorized');
    requirePermission(user, 'inventory:count:create');
    requirePermission(user, 'inventory:count:post');

    // 1. Create count session
    const count = await createStockCount({
      storeId: params.storeId,
      notes: params.notes || 'Physical Stock Count Reconciliation',
      userId: user.id,
    });

    if (!count) throw new Error('Failed to initiate stock count session.');

    // 2. Record the actual physical count
    await recordStockCountItems({
      stockCountId: count.id,
      items: [{ itemId: params.itemId, actualCount: params.actualCount }],
      userId: user.id,
    });

    // 3. Post and reconcile variance into ledger
    const postRes = await postStockCount({
      stockCountId: count.id,
      userId: user.id,
      notes: params.notes || 'Physical Stock Count Reconciliation Post',
    });

    revalidatePath('/admin/inventory');
    return { success: true, data: serializeForClient(postRes) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to perform stock count reconciliation' };
  }
}
