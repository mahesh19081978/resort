import { prisma } from '@/lib/db/prisma';
import { Prisma, StockMovementType } from '@prisma/client';
import { recordAuditEvent } from '@/lib/auth/audit';

export interface DeductOrderInventoryParams {
  orderId: string;
  storeId?: string;
  userId?: string | null;
}

/**
 * @deprecated Phase 0.6 defect replaced in Phase 0.7 by `consumeKOTInventory()` in `@/lib/inventory/consumption-service`.
 * This method is permanently disabled to prevent duplicate whole-order stock consumption.
 */
export async function deductOrderRecipeStock(
  _params: DeductOrderInventoryParams,
  _client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<never> {
  throw new Error(
    'FATAL: deductOrderRecipeStock() is permanently deprecated and disabled in Phase 0.7. Use consumeKOTInventory() instead.'
  );
}

