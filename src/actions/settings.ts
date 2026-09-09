'use server';

import { prisma } from '@/lib/db/prisma';
import { requirePermission } from '@/lib/auth/auth';
import { recordAuditEvent } from '@/lib/auth/audit';
import { revalidatePath } from 'next/cache';
import {
  propertySettingsSchema,
  taxSchema,
  serviceChargeSchema,
  cancellationPolicySchema,
  invoiceConfigSchema,
  restaurantSettingsSchema,
} from '@/validations/settings';
import { Prisma, TaxScope } from '@prisma/client';

export type SettingsActionResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

// ============================================================================
// 1. PROPERTY & PMS SETTINGS
// ============================================================================

export async function getPropertySettingsAction(): Promise<SettingsActionResult<any>> {
  try {
    await requirePermission('settings:view');
    const property = await prisma.property.findFirst();
    if (!property) {
      return { success: false, error: 'PROPERTY_NOT_CONFIGURED: No property found.' };
    }
    return { success: true, data: property };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function updatePropertySettingsAction(
  formData: unknown
): Promise<SettingsActionResult<any>> {
  try {
    const actor = await requirePermission('settings:property:update');
    const parsed = propertySettingsSchema.parse(formData);

    const existing = await prisma.property.findFirst();
    if (!existing) {
      return { success: false, error: 'PROPERTY_NOT_CONFIGURED' };
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.property.update({
        where: { id: existing.id },
        data: {
          name: parsed.name,
          address: parsed.address,
          city: parsed.city,
          state: parsed.state,
          postalCode: parsed.postalCode,
          country: parsed.country,
          contactPhone: parsed.contactPhone,
          contactEmail: parsed.contactEmail,
          website: parsed.website || null,
          gstin: parsed.gstin || null,
          logoUrl: parsed.logoUrl || null,
          currency: parsed.currency,
          timezone: parsed.timezone,
          checkInTime: parsed.checkInTime,
          checkOutTime: parsed.checkOutTime,
        },
      });

      await recordAuditEvent(
        {
          userId: actor.id,
          action: 'PROPERTY_SETTINGS_UPDATED',
          entity: 'Property',
          entityId: existing.id,
          oldValues: {
            name: existing.name,
            website: existing.website,
            gstin: existing.gstin,
            timezone: existing.timezone,
            checkInTime: existing.checkInTime,
            checkOutTime: existing.checkOutTime,
          },
          newValues: {
            name: result.name,
            website: result.website,
            gstin: result.gstin,
            timezone: result.timezone,
            checkInTime: result.checkInTime,
            checkOutTime: result.checkOutTime,
          },
        },
        tx
      );

      return result;
    });

    revalidatePath('/admin/settings/property');
    revalidatePath('/admin/frontdesk/inhouse');
    return { success: true, data: updated };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// ============================================================================
// 2. TAX CONFIGURATION
// ============================================================================

export async function getTaxesAction(): Promise<SettingsActionResult<any>> {
  try {
    await requirePermission('settings:tax:view');
    const taxes = await prisma.tax.findMany({
      orderBy: [{ scope: 'asc' }, { code: 'asc' }],
    });
    return { success: true, data: taxes };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function saveTaxAction(input: unknown): Promise<SettingsActionResult<any>> {
  try {
    const actor = await requirePermission('settings:tax:update');
    const parsed = taxSchema.parse(input);

    const effectiveFrom = parsed.effectiveFrom ? new Date(parsed.effectiveFrom) : null;
    const effectiveTo = parsed.effectiveTo ? new Date(parsed.effectiveTo) : null;

    const saved = await prisma.$transaction(async (tx) => {
      // Overlap validation: reject if another active tax in the same scope intersects in date range
      if (parsed.isActive) {
        const existingInScope = await tx.tax.findMany({
          where: {
            scope: parsed.scope,
            isActive: true,
            id: parsed.id ? { not: parsed.id } : undefined,
          },
        });

        for (const existing of existingInScope) {
          const exFrom = existing.effectiveFrom ? existing.effectiveFrom.getTime() : -Infinity;
          const exTo = existing.effectiveTo ? existing.effectiveTo.getTime() : Infinity;
          const newFrom = effectiveFrom ? effectiveFrom.getTime() : -Infinity;
          const newTo = effectiveTo ? effectiveTo.getTime() : Infinity;

          // Check interval intersection: max(start1, start2) < min(end1, end2)
          const overlap = Math.max(exFrom, newFrom) < Math.min(exTo, newTo);
          if (overlap) {
            throw new Error(
              `TAX_SCOPE_OVERLAP: Active tax [${existing.code}] overlaps in effective dates with [${parsed.code}] for scope '${parsed.scope}'. Deactivate or adjust dates to prevent ambiguity.`
            );
          }
        }
      }

      let result;
      if (parsed.id) {
        const oldTax = await tx.tax.findUniqueOrThrow({ where: { id: parsed.id } });
        result = await tx.tax.update({
          where: { id: parsed.id },
          data: {
            name: parsed.name,
            code: parsed.code,
            rate: new Prisma.Decimal(parsed.rate.toFixed(2)),
            scope: parsed.scope,
            description: parsed.description || null,
            effectiveFrom,
            effectiveTo,
            isActive: parsed.isActive,
          },
        });

        await recordAuditEvent(
          {
            userId: actor.id,
            action: 'TAX_UPDATED',
            entity: 'Tax',
            entityId: result.id,
            oldValues: {
              code: oldTax.code,
              rate: oldTax.rate.toString(),
              scope: oldTax.scope,
              isActive: oldTax.isActive,
            },
            newValues: {
              code: result.code,
              rate: result.rate.toString(),
              scope: result.scope,
              isActive: result.isActive,
            },
          },
          tx
        );
      } else {
        result = await tx.tax.create({
          data: {
            name: parsed.name,
            code: parsed.code,
            rate: new Prisma.Decimal(parsed.rate.toFixed(2)),
            scope: parsed.scope,
            description: parsed.description || null,
            effectiveFrom,
            effectiveTo,
            isActive: parsed.isActive,
          },
        });

        await recordAuditEvent(
          {
            userId: actor.id,
            action: 'TAX_CREATED',
            entity: 'Tax',
            entityId: result.id,
            newValues: {
              code: result.code,
              rate: result.rate.toString(),
              scope: result.scope,
              isActive: result.isActive,
            },
          },
          tx
        );
      }

      return result;
    });

    revalidatePath('/admin/settings/taxes');
    return { success: true, data: saved };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function deleteTaxAction(taxId: string): Promise<SettingsActionResult<any>> {
  try {
    const actor = await requirePermission('settings:tax:update');

    await prisma.$transaction(async (tx) => {
      const tax = await tx.tax.findUniqueOrThrow({ where: { id: taxId } });

      // Referential check: reject deletion if referenced by any Service or ServiceCharge
      const serviceRef = await tx.service.count({ where: { taxId } });
      if (serviceRef > 0) {
        throw new Error(
          `TAX_REFERENCED_BY_SERVICE: Cannot delete tax [${tax.code}] because it is explicitly assigned to ${serviceRef} service(s). Reassign or deactivate instead.`
        );
      }

      const scRef = await tx.serviceCharge.count({ where: { taxId } });
      if (scRef > 0) {
        throw new Error(
          `TAX_REFERENCED_BY_SERVICE_CHARGE: Cannot delete tax [${tax.code}] because it is referenced by ${scRef} service charge(s).`
        );
      }

      await tx.tax.delete({ where: { id: taxId } });

      await recordAuditEvent(
        {
          userId: actor.id,
          action: 'TAX_DELETED',
          entity: 'Tax',
          entityId: taxId,
          oldValues: { code: tax.code, rate: tax.rate.toString(), scope: tax.scope },
        },
        tx
      );
    });

    revalidatePath('/admin/settings/taxes');
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// ============================================================================
// 3. SERVICE CHARGES
// ============================================================================

export async function getServiceChargesAction(): Promise<SettingsActionResult<any>> {
  try {
    await requirePermission('settings:charges:view');
    const charges = await prisma.serviceCharge.findMany({
      include: { tax: true },
      orderBy: [{ scope: 'asc' }, { code: 'asc' }],
    });
    return { success: true, data: charges };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function saveServiceChargeAction(input: unknown): Promise<SettingsActionResult<any>> {
  try {
    const actor = await requirePermission('settings:charges:update');
    const parsed = serviceChargeSchema.parse(input);

    const effectiveFrom = parsed.effectiveFrom ? new Date(parsed.effectiveFrom) : null;
    const effectiveTo = parsed.effectiveTo ? new Date(parsed.effectiveTo) : null;

    const saved = await prisma.$transaction(async (tx) => {
      let result;
      if (parsed.id) {
        const old = await tx.serviceCharge.findUniqueOrThrow({ where: { id: parsed.id } });
        result = await tx.serviceCharge.update({
          where: { id: parsed.id },
          data: {
            name: parsed.name,
            code: parsed.code,
            description: parsed.description || null,
            scope: parsed.scope,
            rateType: parsed.rateType,
            rateValue: new Prisma.Decimal(parsed.rateValue.toFixed(4)),
            taxable: parsed.taxable,
            taxId: parsed.taxId || null,
            effectiveFrom,
            effectiveTo,
            isActive: parsed.isActive,
          },
        });

        await recordAuditEvent(
          {
            userId: actor.id,
            action: 'SERVICE_CHARGE_UPDATED',
            entity: 'ServiceCharge',
            entityId: result.id,
            oldValues: { code: old.code, rateValue: old.rateValue.toString(), scope: old.scope },
            newValues: { code: result.code, rateValue: result.rateValue.toString(), scope: result.scope },
          },
          tx
        );
      } else {
        result = await tx.serviceCharge.create({
          data: {
            name: parsed.name,
            code: parsed.code,
            description: parsed.description || null,
            scope: parsed.scope,
            rateType: parsed.rateType,
            rateValue: new Prisma.Decimal(parsed.rateValue.toFixed(4)),
            taxable: parsed.taxable,
            taxId: parsed.taxId || null,
            effectiveFrom,
            effectiveTo,
            isActive: parsed.isActive,
          },
        });

        await recordAuditEvent(
          {
            userId: actor.id,
            action: 'SERVICE_CHARGE_CREATED',
            entity: 'ServiceCharge',
            entityId: result.id,
            newValues: { code: result.code, rateValue: result.rateValue.toString(), scope: result.scope },
          },
          tx
        );
      }
      return result;
    });

    revalidatePath('/admin/settings/charges');
    return { success: true, data: saved };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// ============================================================================
// 4. CANCELLATION POLICIES
// ============================================================================

export async function getCancellationPoliciesAction(): Promise<SettingsActionResult<any>> {
  try {
    await requirePermission('settings:cancellation:view');
    const policies = await prisma.cancellationPolicy.findMany({
      include: { ratePlan: true },
      orderBy: [{ isDefault: 'desc' }, { code: 'asc' }],
    });
    return { success: true, data: policies };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function saveCancellationPolicyAction(input: unknown): Promise<SettingsActionResult<any>> {
  try {
    const actor = await requirePermission('settings:cancellation:update');
    const parsed = cancellationPolicySchema.parse(input);

    const effectiveFrom = parsed.effectiveFrom ? new Date(parsed.effectiveFrom) : null;
    const effectiveTo = parsed.effectiveTo ? new Date(parsed.effectiveTo) : null;

    const saved = await prisma.$transaction(async (tx) => {
      // Single active default policy invariant:
      // If setting isDefault = true, deactivate isDefault on all other ratePlanId IS NULL active records
      if (parsed.isDefault && !parsed.ratePlanId) {
        await tx.cancellationPolicy.updateMany({
          where: {
            ratePlanId: null,
            isDefault: true,
            id: parsed.id ? { not: parsed.id } : undefined,
          },
          data: { isDefault: false },
        });
      }

      let result;
      if (parsed.id) {
        const old = await tx.cancellationPolicy.findUniqueOrThrow({ where: { id: parsed.id } });
        result = await tx.cancellationPolicy.update({
          where: { id: parsed.id },
          data: {
            name: parsed.name,
            code: parsed.code,
            description: parsed.description || null,
            feeType: parsed.feeType,
            feeValue: new Prisma.Decimal(parsed.feeValue.toFixed(4)),
            maxFeeAmount: parsed.maxFeeAmount != null ? new Prisma.Decimal(parsed.maxFeeAmount.toFixed(2)) : null,
            minFeeAmount: parsed.minFeeAmount != null ? new Prisma.Decimal(parsed.minFeeAmount.toFixed(2)) : null,
            hoursBeforeCheckIn: parsed.hoursBeforeCheckIn || null,
            ratePlanId: parsed.ratePlanId || null,
            isDefault: parsed.isDefault,
            effectiveFrom,
            effectiveTo,
            isActive: parsed.isActive,
          },
        });

        await recordAuditEvent(
          {
            userId: actor.id,
            action: 'CANCELLATION_POLICY_UPDATED',
            entity: 'CancellationPolicy',
            entityId: result.id,
            oldValues: { code: old.code, feeType: old.feeType, feeValue: old.feeValue.toString() },
            newValues: { code: result.code, feeType: result.feeType, feeValue: result.feeValue.toString() },
          },
          tx
        );
      } else {
        result = await tx.cancellationPolicy.create({
          data: {
            name: parsed.name,
            code: parsed.code,
            description: parsed.description || null,
            feeType: parsed.feeType,
            feeValue: new Prisma.Decimal(parsed.feeValue.toFixed(4)),
            maxFeeAmount: parsed.maxFeeAmount != null ? new Prisma.Decimal(parsed.maxFeeAmount.toFixed(2)) : null,
            minFeeAmount: parsed.minFeeAmount != null ? new Prisma.Decimal(parsed.minFeeAmount.toFixed(2)) : null,
            hoursBeforeCheckIn: parsed.hoursBeforeCheckIn || null,
            ratePlanId: parsed.ratePlanId || null,
            isDefault: parsed.isDefault,
            effectiveFrom,
            effectiveTo,
            isActive: parsed.isActive,
          },
        });

        await recordAuditEvent(
          {
            userId: actor.id,
            action: 'CANCELLATION_POLICY_CREATED',
            entity: 'CancellationPolicy',
            entityId: result.id,
            newValues: { code: result.code, feeType: result.feeType, feeValue: result.feeValue.toString() },
          },
          tx
        );
      }
      return result;
    });

    revalidatePath('/admin/settings/cancellation');
    return { success: true, data: saved };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// ============================================================================
// 5. INVOICE CONFIGURATION (SINGLETON)
// ============================================================================

export async function getInvoiceConfigAction(): Promise<SettingsActionResult<any>> {
  try {
    await requirePermission('settings:invoice:view');
    const config = await prisma.invoiceConfig.findUnique({
      where: { singletonKey: 'DEFAULT' },
    });
    if (!config) {
      return { success: false, error: 'INVOICE_CONFIG_NOT_SEEDED: Run seed-invoice-config script.' };
    }
    return { success: true, data: config };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function updateInvoiceConfigAction(input: unknown): Promise<SettingsActionResult<any>> {
  try {
    const actor = await requirePermission('settings:invoice:update');
    const parsed = invoiceConfigSchema.parse(input);

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.invoiceConfig.findUniqueOrThrow({
        where: { singletonKey: 'DEFAULT' },
      });

      const result = await tx.invoiceConfig.update({
        where: { singletonKey: 'DEFAULT' },
        data: {
          prefix: parsed.prefix,
          termsAndConditions: parsed.termsAndConditions || null,
          footerNote: parsed.footerNote || null,
          showTaxBreakdown: parsed.showTaxBreakdown,
          showPaymentHistory: parsed.showPaymentHistory,
        },
      });

      await recordAuditEvent(
        {
          userId: actor.id,
          action: 'INVOICE_CONFIG_UPDATED',
          entity: 'InvoiceConfig',
          entityId: result.id,
          oldValues: { prefix: existing.prefix, terms: existing.termsAndConditions },
          newValues: { prefix: result.prefix, terms: result.termsAndConditions },
        },
        tx
      );

      return result;
    });

    revalidatePath('/admin/settings/invoicing');
    return { success: true, data: updated };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// ============================================================================
// 6. RESTAURANT PROFILE SETTINGS
// ============================================================================

export async function getRestaurantSettingsAction(
  restaurantId?: string
): Promise<SettingsActionResult<any>> {
  try {
    await requirePermission('settings:view');
    const restaurant = restaurantId
      ? await prisma.restaurant.findUnique({ where: { id: restaurantId } })
      : await prisma.restaurant.findFirst();

    if (!restaurant) {
      return { success: false, error: 'RESTAURANT_NOT_FOUND' };
    }
    return { success: true, data: restaurant };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function updateRestaurantSettingsAction(input: unknown): Promise<SettingsActionResult<any>> {
  try {
    const actor = await requirePermission('settings:restaurant:update');
    const parsed = restaurantSettingsSchema.parse(input);

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.restaurant.findUniqueOrThrow({ where: { id: parsed.id } });

      const result = await tx.restaurant.update({
        where: { id: parsed.id },
        data: {
          name: parsed.name,
          description: parsed.description || null,
          phone: parsed.phone || null,
          email: parsed.email || null,
          openingTime: parsed.openingTime || null,
          closingTime: parsed.closingTime || null,
          isActive: parsed.isActive,
        },
      });

      await recordAuditEvent(
        {
          userId: actor.id,
          action: 'RESTAURANT_SETTINGS_UPDATED',
          entity: 'Restaurant',
          entityId: result.id,
          oldValues: { name: existing.name, phone: existing.phone, openingTime: existing.openingTime },
          newValues: { name: result.name, phone: result.phone, openingTime: result.openingTime },
        },
        tx
      );

      return result;
    });

    revalidatePath('/admin/settings/restaurant');
    return { success: true, data: updated };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}
