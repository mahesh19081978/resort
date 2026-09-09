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

    const folioItem = await tx.folioItem.create({
      data: {
        folioId: stay.folio.id,
        itemType,
        description: params.description || service.name,
        quantity,
        unitPrice,
        taxAmount,
        amount: totalAmount,
      },
    });

    const folio = stay.folio;
    const newCharges = folio.totalCharges.plus(totalAmount);
    const newBalance = folio.totalBalance.plus(totalAmount);

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
