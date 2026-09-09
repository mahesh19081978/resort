import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/auth';
import { getStayBillData } from '@/lib/frontdesk/bill';
import { generateBillHTML } from '@/lib/frontdesk/pdf-template';

export async function GET(request: NextRequest) {
  try {
    await requirePermission('folio:read');

    const { searchParams } = new URL(request.url);
    const stayId = searchParams.get('stayId');
    const type = (searchParams.get('type') || 'full') as 'full' | 'room' | 'other';

    if (!stayId) {
      return NextResponse.json({ error: 'stayId is required' }, { status: 400 });
    }

    const bill = await getStayBillData(stayId);
    if (!bill) {
      return NextResponse.json({ error: 'Bill data not found' }, { status: 404 });
    }

    const html = generateBillHTML(bill, type);

    const chromePath = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;

    if (chromePath) {
      const puppeteer = await import('puppeteer-core');
      const browser = await puppeteer.default.launch({
        executablePath: chromePath,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'domcontentloaded' });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' },
      });

      await browser.close();

      const title = type === 'room' ? 'RoomBill' : type === 'other' ? 'OtherCharges' : 'GuestFolio';
      const filename = `${bill.stayNumber}_${bill.folioNumber}_${title}.pdf`;

      return new NextResponse(Buffer.from(pdfBuffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${filename}"`,
        },
      });
    }

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="${bill.stayNumber}_${bill.folioNumber}_${type}.html"`,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNAUTHORIZED')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.includes('FORBIDDEN')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate PDF' },
      { status: 500 }
    );
  }
}
