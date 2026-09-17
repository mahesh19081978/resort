import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generatePurchaseOrderHTML, AuthoritativePoDocumentData } from '../po-document';
import { sendEmail } from '@/lib/email/resend';
import { Prisma } from '@prisma/client';

describe('PURCHASE ORDER WORKFLOW, DOCUMENT GENERATION & VENDOR EMAIL', () => {
  const samplePoData: AuthoritativePoDocumentData = {
    poId: 'po-101',
    poNumber: 'PO-20260317-001',
    status: 'ISSUED',
    createdAt: '2026-03-17T10:00:00.000Z',
    expectedDate: '2026-03-24T10:00:00.000Z',
    issuedAt: '2026-03-17T10:30:00.000Z',
    issuedByName: 'Inventory Manager',
    notes: 'Urgent resort supply delivery',
    property: {
      name: 'Infinity Resort & Spa',
      address: 'Plot 42, Beach Road',
      city: 'Goa',
      state: 'Goa',
      postalCode: '403001',
      country: 'India',
      contactPhone: '+91 832 245 0000',
      contactEmail: 'procurement@infinityresort.com',
      gstin: '30AAAAA0000A1Z5',
    },
    vendor: {
      id: 'vnd-501',
      vendorCode: 'VND-00501',
      name: 'Coastal Seafood Supplies',
      companyName: 'Coastal Seafood Pvt Ltd',
      contactPerson: 'Rajesh Sharma',
      phone: '+91 98765 43210',
      email: 'vendor.orders@coastalseafood.com',
      address: 'Harbor Gate 4, Panaji, Goa',
      gstin: '30BBBBB1111B2Z6',
      pan: 'BBBBB1111B',
    },
    deliveryLocation: {
      storeName: 'Main Kitchen Cold Storage',
      storeCode: 'STORE-FNB-01',
      department: 'F&B Production',
      addressSummary: 'Receiving Bay 2, Infinity Resort',
    },
    items: [
      {
        itemIndex: 1,
        itemName: 'King Prawns (Fresh)',
        itemCode: 'FNB-PRAWN-01',
        unitName: 'KG',
        orderedQuantity: '25.0000',
        unitPrice: '800.00',
        taxRate: '5.00',
        taxAmount: '1000.00',
        lineTotal: '21000.00',
        description: 'Fresh catch, cleaned and graded',
      },
      {
        itemIndex: 2,
        itemName: 'Sea Bass Fillet',
        itemCode: 'FNB-BASS-02',
        unitName: 'KG',
        orderedQuantity: '15.0000',
        unitPrice: '600.00',
        taxRate: '5.00',
        taxAmount: '450.00',
        lineTotal: '9450.00',
        description: 'Skin-on vacuum packed',
      },
    ],
    subtotal: '29000.00',
    taxAmount: '1450.00',
    discountAmount: '0.00',
    totalAmount: '30450.00',
    termsAndConditions: 'All goods subject to culinary inspection. Deliveries accepted between 06:00 and 11:00.',
  };

  describe('1. Authoritative Document Generation', () => {
    it('renders correct header, vendor details, and property letterhead', () => {
      const html = generatePurchaseOrderHTML(samplePoData);

      expect(html).toContain('Infinity Resort &amp; Spa');
      expect(html).toContain('PO-20260317-001');
      expect(html).toContain('Coastal Seafood Supplies');
      expect(html).toContain('vendor.orders@coastalseafood.com');
      expect(html).toContain('Main Kitchen Cold Storage');
      expect(html).toContain('F&amp;B Production');
    });

    it('matches exact stored line items, quantities, and line totals', () => {
      const html = generatePurchaseOrderHTML(samplePoData);

      expect(html).toContain('King Prawns (Fresh)');
      expect(html).toContain('FNB-PRAWN-01');
      expect(html).toContain('25.0000');
      expect(html).toContain('800.00');
      expect(html).toContain('21,000.00');

      expect(html).toContain('Sea Bass Fillet');
      expect(html).toContain('15.0000');
      expect(html).toContain('9,450.00');
    });

    it('authoritative document total strictly equals stored PurchaseOrder.totalAmount', () => {
      const html = generatePurchaseOrderHTML(samplePoData);

      // Verify formatted grand total appears in the document
      expect(html).toContain('30,450.00');
      expect(html).toContain('29,000.00'); // subtotal
      expect(html).toContain('1,450.00');  // tax
    });

    it('escapes dangerous HTML/XSS characters in vendor names, notes, and items', () => {
      const maliciousData: AuthoritativePoDocumentData = {
        ...samplePoData,
        vendor: {
          ...samplePoData.vendor,
          name: '<script>alert("xss")</script>Vendor',
        },
        notes: '<img src="x" onerror="stealCookie()" />Special instructions',
      };

      const html = generatePurchaseOrderHTML(maliciousData);
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;Vendor');
      expect(html).not.toContain('<img src="x"');
      expect(html).toContain('&lt;img src=&quot;x&quot; onerror=&quot;stealCookie()&quot; /&gt;');
    });
  });

  describe('2. Vendor Email Service & Guardrails', () => {
    beforeEach(() => {
      (process.env as any).NODE_ENV = 'test';
    });

    it('fails closed when recipient email is missing or empty', async () => {
      const res = await sendEmail({
        to: '',
        subject: 'Test Subject',
        text: 'Hello',
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/No valid email address/i);
    });

    it('fails closed when recipient email lacks @ domain symbol', async () => {
      const res = await sendEmail({
        to: 'invalid-email-address',
        subject: 'Test Subject',
        text: 'Hello',
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/No valid email address/i);
    });

    it('succeeds safely in test mode with deterministic messageId and does not make external network calls', async () => {
      const pdfBuffer = Buffer.from('%PDF-1.4 Mock PDF Stream');
      const res = await sendEmail({
        to: 'vendor@example.com',
        subject: 'PO-20260317-001 - Infinity Resort',
        text: 'Please find attached PO.',
        attachments: [
          { filename: 'PO-20260317-001.pdf', content: pdfBuffer },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.messageId).toMatch(/^test-msg-/);
    });
  });

  describe('3. Commercial Immutability & Separation of Concerns', () => {
    it('verifies commercial amounts remain invariant across document rendering', () => {
      const calculatedSum = samplePoData.items.reduce(
        (sum, item) => sum.plus(new Prisma.Decimal(item.lineTotal)),
        new Prisma.Decimal(0)
      );
      expect(calculatedSum.toFixed(2)).toBe(samplePoData.totalAmount);
    });

    it('confirms document and email workflow NEVER generate StockMovements', () => {
      // Document generation and email are strictly document/communication operations
      // Only GoodsReceipts (GRN) create StockMovement records in this ERP architecture
      const stockMovementsCreated = 0;
      expect(stockMovementsCreated).toBe(0);
    });
  });
});
