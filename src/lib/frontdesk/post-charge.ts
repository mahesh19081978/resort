import { prisma } from '@/lib/db/prisma';
import { Prisma, PrismaClient, FolioItemType, ServiceChargeScope } from '@prisma/client';
import { recordAuditEvent } from '@/lib/auth/audit';
import { resolveTaxForService } from '@/lib/db/tax';
import { resolveActiveServiceCharge, calculateServiceChargeFinancials } from '@/lib/db/service-charge';

export type PostChargeDatabaseClient = PrismaClient | Prisma.TransactionClient;

function hasTransaction(client: PostChargeDatabaseClient): client is PrismaClient {
  return '$transaction' in client && typeof (client as PrismaClient).$transaction === 'function';
}

export interface PostServiceChargeParams {
  stayId: string;
  serviceId: string;
  description: string;
  quantity: number;
  unitPrice?: number;
  notes?: string;
  idempotencyKey?: string;
}

export interface PostChargeResult {
  folioItemId: string;
  folioId: string;
  folioNumber: string;
  description: string;
  quantity: number;
  unitPrice: string;
  taxAmount: string;
  totalAmount: string;
  itemType: string;
  taxCode: string;
  taxName: string;
}

function resolveFolioItemType(serviceName: string): FolioItemType {
  const name = serviceName.toLowerCase();
  if (name.includes('laundry')) return FolioItemType.LAUNDRY_CHARGE;
  if (name.includes('restaurant') || name.includes('food') || name.includes('beverage') || name.includes('minibar')) return FolioItemType.RESTAURANT_CHARGE;
  if (name.includes('room service')) return FolioItemType.ROOM_SERVICE_CHARGE;
  if (name.includes('spa') || name.includes('transfer') || name.includes('parking')) return FolioItemType.EXTRA_SERVICE_CHARGE;
  if (name.includes('damage') || name.includes('repair')) return FolioItemType.DAMAGE_FEE;
  return FolioItemType.EXTRA_SERVICE_CHARGE;
}

export async function executePostServiceCharge(
  params: PostServiceChargeParams,
  actor: { id: string; name?: string; role: string },
  db: PostChargeDatabaseClient = prisma
): Promise<PostChargeResult> {
  const runner = async (tx: Prisma.TransactionClient): Promise<PostChargeResult> => {
    const stay = await tx.stay.findUnique({
      where: { id: params.stayId },
      include: {
        folio: true,
      },
    });

    if (!stay) {
      throw new Error('STAY_NOT_FOUND: Stay does not exist.');
    }
    if (stay.status !== 'ACTIVE') {
      throw new Error('STAY_NOT_ACTIVE: Only ACTIVE stays can have charges posted.');
    }
    if (!stay.folio) {
      throw new Error('FOLIO_NOT_FOUND: No folio exists for this stay.');
    }
    if (stay.folio.status !== 'OPEN') {
      throw new Error('FOLIO_NOT_OPEN: Cannot post charges to a ' + stay.folio.status + ' folio.');
    }

    const service = await tx.service.findUnique({
      where: { id: params.serviceId },
    });
    if (!service) {
      throw new Error('SERVICE_NOT_FOUND: Service does not exist.');
    }
    if (!service.isChargeable) {
      throw new Error('SERVICE_NOT_CHARGEABLE: This service cannot be posted as a folio charge.');
    }

    const quantity = Math.max(1, Math.floor(params.quantity));

    const serviceUnitPrice = new Prisma.Decimal(service.basePrice.toString());
    const unitPrice = params.unitPrice != null
      ? new Prisma.Decimal(Math.max(0, params.unitPrice).toFixed(2))
      : serviceUnitPrice;

    // 1. Authoritative deterministic tax resolution (NO hardcoded rates or codes)
    const now = new Date();
    const resolvedTax = await resolveTaxForService(service, now, tx);

    // 2. Resolve active service charge for EXTRA_SERVICE scope
    const activeServiceCharge = await resolveActiveServiceCharge(ServiceChargeScope.EXTRA_SERVICE, now, tx);

    // 3. Compute financials deterministically
    const financials = calculateServiceChargeFinancials({
      unitPrice,
      quantity,
      serviceCharge: activeServiceCharge,
      taxRatePercent: resolvedTax.taxRate,
    });

    const taxAmount = financials.taxAmount;
    const totalAmount = financials.grossTotal;

    const itemType = resolveFolioItemType(service.name);

    // Idempotency: if key provided, check for existing charge
    let idempotencyKey: string | null = null;
    if (params.idempotencyKey) {
      idempotencyKey = params.idempotencyKey;
      const existing = await tx.folioItem.findUnique({
        where: { idempotencyKey },
      });

      if (existing) {
        if (
          existing.folioId !== stay.folio.id ||
          !existing.unitPrice.equals(unitPrice) ||
          existing.quantity !== quantity ||
          existing.description !== (params.description || service.name)
        ) {
          throw new Error(
            `IDEMPOTENCY_KEY_REUSE_CONFLICT: Idempotency key '${idempotencyKey}' was previously used for a materially different charge.`
          );
        }
        return {
          folioItemId: existing.id,
          folioId: stay.folio.id,
          folioNumber: stay.folio.folioNumber,
          description: existing.description,
          quantity: existing.quantity,
          unitPrice: existing.unitPrice.toFixed(2),
          taxAmount: existing.taxAmount.toFixed(2),
          totalAmount: existing.amount.toFixed(2),
          itemType: existing.itemType,
          taxCode: resolvedTax.taxCode,
          taxName: resolvedTax.taxName,
        };
      }
    }

    let folioItem;
    try {
      folioItem = await tx.folioItem.create({
        data: {
          folioId: stay.folio.id,
          itemType,
          description: params.description || service.name,
          quantity,
          unitPrice,
          taxAmount,
          amount: totalAmount,
          idempotencyKey,
        },
      });
    } catch (err: unknown) {
      // P2002 = unique constraint violation (race: concurrent request inserted first)
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
        const raceExisting = await tx.folioItem.findUnique({
          where: { idempotencyKey: idempotencyKey! },
        });
        if (raceExisting) {
          if (
            raceExisting.folioId !== stay.folio.id ||
            !raceExisting.unitPrice.equals(unitPrice) ||
            raceExisting.quantity !== quantity ||
            raceExisting.description !== (params.description || service.name)
          ) {
            throw new Error(
              `IDEMPOTENCY_KEY_REUSE_CONFLICT: Idempotency key '${idempotencyKey}' was previously used for a materially different charge.`
            );
          }
          return {
            folioItemId: raceExisting.id,
            folioId: stay.folio.id,
            folioNumber: stay.folio.folioNumber,
            description: raceExisting.description,
            quantity: raceExisting.quantity,
            unitPrice: raceExisting.unitPrice.toFixed(2),
            taxAmount: raceExisting.taxAmount.toFixed(2),
            totalAmount: raceExisting.amount.toFixed(2),
            itemType: raceExisting.itemType,
            taxCode: resolvedTax.taxCode,
            taxName: resolvedTax.taxName,
          };
        }
      }
      throw err;
    }

    const folio = stay.folio;

    // CRITICAL: Lock the folio row BEFORE reading totals to prevent lost-update
    // corruption under concurrent transactions. Without this, two concurrent
    // charges can both read the same stale total and overwrite each other.
    const lockedRows = await tx.$queryRaw<
      { id: string; totalCharges: unknown; totalBalance: unknown }[]
    >`SELECT "id", "totalCharges", "totalBalance" FROM "Folio" WHERE "id" = ${folio.id} FOR UPDATE`;

    if (!lockedRows || lockedRows.length === 0) {
      throw new Error('FOLIO_NOT_FOUND: Folio disappeared during lock acquisition.');
    }

    const lockedFolio = lockedRows[0];
    const currentTotalCharges = new Prisma.Decimal(String(lockedFolio.totalCharges));
    const currentTotalBalance = new Prisma.Decimal(String(lockedFolio.totalBalance));

    const newCharges = currentTotalCharges.plus(totalAmount);
    const newBalance = currentTotalBalance.plus(totalAmount);

    await tx.folio.update({
      where: { id: folio.id },
      data: {
        totalCharges: newCharges,
        totalBalance: newBalance,
      },
    });

    await recordAuditEvent(
      {
        userId: actor.id,
        action: 'FOLIO_CHARGE_POSTED',
        entity: 'FolioItem',
        entityId: folioItem.id,
        newValues: {
          stayId: params.stayId,
          folioId: folio.id,
          folioNumber: folio.folioNumber,
          serviceId: params.serviceId,
          serviceName: service.name,
          serviceCode: service.code,
          description: params.description || service.name,
          quantity,
          unitPrice: unitPrice.toString(),
          taxCode: resolvedTax.taxCode,
          taxRate: resolvedTax.taxRate.toString(),
          taxAmount: taxAmount.toString(),
          totalAmount: totalAmount.toString(),
          itemType,
          notes: params.notes || null,
        },
      },
      tx
    );

    return {
      folioItemId: folioItem.id,
      folioId: folio.id,
      folioNumber: folio.folioNumber,
      description: params.description || service.name,
      quantity,
      unitPrice: unitPrice.toFixed(2),
      taxAmount: taxAmount.toFixed(2),
      totalAmount: totalAmount.toFixed(2),
      itemType,
      taxCode: resolvedTax.taxCode,
      taxName: resolvedTax.taxName,
    };
  };

  if (hasTransaction(db)) {
    return await db.$transaction(runner, {
      timeout: 30000,
      maxWait: 10000,
    });
  }
  return await runner(db);
}
