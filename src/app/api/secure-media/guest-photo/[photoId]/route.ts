import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser, hasPermission } from '@/lib/auth/auth';
import { recordAuditEvent } from '@/lib/auth/audit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ photoId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (!hasPermission(user, 'guest:view_sensitive')) {
      return NextResponse.json({ error: 'Forbidden: Missing guest:view_sensitive permission' }, { status: 403 });
    }

    const { photoId } = await params;

    const photo = await prisma.guestPhoto.findUnique({
      where: { id: photoId },
    });

    if (!photo) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }

    if (!photo.fileDataBase64) {
      return NextResponse.json({ error: 'Photo data not available' }, { status: 404 });
    }

    await recordAuditEvent({
      userId: user.id,
      action: 'GUEST_PHOTO_VIEWED',
      entity: 'GuestPhoto',
      entityId: photo.id,
      newValues: {
        guestId: photo.guestId,
      },
    });

    const mimeType = photo.mimeType || 'image/jpeg';
    const buffer = Buffer.from(photo.fileDataBase64, 'base64');

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('[SECURE_PHOTO_ERROR]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
