import { prisma } from '@/lib/db/prisma';
import { Prisma, StockMovementType } from '@prisma/client';
import { postStockMovement } from '@/lib/inventory/stock-ledger-service';
import { createStockTransfer, dispatchStockTransfer, receiveStockTransfer } from '@/lib/inventory/transfer-service';
import { createStockCount, recordStockCountItems, postStockCount } from '@/lib/inventory/count-service';
import { requirePermission } from '@/lib/permissions/rbac';
import { getCurrentUser } from '@/lib/auth/auth';
import { revalidatePath } from 'next/cache';

export interface ActionResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
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

export async function dispatchStockTransferAction(params: {
  transferId: string;
  notes?: string | null;
}): Promise<ActionResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Unauthorized');
    requirePermission(user, 'inventory:stock:transfer');

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
    requirePermission(user, 'inventory:stock:transfer');

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
    return { success: true, data: result };
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
    return { success: true, data: result };
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
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to post stock count' };
  }
}
