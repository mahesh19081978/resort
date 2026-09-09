import { prisma } from '@/lib/db/prisma';
import { Prisma, PrismaClient, TaxScope } from '@prisma/client';

export type TaxClient = PrismaClient | Prisma.TransactionClient;

/**
 * Lookup an active tax rate by its unique code from the authoritative Tax table.
 * Returns the rate as a percentage (e.g. 18.00 means 18%).
 * Throws if the tax code does not exist or is inactive.
 */
export async function getTaxRateByCode(
  code: string,
  client: TaxClient = prisma
): Promise<Prisma.Decimal> {
  const taxRecord = await client.tax.findFirst({
    where: { code, isActive: true },
  });

  if (!taxRecord) {
    throw new Error(
      `TAX_CONFIG_MISSING: Active tax configuration with code '${code}' not found in database.`
    );
  }

  return taxRecord.rate;
}

/**
 * Convert a percentage rate (e.g. 18.00) to a decimal multiplier (e.g. 0.18).
 */
export function percentToMultiplier(ratePercent: Prisma.Decimal): Prisma.Decimal {
  return ratePercent.div(new Prisma.Decimal(100));
}

export interface ResolvedTax {
  taxCode: string;
  taxRate: Prisma.Decimal;
  taxName: string;
}

/**
 * Deterministically resolves the authoritative Tax for a Service at a given transaction time.
 * 
 * Precedence and Fail-Closed Invariants:
 * 1. Explicit service.taxId:
 *    - Tax record missing      -> throws TAX_RECORD_NOT_FOUND
 *    - Tax isActive === false  -> throws TAX_CONFIG_INACTIVE
 *    - effectiveFrom > atTime  -> throws TAX_NOT_YET_EFFECTIVE
 *    - effectiveTo <= atTime   -> throws TAX_EXPIRED
 *    - NEVER falls back to scope resolution under any failure condition.
 * 
 * 2. service.taxId is null:
 *    - Queries Tax records with scope = TaxScope.SERVICE, isActive = true, and in effective period.
 *    - count === 0 -> throws TAX_CONFIG_MISSING
 *    - count > 1   -> throws TAX_CONFIG_AMBIGUOUS (no arbitrary order by / pick)
 *    - count === 1 -> returns resolved tax
 */
export async function resolveTaxForService(
  service: { id: string; name?: string; taxId?: string | null },
  atTime: Date = new Date(),
  client: TaxClient = prisma
): Promise<ResolvedTax> {
  // CASE 1: Explicit Tax Assignment on Service
  if (service.taxId) {
    const tax = await client.tax.findUnique({
      where: { id: service.taxId },
    });

    if (!tax) {
      throw new Error(
        `TAX_RECORD_NOT_FOUND: Configured tax record [${service.taxId}] for service [${service.name || service.id}] was not found.`
      );
    }

    if (!tax.isActive) {
      throw new Error(
        `TAX_CONFIG_INACTIVE: Configured tax [${tax.code}] for service [${service.name || service.id}] is currently inactive.`
      );
    }

    if (tax.effectiveFrom && tax.effectiveFrom > atTime) {
      throw new Error(
        `TAX_NOT_YET_EFFECTIVE: Configured tax [${tax.code}] is not effective until ${tax.effectiveFrom.toISOString()}.`
      );
    }

    if (tax.effectiveTo && tax.effectiveTo <= atTime) {
      throw new Error(
        `TAX_EXPIRED: Configured tax [${tax.code}] expired on ${tax.effectiveTo.toISOString()}.`
      );
    }

    return {
      taxCode: tax.code,
      taxRate: tax.rate,
      taxName: tax.name,
    };
  }

  // CASE 2: Null taxId -> Scope Fallback Strictly to TaxScope.SERVICE
  const matchingTaxes = await client.tax.findMany({
    where: {
      scope: TaxScope.SERVICE,
      isActive: true,
      AND: [
        {
          OR: [
            { effectiveFrom: null },
            { effectiveFrom: { lte: atTime } },
          ],
        },
        {
          OR: [
            { effectiveTo: null },
            { effectiveTo: { gt: atTime } },
          ],
        },
      ],
    },
  });

  if (matchingTaxes.length === 0) {
    throw new Error(
      `TAX_CONFIG_MISSING: No active, effective tax found for scope 'SERVICE' at ${atTime.toISOString()}.`
    );
  }

  if (matchingTaxes.length > 1) {
    const codes = matchingTaxes.map((t) => t.code).join(', ');
    throw new Error(
      `TAX_CONFIG_AMBIGUOUS: Multiple active taxes found for scope 'SERVICE' at ${atTime.toISOString()}: [${codes}]. Resolve tax ambiguity in settings.`
    );
  }

  const selectedTax = matchingTaxes[0];
  return {
    taxCode: selectedTax.code,
    taxRate: selectedTax.rate,
    taxName: selectedTax.name,
  };
}
