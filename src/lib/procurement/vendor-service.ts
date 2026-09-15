import { prisma } from '@/lib/db/prisma';
import { generateInventoryNumber } from '@/lib/inventory/numbers';
import { Prisma } from '@prisma/client';

export interface CreateVendorInput {
  name: string;
  companyName: string;
  contactPerson?: string;
  phone: string;
  email?: string;
  address?: string;
  gstin?: string;
  pan?: string;
  paymentTermsDays?: number;
  bankName?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
}

import { recordAuditEvent } from '@/lib/auth/audit';

function maskAccountNumber(acc?: string | null): string | null {
  if (!acc) return null;
  const trimmed = acc.trim();
  if (trimmed.length <= 4) return '****';
  return `****${trimmed.slice(-4)}`;
}

export interface UpdateVendorInput extends Partial<CreateVendorInput> {
  isActive?: boolean;
  userId?: string | null;
}

export async function createVendor(data: CreateVendorInput, userId?: string | null) {
  const vendorCode = generateInventoryNumber('VND');

  const vendor = await prisma.vendor.create({
    data: {
      vendorCode,
      name: data.name.trim(),
      companyName: data.companyName.trim(),
      contactPerson: data.contactPerson?.trim() || null,
      phone: data.phone.trim(),
      email: data.email?.trim() || null,
      address: data.address?.trim() || null,
      gstin: data.gstin?.trim() || null,
      pan: data.pan?.trim() || null,
      paymentTermsDays: data.paymentTermsDays ?? 30,
      bankName: data.bankName?.trim() || null,
      bankAccountNumber: data.bankAccountNumber?.trim() || null,
      bankIfsc: data.bankIfsc?.trim() || null,
      isActive: true,
    },
  });

  await recordAuditEvent({
    userId,
    action: 'VENDOR_CREATED',
    entity: 'Vendor',
    entityId: vendor.id,
    newValues: {
      vendorCode: vendor.vendorCode,
      name: vendor.name,
      companyName: vendor.companyName,
      phone: vendor.phone,
      gstin: vendor.gstin,
      bankName: vendor.bankName,
      bankAccountNumber: maskAccountNumber(vendor.bankAccountNumber),
    },
  });

  return vendor;
}

export async function updateVendor(vendorId: string, data: UpdateVendorInput, userId?: string | null) {
  const existing = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!existing) {
    throw new Error(`Vendor [${vendorId}] not found.`);
  }

  const updated = await prisma.vendor.update({
    where: { id: vendorId },
    data: {
      name: data.name !== undefined ? data.name.trim() : undefined,
      companyName: data.companyName !== undefined ? data.companyName.trim() : undefined,
      contactPerson: data.contactPerson !== undefined ? data.contactPerson?.trim() || null : undefined,
      phone: data.phone !== undefined ? data.phone.trim() : undefined,
      email: data.email !== undefined ? data.email?.trim() || null : undefined,
      address: data.address !== undefined ? data.address?.trim() || null : undefined,
      gstin: data.gstin !== undefined ? data.gstin?.trim() || null : undefined,
      pan: data.pan !== undefined ? data.pan?.trim() || null : undefined,
      paymentTermsDays: data.paymentTermsDays !== undefined ? data.paymentTermsDays : undefined,
      bankName: data.bankName !== undefined ? data.bankName?.trim() || null : undefined,
      bankAccountNumber: data.bankAccountNumber !== undefined ? data.bankAccountNumber?.trim() || null : undefined,
      bankIfsc: data.bankIfsc !== undefined ? data.bankIfsc?.trim() || null : undefined,
      isActive: data.isActive !== undefined ? data.isActive : undefined,
    },
  });

  await recordAuditEvent({
    userId: userId || data.userId,
    action: 'VENDOR_UPDATED',
    entity: 'Vendor',
    entityId: updated.id,
    oldValues: {
      name: existing.name,
      isActive: existing.isActive,
      bankName: existing.bankName,
      bankAccountNumber: maskAccountNumber(existing.bankAccountNumber),
    },
    newValues: {
      name: updated.name,
      isActive: updated.isActive,
      bankName: updated.bankName,
      bankAccountNumber: maskAccountNumber(updated.bankAccountNumber),
    },
  });

  return updated;
}

export async function getVendorsList(options?: { activeOnly?: boolean; search?: string }) {
  const where: Prisma.VendorWhereInput = {};
  if (options?.activeOnly) {
    where.isActive = true;
  }
  if (options?.search) {
    const q = options.search.trim();
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { companyName: { contains: q, mode: 'insensitive' } },
      { vendorCode: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q } },
      { gstin: { contains: q, mode: 'insensitive' } },
    ];
  }

  const vendors = await prisma.vendor.findMany({
    where,
    orderBy: { name: 'asc' },
    include: {
      _count: {
        select: {
          purchaseOrders: true,
          purchaseBills: true,
          goodsReceipts: true,
        },
      },
      purchaseBills: {
        select: {
          totalAmount: true,
          paidAmount: true,
          balanceDue: true,
          status: true,
        },
      },
    },
  });

  return vendors.map((v) => {
    let totalBilled = new Prisma.Decimal(0);
    let totalPaid = new Prisma.Decimal(0);
    let totalOutstanding = new Prisma.Decimal(0);

    for (const b of v.purchaseBills) {
      if (b.status !== 'CANCELLED') {
        totalBilled = totalBilled.plus(b.totalAmount);
        totalPaid = totalPaid.plus(b.paidAmount);
        totalOutstanding = totalOutstanding.plus(b.balanceDue);
      }
    }

    return {
      id: v.id,
      vendorCode: v.vendorCode,
      name: v.name,
      companyName: v.companyName,
      contactPerson: v.contactPerson,
      phone: v.phone,
      email: v.email,
      address: v.address,
      gstin: v.gstin,
      pan: v.pan,
      paymentTermsDays: v.paymentTermsDays,
      bankName: v.bankName,
      bankAccountNumber: v.bankAccountNumber,
      bankIfsc: v.bankIfsc,
      isActive: v.isActive,
      counts: v._count,
      totalBilled: totalBilled.toFixed(2),
      totalPaid: totalPaid.toFixed(2),
      totalOutstanding: totalOutstanding.toFixed(2),
    };
  });
}
