import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';
import { requirePermission } from '@/lib/auth/auth';
import { resolveTaxForService } from '@/lib/db/tax';
import { resolveActiveServiceCharge, calculateServiceChargeFinancials } from '@/lib/db/service-charge';
import { ServiceChargeScope } from '@prisma/client';
import { z } from 'zod';

export async function GET(request: NextRequest) {
  try {
    await requirePermission('folio:charge:post');

    const { searchParams } = new URL(request.url);
    const serviceId = searchParams.get('serviceId');
    const quantity = parseInt(searchParams.get('quantity') || '1', 10);
    const unitPriceParam = searchParams.get('unitPrice');

    const parsedId = z.string().cuid('Invalid service ID').safeParse(serviceId);
    if (!parsedId.success) {
      return NextResponse.json(
        { error: 'Invalid or missing serviceId parameter' },
        { status: 400 }
      );
    }

    const service = await prisma.service.findUnique({
      where: { id: parsedId.data },
      select: { id: true, name: true, taxId: true, basePrice: true, isChargeable: true, isActive: true },
    });

    if (!service) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 });
    }

    const now = new Date();
    const resolvedTax = await resolveTaxForService(service, now, prisma);
    const activeServiceCharge = await resolveActiveServiceCharge(ServiceChargeScope.EXTRA_SERVICE, now, prisma);

    const effectiveUnitPrice = unitPriceParam
      ? parseFloat(unitPriceParam)
      : parseFloat(service.basePrice.toString());

    const financials = calculateServiceChargeFinancials({
      unitPrice: new Prisma.Decimal(effectiveUnitPrice.toFixed(2)),
      quantity: Math.max(1, quantity),
      serviceCharge: activeServiceCharge,
      taxRatePercent: resolvedTax.taxRate,
    });

    return NextResponse.json({
      taxCode: resolvedTax.taxCode,
      taxName: resolvedTax.taxName,
      taxRate: resolvedTax.taxRate.toString(),
      serviceChargeAmount: financials.serviceChargeAmount.toFixed(2),
      taxAmount: financials.taxAmount.toFixed(2),
      grossTotal: financials.grossTotal.toFixed(2),
      netSubtotal: financials.netSubtotal.toFixed(2),
      previewOnly: true,
    });
  } catch (error) {
    const message = (error as Error).message;
    const isAuthError = message.startsWith('UNAUTHORIZED') || message.startsWith('FORBIDDEN');
    return NextResponse.json(
      { error: message },
      { status: isAuthError ? 403 : 400 }
    );
  }
}
