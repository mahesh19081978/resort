export interface AuthoritativePoDocumentData {
  poId: string;
  poNumber: string;
  status: string;
  createdAt: string | Date;
  expectedDate?: string | Date | null;
  issuedAt?: string | Date | null;
  issuedByName?: string | null;
  notes?: string | null;

  // Property Configuration (Authoritative)
  property: {
    name: string;
    address: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    contactPhone: string;
    contactEmail: string;
    gstin?: string | null;
    logoUrl?: string | null;
  };

  // Vendor Information (Authoritative)
  vendor: {
    id: string;
    vendorCode: string;
    name: string;
    companyName: string;
    contactPerson?: string | null;
    phone: string;
    email?: string | null;
    address?: string | null;
    gstin?: string | null;
    pan?: string | null;
  };

  // Store / Delivery Information
  deliveryLocation: {
    storeName?: string | null;
    storeCode?: string | null;
    department?: string | null;
    addressSummary?: string | null;
  };

  // Line Items with Authoritative Decimal Data
  items: Array<{
    itemIndex: number;
    itemName: string;
    itemCode: string;
    unitName: string;
    orderedQuantity: string;
    unitPrice: string;
    taxRate: string;
    taxAmount: string;
    lineTotal: string;
    description?: string | null;
  }>;

  // Authoritative Stored Totals
  subtotal: string;
  taxAmount: string;
  discountAmount?: string | null;
  totalAmount: string;

  // Configured Terms
  termsAndConditions?: string | null;
}

function formatINR(val: string | number): string {
  const num = typeof val === 'number' ? val : parseFloat(val || '0');
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateVal: string | Date | null | undefined): string {
  if (!dateVal) return 'N/A';
  const d = typeof dateVal === 'string' ? new Date(dateVal) : dateVal;
  if (isNaN(d.getTime())) return 'N/A';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Single Authoritative HTML Document Renderer for Purchase Orders.
 * Used for:
 * 1. Screen Print (via @media print and clean A4 styling)
 * 2. Puppeteer PDF Generation (inline download)
 * 3. Email Attachment PDF Buffer
 */
export function generatePurchaseOrderHTML(data: AuthoritativePoDocumentData): string {
  const prop = data.property;
  const vendor = data.vendor;
  const deliverTo = data.deliveryLocation;

  const propertyAddressLine = [prop.address, prop.city, prop.state, prop.postalCode, prop.country]
    .filter(Boolean)
    .join(', ');

  const itemsRows = data.items.map((item, idx) => {
    const taxRateNum = parseFloat(item.taxRate || '0');
    const taxDisplay = taxRateNum > 0 ? taxRateNum + '%' : '0%';
    const descPart = item.description ? ' • ' + escapeHtml(item.description) : '';
    return `
    <tr style="border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 7px 8px; text-align: center; color: #4b5563; font-size: 11px;">${idx + 1}</td>
      <td style="padding: 7px 8px; font-size: 11px;">
        <div style="font-weight: 600; color: #111827;">${escapeHtml(item.itemName)}</div>
        <div style="font-size: 10px; color: #6b7280;">Code: ${escapeHtml(item.itemCode)}${descPart}</div>
      </td>
      <td style="padding: 7px 8px; text-align: right; font-weight: 600; font-size: 11px; color: #111827;">
        ${escapeHtml(item.orderedQuantity)}
      </td>
      <td style="padding: 7px 8px; text-align: center; font-size: 11px; color: #4b5563;">
        ${escapeHtml(item.unitName)}
      </td>
      <td style="padding: 7px 8px; text-align: right; font-size: 11px; color: #111827;">
        ${formatINR(item.unitPrice)}
      </td>
      <td style="padding: 7px 8px; text-align: right; font-size: 11px; color: #4b5563;">
        ${taxDisplay}
        <div style="font-size: 9px; color: #9ca3af;">(${formatINR(item.taxAmount)})</div>
      </td>
      <td style="padding: 7px 8px; text-align: right; font-weight: 700; font-size: 11px; color: #111827;">
        ${formatINR(item.lineTotal)}
      </td>
    </tr>`;
  }).join('');

  const vendorCompanyLine = vendor.companyName && vendor.companyName !== vendor.name
    ? `<p>${escapeHtml(vendor.companyName)}</p>`
    : '';

  const vendorContactLine = vendor.contactPerson
    ? `<p>Attn: ${escapeHtml(vendor.contactPerson)}</p>`
    : '';

  const vendorGstinLine = vendor.gstin
    ? `<p>GSTIN: ${escapeHtml(vendor.gstin)}</p>`
    : '';

  const vendorPanLine = vendor.pan
    ? `<p>PAN: ${escapeHtml(vendor.pan)}</p>`
    : '';

  const propGstinHeader = prop.gstin
    ? `<div class="brand-sub"><strong>GSTIN:</strong> ${escapeHtml(prop.gstin)}</div>`
    : '';

  const propGstinBillTo = prop.gstin
    ? `<p>GSTIN: ${escapeHtml(prop.gstin)}</p>`
    : '';

  const issuedDateRow = data.issuedAt
    ? `<tr><td class="label">Issued Date:</td><td class="value">${formatDate(data.issuedAt)}</td></tr>`
    : '';

  const deliverToContent = deliverTo.storeName
    ? `<p><strong>${escapeHtml(deliverTo.storeName)}</strong></p>
       ${deliverTo.storeCode ? `<p>Store Code: ${escapeHtml(deliverTo.storeCode)}</p>` : ''}
       ${deliverTo.department ? `<p>Dept: ${escapeHtml(deliverTo.department)}</p>` : ''}
       <p>${escapeHtml(prop.name)}</p>
       <p>${escapeHtml(prop.address)}, ${escapeHtml(prop.city)}</p>`
    : `<p><strong>Central Receiving / Store</strong></p>
       <p>${escapeHtml(prop.name)}</p>
       <p>${escapeHtml(prop.address)}</p>
       <p>${escapeHtml(prop.city)}, ${escapeHtml(prop.state)} - ${escapeHtml(prop.postalCode)}</p>
       <p>Contact: Purchase Dept</p>`;

  const specialNotes = data.notes
    ? `<div style="margin-top: 4px; padding-top: 4px; border-top: 1px dashed #d1d5db;"><strong>Special Instructions:</strong> ${escapeHtml(data.notes)}</div>`
    : '';

  const termsLine = data.termsAndConditions
    ? `<div style="margin-top: 4px; padding-top: 4px; border-top: 1px dashed #d1d5db;">${escapeHtml(data.termsAndConditions)}</div>`
    : '';

  const discountRow = data.discountAmount && parseFloat(data.discountAmount) > 0
    ? `<tr><td class="t-label">Discount:</td><td class="t-val">-${formatINR(data.discountAmount)}</td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Purchase Order - ${escapeHtml(data.poNumber)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 24px;
      color: #1f2937;
      font-size: 11px;
      background: #ffffff;
      line-height: 1.4;
    }
    @page {
      size: A4;
      margin: 12mm;
    }
    @media print {
      body { padding: 0; background: #fff; }
      .no-print { display: none !important; }
      .page-break { page-break-after: always; }
      thead { display: table-header-group; }
      tr { page-break-inside: avoid; }
    }
    .brand-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #1e3a8a;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .brand-title {
      font-size: 18px;
      font-weight: 800;
      color: #1e3a8a;
      letter-spacing: -0.5px;
      margin: 0 0 4px;
    }
    .brand-sub {
      font-size: 10px;
      color: #4b5563;
      margin: 2px 0;
    }
    .po-title-box {
      text-align: right;
    }
    .po-title {
      font-size: 16px;
      font-weight: 800;
      color: #1e3a8a;
      letter-spacing: 0.5px;
      margin: 0 0 4px;
    }
    .meta-table {
      font-size: 10px;
      margin-left: auto;
      border-collapse: collapse;
    }
    .meta-table td {
      padding: 2px 4px;
    }
    .meta-table .label {
      font-weight: 600;
      color: #6b7280;
      text-align: right;
    }
    .meta-table .value {
      font-weight: 700;
      color: #111827;
      text-align: right;
    }
    .grid-info {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 12px;
      margin-bottom: 16px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 10px 12px;
    }
    .info-card h4 {
      margin: 0 0 6px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #1e3a8a;
      font-weight: 700;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 3px;
    }
    .info-card p {
      margin: 2px 0;
      font-size: 10px;
      color: #374151;
    }
    .info-card strong {
      color: #111827;
    }
    table.items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
    }
    table.items-table th {
      background: #f3f4f6;
      border-bottom: 1px solid #d1d5db;
      padding: 6px 8px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #374151;
    }
    .totals-area {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 16px;
    }
    .terms-box {
      width: 58%;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 9.5px;
      color: #4b5563;
    }
    .terms-box h5 {
      margin: 0 0 4px;
      font-size: 10px;
      font-weight: 700;
      color: #1e3a8a;
      text-transform: uppercase;
    }
    .totals-table-wrapper {
      width: 38%;
    }
    table.totals-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }
    table.totals-table td {
      padding: 4px 6px;
    }
    table.totals-table .t-label {
      color: #4b5563;
    }
    table.totals-table .t-val {
      text-align: right;
      font-weight: 600;
      color: #111827;
    }
    table.totals-table tr.grand-total {
      border-top: 2px solid #1e3a8a;
      border-bottom: 2px solid #1e3a8a;
      font-size: 12px;
      font-weight: 800;
    }
    table.totals-table tr.grand-total td {
      padding: 6px;
      color: #1e3a8a;
    }
    .signatures {
      display: flex;
      justify-content: space-between;
      margin-top: 28px;
      padding-top: 10px;
      border-top: 1px dashed #d1d5db;
    }
    .sig-block {
      width: 45%;
      font-size: 10px;
      color: #4b5563;
    }
    .sig-line {
      margin-top: 32px;
      border-top: 1px solid #9ca3af;
      padding-top: 4px;
      font-weight: 600;
      color: #111827;
    }
    .doc-footer {
      margin-top: 24px;
      padding-top: 8px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      color: #9ca3af;
    }
  </style>
</head>
<body>

  <!-- 1. HEADER & BRAND -->
  <div class="brand-header">
    <div>
      <div class="brand-title">${escapeHtml(prop.name)}</div>
      <div class="brand-sub">${escapeHtml(propertyAddressLine)}</div>
      <div class="brand-sub">Tel: ${escapeHtml(prop.contactPhone)} | Email: ${escapeHtml(prop.contactEmail)}</div>
      ${propGstinHeader}
    </div>
    <div class="po-title-box">
      <div class="po-title">PURCHASE ORDER</div>
      <table class="meta-table">
        <tr>
          <td class="label">PO Number:</td>
          <td class="value">${escapeHtml(data.poNumber)}</td>
        </tr>
        <tr>
          <td class="label">PO Date:</td>
          <td class="value">${formatDate(data.createdAt)}</td>
        </tr>
        ${issuedDateRow}
        <tr>
          <td class="label">Expected Delivery:</td>
          <td class="value">${formatDate(data.expectedDate)}</td>
        </tr>
        <tr>
          <td class="label">Status:</td>
          <td class="value" style="color: ${data.status === 'DRAFT' ? '#b45309' : '#15803d'};">
            ${escapeHtml(data.status)}
          </td>
        </tr>
      </table>
    </div>
  </div>

  <!-- 2. PARTIES (VENDOR / BILL TO / DELIVER TO) -->
  <div class="grid-info">
    <!-- Vendor -->
    <div class="info-card">
      <h4>Vendor</h4>
      <p><strong>${escapeHtml(vendor.name)}</strong></p>
      ${vendorCompanyLine}
      ${vendorContactLine}
      <p>${escapeHtml(vendor.address || 'Address on file')}</p>
      <p>Tel: ${escapeHtml(vendor.phone)}</p>
      <p>Email: ${escapeHtml(vendor.email || 'N/A')}</p>
      ${vendorGstinLine}
      ${vendorPanLine}
    </div>

    <!-- Bill To -->
    <div class="info-card">
      <h4>Bill To</h4>
      <p><strong>${escapeHtml(prop.name)}</strong></p>
      <p>${escapeHtml(prop.address)}</p>
      <p>${escapeHtml(prop.city)}, ${escapeHtml(prop.state)} - ${escapeHtml(prop.postalCode)}</p>
      <p>${escapeHtml(prop.country)}</p>
      ${propGstinBillTo}
      <p>Email: ${escapeHtml(prop.contactEmail)}</p>
    </div>

    <!-- Deliver To -->
    <div class="info-card">
      <h4>Deliver To</h4>
      ${deliverToContent}
    </div>
  </div>

  <!-- 3. ITEMS TABLE -->
  <table class="items-table">
    <thead>
      <tr>
        <th style="width: 5%; text-align: center;">#</th>
        <th style="width: 40%; text-align: left;">Item Description</th>
        <th style="width: 10%; text-align: right;">Qty</th>
        <th style="width: 8%; text-align: center;">Unit</th>
        <th style="width: 12%; text-align: right;">Rate</th>
        <th style="width: 10%; text-align: right;">Tax</th>
        <th style="width: 15%; text-align: right;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${itemsRows}
    </tbody>
  </table>

  <!-- 4. TOTALS & TERMS -->
  <div class="totals-area">
    <div class="terms-box">
      <h5>Terms & Conditions</h5>
      <div>1. Please quote PO Number <strong>${escapeHtml(data.poNumber)}</strong> on all Delivery Challans and Invoices.</div>
      <div>2. All items are subject to inspection and verification at the receiving store. Rejected or damaged goods will be returned at vendor's cost.</div>
      <div>3. Standard delivery schedule must adhere to the expected delivery date indicated on this order.</div>
      ${specialNotes}
      ${termsLine}
    </div>

    <div class="totals-table-wrapper">
      <table class="totals-table">
        <tr>
          <td class="t-label">Subtotal:</td>
          <td class="t-val">${formatINR(data.subtotal)}</td>
        </tr>
        <tr>
          <td class="t-label">Total GST / Tax:</td>
          <td class="t-val">${formatINR(data.taxAmount)}</td>
        </tr>
        ${discountRow}
        <tr class="grand-total">
          <td class="t-label" style="font-weight: 800;">Grand Total:</td>
          <td class="t-val">${formatINR(data.totalAmount)}</td>
        </tr>
      </table>
    </div>
  </div>

  <!-- 5. AUTHORIZATION & SIGNATURES -->
  <div class="signatures">
    <div class="sig-block">
      <div style="font-size: 10px; color: #6b7280;">Prepared & Issued By:</div>
      <div class="sig-line">${escapeHtml(data.issuedByName || 'Authorized Officer')}</div>
      <div style="font-size: 9px; color: #9ca3af; margin-top: 2px;">Procurement & Materials Department</div>
    </div>
    <div class="sig-block" style="text-align: right;">
      <div style="font-size: 10px; color: #6b7280;">Vendor Acceptance:</div>
      <div class="sig-line" style="margin-left: auto; width: 80%;">Authorized Signatory & Stamp</div>
      <div style="font-size: 9px; color: #9ca3af; margin-top: 2px;">Sign and return copy to acknowledge</div>
    </div>
  </div>

  <!-- 6. FOOTER -->
  <div class="doc-footer">
    <div>PO Ref: ${escapeHtml(data.poNumber)} • Generated: ${new Date().toLocaleString('en-IN')}</div>
    <div>${escapeHtml(prop.name)} • Official Commercial Purchase Document</div>
  </div>

</body>
</html>`;
}
