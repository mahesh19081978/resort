import { prisma } from '@/lib/db/prisma';
import { Prisma, PrismaClient, ServiceCharge, ServiceChargeScope, ServiceChargeRateType, Tax } from '@prisma/client';

export type ServiceChargeClient = PrismaClient | Prisma.TransactionClient;

export type ServiceChargeWithTax = ServiceCharge & {
  tax: Tax | null;
};

/**
 * Resolves active service charge for a specific scope.
 * 
 * In this phase, EXTRA_SERVICE is the only active billing consumer.
 * If multiple active rules match for the same scope, throws SERVICE_CHARGE_CONFIG_AMBIGUOUS.
 */
export async function resolveActiveServiceCharge(
  scope: ServiceChargeScope,
  atTime: Date = new Date(),
  client: ServiceChargeClient = prisma
): Promise<ServiceChargeWithTax | null> {
  const matches = await client.serviceCharge.findMany({
    where: {
      scope,
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
    include: {
      tax: true,
    },
  });

  if (matches.length === 0) {
    return null;
  }

  if (matches.length > 1) {
    const codes = matches.map((m) => m.code).join(', ');
    throw new Error(
      `SERVICE_CHARGE_CONFIG_AMBIGUOUS: Multiple active service charges found for scope '${scope}' at ${atTime.toISOString()}: [${codes}]. Resolve configuration ambiguity.`
    );
  }

  return matches[0];
}

export interface CalculateServiceChargeParams {
  unitPrice: Prisma.Decimal;
  quantity: number;
  discountAmount?: Prisma.Decimal;
  serviceCharge?: ServiceChargeWithTax | null;
  taxRatePercent: Prisma.Decimal;
}

export interface ServiceChargeCalculationResult {
  netSubtotal: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  discountedNet: Prisma.Decimal;
  serviceChargeAmount: Prisma.Decimal;
  taxBase: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  grossTotal: Prisma.Decimal;
}

/**
 * Authoritative financial calculation for extra services and charges.
 * 
 * Order of operations:
 * 1. netSubtotal = unitPrice * quantity
 * 2. discountedNet = max(0, netSubtotal - discountAmount)
 * 3. serviceCharge:
 *      PERCENTAGE   -> discountedNet * (rateValue / 100)
 *      FIXED_AMOUNT -> rateValue
 * 4. taxBase = serviceCharge.taxable ? (discountedNet + serviceCharge) : discountedNet
 * 5. taxAmount = taxBase * (taxRatePercent / 100)
 * 6. grossTotal = discountedNet + serviceCharge + taxAmount
 */
export function calculateServiceChargeFinancials(
  params: CalculateServiceChargeParams
): ServiceChargeCalculationResult {
  const qty = new Prisma.Decimal(Math.max(1, params.quantity));
  const netSubtotal = params.unitPrice.mul(qty).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_EVEN);
  
  const discount = (params.discountAmount || new Prisma.Decimal(0)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_EVEN);
  const rawDiscounted = netSubtotal.minus(discount);
  const discountedNet = rawDiscounted.isNegative() ? new Prisma.Decimal(0) : rawDiscounted;

  let serviceChargeAmount = new Prisma.Decimal(0);
  let isTaxableSC = false;

  if (params.serviceCharge && params.serviceCharge.isActive) {
    isTaxableSC = params.serviceCharge.taxable;
    if (params.serviceCharge.rateType === ServiceChargeRateType.PERCENTAGE) {
      serviceChargeAmount = discountedNet
        .mul(params.serviceCharge.rateValue)
        .div(new Prisma.Decimal(100))
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_EVEN);
    } else {
      serviceChargeAmount = params.serviceCharge.rateValue.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_EVEN);
    }
  }

  const taxBase = isTaxableSC
    ? discountedNet.plus(serviceChargeAmount)
    : discountedNet;

  const taxAmount = taxBase
    .mul(params.taxRatePercent)
    .div(new Prisma.Decimal(100))
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_EVEN);

  const grossTotal = discountedNet.plus(serviceChargeAmount).plus(taxAmount);

  return {
    netSubtotal,
    discountAmount: discount,
    discountedNet,
    serviceChargeAmount,
    taxBase,
    taxAmount,
    grossTotal,
  };
}
