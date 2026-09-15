'use server';

import { getCurrentUser } from '@/lib/auth/auth';
import { requirePermission } from '@/lib/permissions/rbac';
import {
  createVendorSchema,
  updateVendorSchema,
  createPurchaseRequestSchema,
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

export async function submitPurchaseRequestAction(requestId: string) {
  const user = await getCurrentUser();
  requirePermission(user, 'procurement:request:create');

  try {
    const pr = await submitPurchaseRequest(requestId, user!.id);
    return { success: true, pr };
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
    return { success: true, pr };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to approve purchase request' };
  }
}

export async function rejectPurchaseRequestAction(requestId: string, reason?: string) {
  const user = await getCurrentUser();
  requirePermission(user, 'procurement:order:create');

  try {
    const pr = await rejectPurchaseRequest(requestId, user!.id, reason);
    return { success: true, pr };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to reject purchase request' };
  }
}

export async function cancelPurchaseRequestAction(requestId: string) {
  const user = await getCurrentUser();
  requirePermission(user, 'procurement:request:create');

  try {
    const pr = await cancelPurchaseRequest(requestId, user!.id);
    return { success: true, pr };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to cancel purchase request' };
  }
}

export async function getPurchaseRequestsAction(options?: { status?: any; search?: string }) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');

  try {
    const requests = await getPurchaseRequestsList(options);
    return { success: true, requests };
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
    return { success: true, po };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to create purchase order' };
  }
}

export async function issuePurchaseOrderAction(poId: string) {
  const user = await getCurrentUser();
  requirePermission(user, 'procurement:order:create');

  try {
    const po = await issuePurchaseOrder(poId, user!.id);
    return { success: true, po };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to issue purchase order' };
  }
}

export async function cancelPurchaseOrderAction(poId: string, reason?: string) {
  const user = await getCurrentUser();
  requirePermission(user, 'procurement:order:create');

  try {
    const po = await cancelPurchaseOrder(poId, user!.id, reason);
    return { success: true, po };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to cancel purchase order' };
  }
}

export async function getPurchaseOrdersAction(options?: { status?: any; vendorId?: string; search?: string }) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');

  try {
    const orders = await getPurchaseOrdersList(options);
    return { success: true, orders };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to load purchase orders' };
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
    return { success: true, ...result };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to finalize GRN' };
  }
}

export async function getGoodsReceiptsAction(options?: { status?: any; poId?: string; vendorId?: string; search?: string }) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');

  try {
    const receipts = await getGoodsReceiptsList(options);
    return { success: true, receipts };
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
    return { success: true, bill };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to create purchase bill' };
  }
}

export async function verifyPurchaseBillAction(billId: string) {
  const user = await getCurrentUser();
  requirePermission(user, 'procurement:bill:process');

  try {
    const bill = await verifyPurchaseBill(billId, user!.id);
    return { success: true, bill };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to verify purchase bill' };
  }
}

export async function getPurchaseBillsAction(options?: { status?: any; vendorId?: string; search?: string }) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');

  try {
    const bills = await getPurchaseBillsList(options);
    return { success: true, bills };
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
    return { success: true, payment };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to record vendor payment' };
  }
}

export async function getVendorPaymentsAction(options?: { vendorId?: string; search?: string }) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');

  try {
    const payments = await getVendorPaymentsList(options);
    return { success: true, payments };
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
    const [kpis, items, stores, vendors] = await Promise.all([
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
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to load procurement dashboard' };
  }
}
