import { prisma } from '@/lib/db/prisma';
import { Prisma, FolioItemType } from '@prisma/client';
import { getTaxRateByCode, percentToMultiplier } from '@/lib/db/tax';

export interface PostAdHocChargeParams {
  stayId: string;
  description: string;
  amount: number;
  isTaxInclusive?: boolean;
  itemType?: FolioItemType;
}

export interface PostAdHocChargeResult {
  folioItemId: string;
  folioId: string;
  description: string;
  amount: string;
  taxAmount: string;
  totalAmount: string;
}

export async function postGuestCharge(
  params: PostAdHocChargeParams,
  userId: string
): Promise<PostAdHocChargeResult> {
  const stay = await prisma.stay.findUnique({
    where: { id: params.stayId },
    include: { folio: true },
  });

  if (!stay) throw new Error('Stay not found');
  if (stay.status !== 'ACTIVE') throw new Error('Only ACTIVE stays can have charges posted');
  if (!stay.folio) throw new Error('No folio exists for this stay');
  if (stay.folio.status !== 'OPEN') throw new Error('Cannot post charges to a closed folio');

  const baseAmount = new Prisma.Decimal(params.amount);
  const taxRatePercent = await getTaxRateByCode('GST_SVC_18');
  const taxMultiplier = percentToMultiplier(taxRatePercent);
  const taxAmount = baseAmount.mul(taxMultiplier).toDecimalPlaces(2);
  const totalAmount = params.isTaxInclusive ? baseAmount : baseAmount.plus(taxAmount);

  const itemType = params.itemType ?? FolioItemType.MISC_CHARGE;

  const folioItem = await prisma.folioItem.create({
    data: {
      folioId: stay.folio.id,
      itemType,
      description: params.description,
      quantity: 1,
      unitPrice: baseAmount,
      taxAmount,
      amount: totalAmount,
      isVoided: false,
      postedAt: new Date(),
    },
  });

  return {
    folioItemId: folioItem.id,
    folioId: stay.folio.id,
    description: params.description,
    amount: totalAmount.toFixed(2),
    taxAmount: taxAmount.toFixed(2),
    totalAmount: totalAmount.toFixed(2),
  };
}
