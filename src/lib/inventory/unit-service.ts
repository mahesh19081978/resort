import { prisma } from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';

export interface UnitConversionResult {
  convertedQuantity: Prisma.Decimal;
  conversionFactor: Prisma.Decimal;
}

/**
 * Normalizes an entered transaction quantity from a source unit into the item's target base unit.
 * Uses exact Prisma.Decimal arithmetic to eliminate IEEE-754 floating-point drift.
 *
 * Rules:
 * 1. If fromUnitId === toUnitId: factor is 1.000000.
 * 2. Look up direct conversion (fromUnitId -> toUnitId): converted = entered * factor.
 * 3. Look up inverse conversion (toUnitId -> fromUnitId): converted = entered / factor.
 * 4. If no valid conversion exists: throws a descriptive error.
 */
export async function convertUnitQuantity(
  params: {
    fromUnitId: string;
    toUnitId: string;
    quantity: Prisma.Decimal | number | string;
  },
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<UnitConversionResult> {
  const { fromUnitId, toUnitId } = params;
  const qtyDecimal = new Prisma.Decimal(params.quantity);

  if (fromUnitId === toUnitId) {
    return {
      convertedQuantity: qtyDecimal,
      conversionFactor: new Prisma.Decimal(1),
    };
  }

  // 1. Check direct conversion
  const direct = await client.unitConversion.findUnique({
    where: {
      fromUnitId_toUnitId: {
        fromUnitId,
        toUnitId,
      },
    },
  });

  if (direct) {
    const factor = new Prisma.Decimal(direct.factor);
    const convertedQuantity = qtyDecimal.times(factor);
    return {
      convertedQuantity,
      conversionFactor: factor,
    };
  }

  // 2. Check inverse conversion
  const inverse = await client.unitConversion.findUnique({
    where: {
      fromUnitId_toUnitId: {
        fromUnitId: toUnitId,
        toUnitId: fromUnitId,
      },
    },
  });

  if (inverse) {
    const invFactor = new Prisma.Decimal(inverse.factor);
    if (invFactor.isZero()) {
      throw new Error(`Invalid zero conversion factor found between units ${toUnitId} and ${fromUnitId}.`);
    }
    const factor = new Prisma.Decimal(1).dividedBy(invFactor);
    const convertedQuantity = qtyDecimal.dividedBy(invFactor);
    return {
      convertedQuantity,
      conversionFactor: factor,
    };
  }

  throw new Error(
    `No unit conversion path exists from unit [${fromUnitId}] to target base unit [${toUnitId}].`
  );
}
