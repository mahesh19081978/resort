import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requirePermission } from '@/lib/auth/auth';
import { resolveTaxForService } from '@/lib/db/tax';
import { z } from 'zod';

export async function GET(request: NextRequest) {
  try {
    // 1. Authorization: strictly requires folio:charge:post (same as posting a charge)
    await requirePermission('folio:charge:post');

    // 2. Validate serviceId parameter
    const { searchParams } = new URL(request.url);
    const serviceId = searchParams.get('serviceId');
    const parsedId = z.string().cuid('Invalid service ID').safeParse(serviceId);

    if (!parsedId.success) {
      return NextResponse.json(
        { error: 'Invalid or missing serviceId parameter' },
        { status: 400 }
      );
    }

    const service = await prisma.service.findUnique({
      where: { id: parsedId.data },
      select: { id: true, name: true, taxId: true, isChargeable: true, isActive: true },
    });

    if (!service) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 });
    }

    // 3. Resolve tax deterministically
    const resolved = await resolveTaxForService(service, new Date(), prisma);

    return NextResponse.json({
      taxCode: resolved.taxCode,
      taxName: resolved.taxName,
      taxRate: resolved.taxRate.toString(),
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
