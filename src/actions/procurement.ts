'use server';

import crypto from 'crypto';
import { getCurrentUser } from '@/lib/auth/auth';
import { requirePermission } from '@/lib/permissions/rbac';
import {
  createVendorSchema,
  updateVendorSchema,
  createPurchaseRequestSchema,
  createQuickInventoryItemSchema,
  createPurchaseOrderSchema,
  createGrnSchema,
  createPurchaseBillSchema,
  createVendorPaymentSchema,
} from '@/validations/procurement';
import {
  createVendor,
  updateVendor,
  getVendorsList,
} from '@/lib/procurement/vendor-service';
import {
  createPurchaseRequest,
  submitPurchaseRequest,
  approvePurchaseRequest,
  rejectPurchaseRequest,
  cancelPurchaseRequest,
  getPurchaseRequestsList,
} from '@/lib/procurement/purchase-request-service';
import {
  createPurchaseOrder,
  issuePurchaseOrder,
  cancelPurchaseOrder,
  getPurchaseOrdersList,
  getPurchaseOrderReconciliation,
} from '@/lib/procurement/purchase-order-service';
import {
  createAndFinalizeGrn,
  getGoodsReceiptsList,
} from '@/lib/procurement/grn-service';
import {
  createPurchaseBill,
  verifyPurchaseBill,
  getPurchaseBillsList,
} from '@/lib/procurement/purchase-bill-service';
import {
  createVendorPayment,
  getVendorPaymentsList,
  getProcurementKpis,
} from '@/lib/procurement/vendor-payment-service';
import { prisma } from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';

function serializeToPlainObject<T>(data: T): T {
  if (data === null || data === undefined) return data;
  return JSON.parse(
    JSON.stringify(data, (_key, value) => {
      if (typeof value === 'object' && value !== null && typeof value.toFixed === 'function') {
        return value.toFixed(2);
      }
      return value;
    })
  );
}

// ==========================================
// VENDOR ACTIONS
// ==========================================

export async function createVendorAction(input: unknown) {
  const user = await getCurrentUser();
  requirePermission(user, 'vendor:manage');

  const parsed = createVendorSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors };
  }

  try {
    const vendor = await createVendor(parsed.data, user!.id);
    return { success: true, vendor };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to create vendor' };
  }
}

export async function updateVendorAction(input: unknown) {
  const user = await getCurrentUser();
  requirePermission(user, 'vendor:manage');

  const parsed = updateVendorSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors };
  }

  try {
    const vendor = await updateVendor(parsed.data.vendorId, parsed.data, user!.id);
    return { success: true, vendor };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to update vendor' };
  }
}

export async function getVendorsAction(options?: { activeOnly?: boolean; search?: string }) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');

  try {
    const vendors = await getVendorsList(options);
    return { success: true, vendors };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to load vendors' };
  }
}

// ==========================================
// PURCHASE REQUEST ACTIONS
// ==========================================

export async function createPurchaseRequestAction(input: unknown) {
  const user = await getCurrentUser();
  requirePermission(user, 'procurement:request:create');

  const parsed = createPurchaseRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors };
  }

  try {
    const pr = await createPurchaseRequest({
      ...parsed.data,
      requestedById: user!.id,
    });
    return { success: true, pr };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to create purchase request' };
  }
}

export type QuickInventoryItemResult =
  | {
      success: true;
      item: {
        id: string;
        name: string;
        code: string;
        standardCost: string;
        baseUnit: {
          id: string;
          name: string;
          code: string;
        };
      };
    }
  | {
      success: false;
      error: string;
      details?: Record<string, string[]>;
    };

export async function createQuickInventoryItemAction(
  input: unknown,
  client: any = prisma,
  currentUserOverride?: any
): Promise<QuickInventoryItemResult> {
  const user = currentUserOverride !== undefined ? currentUserOverride : await getCurrentUser();
  requirePermission(user, 'inventory:item:manage');

  const parsed = createQuickInventoryItemSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors };
  }

  const { name, categoryId, unitId, standardCost } = parsed.data;
  const trimmedName = name.trim();

  try {
    const newItem = await client.$transaction(async (tx: any) => {
      // 1. Verify category exists and is active
      const category = await tx.inventoryCategory.findUnique({
        where: { id: categoryId },
      });
      if (!category || !category.isActive) {
        throw new Error('Selected category not found or inactive');
      }

      // 2. Verify base unit exists and is active
      const unit = await tx.unit.findUnique({
        where: { id: unitId },
      });
      if (!unit || !unit.isActive) {
        throw new Error('Selected unit not found or inactive');
      }

      // 3. Duplicate check by normalized name
      const existingSameName = await tx.inventoryItem.findFirst({
        where: {
          name: {
            equals: trimmedName,
            mode: 'insensitive',
          },
        },
      });
      if (existingSameName) {
        throw new Error('An inventory item with this name already exists.');
      }

      // 4. Generate unique readable code (e.g. CAT-NAME-HEX)
      const rawCategoryPrefix = (category.code || 'ITEM').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 5) || 'ITEM';
      const cleanNameSlug = trimmedName
        .replace(/[^a-zA-Z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toUpperCase()
        .slice(0, 15) || 'NEW';

      let uniqueCode = '';
      let isCodeUnique = false;
      let attempts = 0;

      while (!isCodeUnique && attempts < 10) {
        attempts++;
        const randSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
        uniqueCode = `${rawCategoryPrefix}-${cleanNameSlug}-${randSuffix}`;
        const collision = await tx.inventoryItem.findUnique({
          where: { code: uniqueCode },
        });
        if (!collision) {
          isCodeUnique = true;
        }
      }

      if (!isCodeUnique) {
        throw new Error('Failed to generate a unique code for the inventory item. Please try again.');
      }

      const costDecimal = standardCost !== undefined && standardCost !== null
        ? new Prisma.Decimal(new Prisma.Decimal(standardCost).toFixed(2))
        : new Prisma.Decimal('0.00');

      // 5. Create InventoryItem
      const created = await tx.inventoryItem.create({
        data: {
          name: trimmedName,
          code: uniqueCode,
          categoryId: category.id,
          baseUnitId: unit.id,
          standardCost: costDecimal,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          code: true,
          standardCost: true,
          baseUnit: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      });

      return created;
    });

    return {
      success: true,
      item: {
        id: newItem.id,
        name: newItem.name,
        code: newItem.code,
        standardCost: newItem.standardCost.toFixed(2),
        baseUnit: {
          id: newItem.baseUnit.id,
          name: newItem.baseUnit.name,
          code: newItem.baseUnit.code,
        },
      },
    };
  } catch (error: any) {
    if (error.code === 'P2002') {
      return { success: false, error: 'An inventory item with this code already exists. Please try again.' };
    }
    return { success: false, error: error.message || 'Failed to create inventory item' };
  }
}

export async function submitPurchaseRequestAction(requestId: string) {
  const user = await getCurrentUser();
  requirePermission(user, 'procurement:request:create');

  try {
    const pr = await submitPurchaseRequest(requestId, user!.id);
    return { success: true, pr: serializeToPlainObject(pr) };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to submit purchase request' };
  }
}

export async function approvePurchaseRequestAction(requestId: string) {
  const user = await getCurrentUser();
  // Approval requires procurement:order:create or elevated role
  requirePermission(user, 'procurement:order:create');

  try {
    const pr = await approvePurchaseRequest(requestId, user!.id);
    return { success: true, pr: serializeToPlainObject(pr) };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to approve purchase request' };
  }
}

export async function rejectPurchaseRequestAction(requestId: string, reason?: string) {
  const user = await getCurrentUser();
  requirePermission(user, 'procurement:order:create');

  try {
    const pr = await rejectPurchaseRequest(requestId, user!.id, reason);
    return { success: true, pr: serializeToPlainObject(pr) };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to reject purchase request' };
  }
}

export async function cancelPurchaseRequestAction(requestId: string) {
  const user = await getCurrentUser();
  requirePermission(user, 'procurement:request:create');

  try {
    const pr = await cancelPurchaseRequest(requestId, user!.id);
    return { success: true, pr: serializeToPlainObject(pr) };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to cancel purchase request' };
  }
}

export async function getPurchaseRequestsAction(options?: { status?: any; search?: string }) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');

  try {
    const requests = await getPurchaseRequestsList(options);
    return { success: true, requests: serializeToPlainObject(requests) };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to load purchase requests' };
  }
}

// ==========================================
// PURCHASE ORDER ACTIONS
// ==========================================

export async function createPurchaseOrderAction(input: unknown) {
  const user = await getCurrentUser();
  requirePermission(user, 'procurement:order:create');

  const parsed = createPurchaseOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors };
  }

  try {
    const po = await createPurchaseOrder({
      ...parsed.data,
      issuedById: user!.id,
    });
    return { success: true, po: serializeToPlainObject(po) };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to create purchase order' };
  }
}

export async function issuePurchaseOrderAction(poId: string) {
  const user = await getCurrentUser();
  requirePermission(user, 'procurement:order:create');

  try {
    const po = await issuePurchaseOrder(poId, user!.id);
    return { success: true, po: serializeToPlainObject(po) };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to issue purchase order' };
  }
}

export async function cancelPurchaseOrderAction(poId: string, reason?: string) {
  const user = await getCurrentUser();
  requirePermission(user, 'procurement:order:create');

  try {
    const po = await cancelPurchaseOrder(poId, user!.id, reason);
    return { success: true, po: serializeToPlainObject(po) };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to cancel purchase order' };
  }
}

export async function getPurchaseOrdersAction(options?: { status?: any; vendorId?: string; search?: string }) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');

  try {
    const orders = await getPurchaseOrdersList(options);
    return { success: true, orders: serializeToPlainObject(orders) };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to load purchase orders' };
  }
}

export async function getPurchaseOrderDetailsAction(poId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');

  try {
    const details = await getPurchaseOrderReconciliation(poId);
    return { success: true, details: serializeToPlainObject(details) };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to load purchase order reconciliation' };
  }
}

// ==========================================
// GOODS RECEIPT (GRN) ACTIONS
// ==========================================

export async function createAndFinalizeGrnAction(input: unknown) {
  const user = await getCurrentUser();
  requirePermission(user, 'procurement:grn:receive');

  const parsed = createGrnSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors };
  }

  try {
    const result = await createAndFinalizeGrn({
      ...parsed.data,
      receivedById: user!.id,
    });
    return { success: true, ...serializeToPlainObject(result) };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to finalize GRN' };
  }
}

export async function getGoodsReceiptsAction(options?: { status?: any; poId?: string; vendorId?: string; search?: string }) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');

  try {
    const receipts = await getGoodsReceiptsList(options);
    return { success: true, receipts: serializeToPlainObject(receipts) };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to load goods receipts' };
  }
}

// ==========================================
// PURCHASE BILL ACTIONS
// ==========================================

export async function createPurchaseBillAction(input: unknown) {
  const user = await getCurrentUser();
  requirePermission(user, 'procurement:bill:process');

  const parsed = createPurchaseBillSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors };
  }

  try {
    const bill = await createPurchaseBill({
      ...parsed.data,
      userId: user!.id,
    });
    return { success: true, bill: serializeToPlainObject(bill) };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to create purchase bill' };
  }
}

export async function verifyPurchaseBillAction(billId: string) {
  const user = await getCurrentUser();
  requirePermission(user, 'procurement:bill:process');

  try {
    const bill = await verifyPurchaseBill(billId, user!.id);
    return { success: true, bill: serializeToPlainObject(bill) };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to verify purchase bill' };
  }
}

export async function getPurchaseBillsAction(options?: { status?: any; vendorId?: string; search?: string }) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');

  try {
    const bills = await getPurchaseBillsList(options);
    return { success: true, bills: serializeToPlainObject(bills) };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to load purchase bills' };
  }
}

// ==========================================
// VENDOR PAYMENT ACTIONS
// ==========================================

export async function createVendorPaymentAction(input: unknown) {
  const user = await getCurrentUser();
  requirePermission(user, 'procurement:bill:process');

  const parsed = createVendorPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors };
  }

  try {
    const payment = await createVendorPayment({
      ...parsed.data,
      userId: user!.id,
    });
    return { success: true, payment: serializeToPlainObject(payment) };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to record vendor payment' };
  }
}

export async function getVendorPaymentsAction(options?: { vendorId?: string; search?: string }) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');

  try {
    const payments = await getVendorPaymentsList(options);
    return { success: true, payments: serializeToPlainObject(payments) };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to load vendor payments' };
  }
}

// ==========================================
// DASHBOARD & LOOKUP DATA
// ==========================================

export async function getProcurementDashboardDataAction() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');

  try {
    const [kpis, items, stores, vendors, categories, units] = await Promise.all([
      getProcurementKpis(),
      prisma.inventoryItem.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          code: true,
          standardCost: true,
          baseUnit: { select: { id: true, name: true, code: true } },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.store.findMany({
        where: { isActive: true },
        select: { id: true, name: true, code: true, department: true },
        orderBy: { name: 'asc' },
      }),
      prisma.vendor.findMany({
        where: { isActive: true },
        select: { id: true, name: true, companyName: true, vendorCode: true },
        orderBy: { name: 'asc' },
      }),
      prisma.inventoryCategory.findMany({
        where: { isActive: true },
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
      }),
      prisma.unit.findMany({
        where: { isActive: true },
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    return {
      success: true,
      kpis,
      items: items.map((i) => ({
        ...i,
        standardCost: i.standardCost.toFixed(2),
      })),
      stores,
      vendors,
      categories,
      units,
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to load procurement dashboard' };
  }
}
