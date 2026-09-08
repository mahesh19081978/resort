import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser, hasPermission } from '@/lib/auth/auth';
import { recordAuditEvent } from '@/lib/auth/audit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (!hasPermission(user, 'guest:view_sensitive')) {
      return NextResponse.json({ error: 'Forbidden: Missing guest:view_sensitive permission' }, { status: 403 });
    }

    const { documentId } = await params;

    const doc = await prisma.guestDocument.findUnique({
      where: { id: documentId },
    });

    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    if (!doc.fileDataBase64) {
      return NextResponse.json({ error: 'Document data not available' }, { status: 404 });
    }

    await recordAuditEvent({
      userId: user.id,
      action: 'GUEST_SENSITIVE_DOC_VIEWED',
      entity: 'GuestDocument',
      entityId: doc.id,
      newValues: {
        guestId: doc.guestId,
        documentType: doc.documentType,
      },
    });

    const mimeType = doc.mimeType || 'application/octet-stream';
    const buffer = Buffer.from(doc.fileDataBase64, 'base64');

    const contentDisposition = mimeType.startsWith('image/')
      ? `inline; filename="${doc.fileName}"`
      : `inline; filename="${doc.fileName}"`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': buffer.length.toString(),
        'Content-Disposition': contentDisposition,
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('[SECURE_DOCUMENT_ERROR]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
