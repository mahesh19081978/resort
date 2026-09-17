import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/auth';
import { getPurchaseOrderDocumentHTML } from '@/lib/procurement/purchase-order-service';
import { renderHtmlToPdfBuffer } from '@/lib/pdf/render-pdf';

export async function GET(request: NextRequest) {
  try {
    // Require procurement order authority
    await requirePermission('procurement:order:create');

    const { searchParams } = new URL(request.url);
    const poId = searchParams.get('poId');
    const download = searchParams.get('download') === 'true';
    const preview = searchParams.get('preview') === 'true';

    if (!poId) {
      return NextResponse.json({ error: 'poId query parameter is required' }, { status: 400 });
    }

    const { html, data } = await getPurchaseOrderDocumentHTML(poId);

    // If print preview is explicitly requested, return the printable HTML
    if (preview) {
      return new NextResponse(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `inline; filename="${data.poNumber}.html"`,
        },
      });
    }

    // Try rendering genuine application/pdf buffer
    const pdfBuffer = await renderHtmlToPdfBuffer(html, { format: 'A4' });

    if (pdfBuffer) {
      const disposition = download ? 'attachment' : 'inline';
      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `${disposition}; filename="${data.poNumber}.pdf"`,
        },
      });
    }

    // PDF engine unavailable:
    // If user clicked Download PDF, NEVER disguise HTML as .pdf
    if (download) {
      return NextResponse.json(
        {
          error: 'PDF_ENGINE_UNAVAILABLE',
          message: 'Server PDF rendering engine is currently unavailable. Please use the [Print PO] action to save or print as PDF directly from your browser.',
        },
        { status: 503 }
      );
    }

    // Fallback for viewing/printing when preview isn't strict PDF
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="${data.poNumber}.html"`,
      },
    });
  } catch (error: any) {
    if (error?.message?.includes('UNAUTHORIZED')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error?.message?.includes('FORBIDDEN')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json(
      { error: error?.message || 'Failed to generate Purchase Order document' },
      { status: 500 }
    );
  }
}
