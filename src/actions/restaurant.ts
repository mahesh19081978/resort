'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db/prisma';
import { requirePermission } from '@/lib/auth/auth';
import {
  openTableSessionSchema,
  closeTableSessionSchema,
  addTablesToSessionSchema,
  createOrderSchema,
  fireKOTSchema,
  updateKOTStatusSchema,
  generateBillSchema,
  recordBillPaymentSchema,
  roomChargeBillSchema,
  splitBillSchema,
} from '@/validations/restaurant';
import {
  openTableSession,
  closeTableSession,
  addTablesToSession,
} from '@/lib/restaurant/session-service';
import {
  createRestaurantOrder,
  cancelRestaurantOrder,
} from '@/lib/restaurant/order-service';
import {
  fireKOT,
  updateKOTStatus,
} from '@/lib/restaurant/kot-service';
import {
  generateRestaurantBill,
  recordBillPayment,
  postBillToRoomCharge,
  splitRestaurantBill,
} from '@/lib/restaurant/billing-service';
import { consumeKOTInventory } from '@/lib/inventory/consumption-service';

export interface ActionResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ----------------------------------------------------
// 1. OPEN TABLE SESSION
// Permission: 'restaurant:table:manage'
// ----------------------------------------------------
export async function openTableSessionAction(
  prevState: ActionResponse | null,
  formData: FormData
): Promise<ActionResponse> {
  try {
    const user = await requirePermission('restaurant:table:manage');

    const tableIdsRaw = formData.getAll('tableIds').map(String).filter(Boolean);
    const raw = {
      restaurantId: formData.get('restaurantId')?.toString() || '',
      tableIds: tableIdsRaw.length > 0 ? tableIdsRaw : [formData.get('tableId')?.toString() || ''],
      paxCount: formData.get('paxCount') ? Number(formData.get('paxCount')) : 2,
      guestName: formData.get('guestName')?.toString() || undefined,
    };

    const parsed = openTableSessionSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const result = await openTableSession({
      ...parsed.data,
      userId: user.id,
    });

    revalidatePath('/admin/restaurant');
    revalidatePath('/admin/restaurant/tables');
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to open table session',
    };
  }
}

// ----------------------------------------------------
// 2. CLOSE TABLE SESSION
// Permission: 'restaurant:table:manage'
// ----------------------------------------------------
export async function closeTableSessionAction(
  prevState: ActionResponse | null,
  formData: FormData
): Promise<ActionResponse> {
  try {
    const user = await requirePermission('restaurant:table:manage');

    const raw = {
      sessionId: formData.get('sessionId')?.toString() || '',
      force: formData.get('force') === 'true',
    };

    const parsed = closeTableSessionSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const result = await closeTableSession({
      ...parsed.data,
      userId: user.id,
    });

    revalidatePath('/admin/restaurant');
    revalidatePath('/admin/restaurant/tables');
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to close table session',
    };
  }
}

// ----------------------------------------------------
// 3. ADD TABLES TO SESSION
// Permission: 'restaurant:table:manage'
// ----------------------------------------------------
export async function addTablesToSessionAction(
  prevState: ActionResponse | null,
  formData: FormData
): Promise<ActionResponse> {
  try {
    const user = await requirePermission('restaurant:table:manage');

    const tableIds = formData.getAll('tableIds').map(String).filter(Boolean);
    const raw = {
      sessionId: formData.get('sessionId')?.toString() || '',
      tableIds,
    };

    const parsed = addTablesToSessionSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const result = await addTablesToSession({
      ...parsed.data,
      userId: user.id,
    });

    revalidatePath('/admin/restaurant');
    revalidatePath('/admin/restaurant/tables');
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add tables to session',
    };
  }
}

// ----------------------------------------------------
// 4. CREATE RESTAURANT ORDER
// Permission: 'restaurant:order:create'
// ----------------------------------------------------
export async function createRestaurantOrderAction(
  rawInput: unknown
): Promise<ActionResponse> {
  try {
    const user = await requirePermission('restaurant:order:create');

    const parsed = createOrderSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const result = await createRestaurantOrder({
      ...parsed.data,
      userId: user.id,
    });

    revalidatePath('/admin/restaurant');
    revalidatePath('/admin/restaurant/orders');
    revalidatePath('/admin/restaurant/kitchen');
    revalidatePath('/admin/restaurant/tables');
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create restaurant order',
    };
  }
}

// ----------------------------------------------------
// 5. CANCEL ORDER
// Permission: 'restaurant:order:cancel'
// ----------------------------------------------------
export async function cancelRestaurantOrderAction(
  orderId: string,
  reason?: string
): Promise<ActionResponse> {
  try {
    const user = await requirePermission('restaurant:order:cancel');

    const result = await cancelRestaurantOrder({
      orderId,
      reason,
      userId: user.id,
    });

    revalidatePath('/admin/restaurant');
    revalidatePath('/admin/restaurant/orders');
    revalidatePath('/admin/restaurant/kitchen');
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel order',
    };
  }
}

// ----------------------------------------------------
// 6. FIRE KOT
// Permission: 'restaurant:order:create'
// ----------------------------------------------------
export async function fireKOTAction(rawInput: unknown): Promise<ActionResponse> {
  try {
    const user = await requirePermission('restaurant:order:create');

    const parsed = fireKOTSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const result = await fireKOT({
      ...parsed.data,
      userId: user.id,
    });

    revalidatePath('/admin/restaurant');
    revalidatePath('/admin/restaurant/orders');
    revalidatePath('/admin/restaurant/kitchen');
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fire KOT',
    };
  }
}

// ----------------------------------------------------
// 7. UPDATE KOT STATUS (KITCHEN DISPLAY)
// Permission: 'kitchen:update_kot'
// ----------------------------------------------------
export async function updateKOTStatusAction(
  kotId: string,
  status: 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED',
  cancellationReason?: string
): Promise<ActionResponse> {
  try {
    const user = await requirePermission('kitchen:update_kot');

    const parsed = updateKOTStatusSchema.safeParse({ kotId, status, cancellationReason });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const result = await updateKOTStatus({
      ...parsed.data,
      userId: user.id,
    });

    // Phase 0.7 Hardened KOT Served-Delta Inventory Consumption
    if (status === 'SERVED') {
      try {
        await consumeKOTInventory({
          kotId,
          userId: user.id,
        });
      } catch (e) {
        console.warn('[RecipeBOM] Non-blocking KOT inventory stock consumption warning:', e);
      }
    }

    revalidatePath('/admin/restaurant');
    revalidatePath('/admin/restaurant/kitchen');
    revalidatePath('/admin/restaurant/orders');
    return {
      success: true,
      data: {
        kotId: result.kot.id,
        status: result.kot.status,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update KOT status',
    };
  }
}

// ----------------------------------------------------
// 8. GENERATE RESTAURANT BILL
// Permission: 'restaurant:bill:create'
// ----------------------------------------------------
export async function generateRestaurantBillAction(
  prevState: ActionResponse | null,
  formData: FormData
): Promise<ActionResponse> {
  try {
    const user = await requirePermission('restaurant:bill:create');

    const raw = {
      orderId: formData.get('orderId')?.toString() || '',
      discountAmount: formData.get('discountAmount')
        ? Number(formData.get('discountAmount'))
        : 0,
      discountReason: formData.get('discountReason')?.toString() || undefined,
    };

    const parsed = generateBillSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const result = await generateRestaurantBill({
      ...parsed.data,
      userId: user.id,
    });

    revalidatePath('/admin/restaurant');
    revalidatePath('/admin/restaurant/orders');
    revalidatePath('/admin/restaurant/bills');
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate restaurant bill',
    };
  }
}

// ----------------------------------------------------
// 9. RECORD BILL PAYMENT
// Permission: 'restaurant:bill:settle'
// ----------------------------------------------------
export async function recordBillPaymentAction(
  prevState: ActionResponse | null,
  formData: FormData
): Promise<ActionResponse> {
  try {
    const user = await requirePermission('restaurant:bill:settle');

    const raw = {
      billId: formData.get('billId')?.toString() || '',
      amount: formData.get('amount') ? Number(formData.get('amount')) : 0,
      method: formData.get('method')?.toString() || 'CASH',
      transactionReference: formData.get('transactionReference')?.toString() || undefined,
      notes: formData.get('notes')?.toString() || undefined,
      idempotencyKey: formData.get('idempotencyKey')?.toString() || undefined,
    };

    const parsed = recordBillPaymentSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const result = await recordBillPayment({
      ...parsed.data,
      userId: user.id,
    });

    revalidatePath('/admin/restaurant');
    revalidatePath('/admin/restaurant/bills');
    revalidatePath('/admin/restaurant/orders');
    revalidatePath('/admin/restaurant/tables');
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to record bill payment',
    };
  }
}

// ----------------------------------------------------
// 10. POST BILL TO GUEST ROOM CHARGE
// Permission: 'restaurant:room-charge'
// ----------------------------------------------------
export async function postBillToRoomChargeAction(
  prevState: ActionResponse | null,
  formData: FormData
): Promise<ActionResponse> {
  try {
    const user = await requirePermission('restaurant:room-charge');

    const raw = {
      billId: formData.get('billId')?.toString() || '',
      stayId: formData.get('stayId')?.toString() || '',
      roomId: formData.get('roomId')?.toString() || '',
      notes: formData.get('notes')?.toString() || undefined,
    };

    const parsed = roomChargeBillSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const result = await postBillToRoomCharge({
      ...parsed.data,
      userId: user.id,
    });

    revalidatePath('/admin/restaurant');
    revalidatePath('/admin/restaurant/bills');
    revalidatePath('/admin/restaurant/orders');
    revalidatePath('/admin/frontdesk');
    revalidatePath('/admin/folios');
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to charge bill to guest room',
    };
  }
}

// ----------------------------------------------------
// 11. SPLIT RESTAURANT BILL
// Permission: 'restaurant:bill:create'
// ----------------------------------------------------
export async function splitRestaurantBillAction(
  rawInput: unknown
): Promise<ActionResponse> {
  try {
    const user = await requirePermission('restaurant:bill:create');

    const parsed = splitBillSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const result = await splitRestaurantBill({
      ...parsed.data,
      userId: user.id,
    });

    revalidatePath('/admin/restaurant');
    revalidatePath('/admin/restaurant/bills');
    revalidatePath('/admin/restaurant/orders');
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to split restaurant bill',
    };
  }
}
