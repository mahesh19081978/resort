import type { BillSummary } from './bill';
import { Prisma } from '@prisma/client';

function formatINR(amount: string): string {
  const num = parseFloat(amount);
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function buildBillTableHTML(
  items: Array<{ date: string; description: string; quantity: number; rate: string; tax: string; total: string }>,
  showTax: boolean = true
): string {
  if (items.length === 0) return '<p style="color:#888;font-size:12px;text-align:center;padding:12px 0;">No items posted</p>';

  let html = '<table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:16px;">';
  html += '<thead><tr style="background:#f5f5f5;border-bottom:1px solid #ddd;">';
  html += '<th style="text-align:left;padding:6px 8px;font-weight:600;">Date</th>';
  html += '<th style="text-align:left;padding:6px 8px;font-weight:600;">Description</th>';
  html += '<th style="text-align:center;padding:6px 8px;font-weight:600;">Qty</th>';
  html += '<th style="text-align:right;padding:6px 8px;font-weight:600;">Net Rate</th>';
  if (showTax) {
    html += '<th style="text-align:right;padding:6px 8px;font-weight:600;">GST (Embedded)</th>';
  }
  html += '<th style="text-align:right;padding:6px 8px;font-weight:600;">Total (Gross)</th>';
  html += '</tr></thead><tbody>';

  for (const item of items) {
    html += '<tr style="border-bottom:1px solid #eee;">';
    html += `<td style="padding:5px 8px;color:#555;">${formatDateShort(item.date)}</td>`;
    html += `<td style="padding:5px 8px;font-weight:500;">${item.description}</td>`;
    html += `<td style="padding:5px 8px;text-align:center;">${item.quantity}</td>`;
    html += `<td style="padding:5px 8px;text-align:right;">${formatINR(item.rate)}</td>`;
    if (showTax) {
      html += `<td style="padding:5px 8px;text-align:right;color:#666;">${formatINR(item.tax)}</td>`;
    }
    html += `<td style="padding:5px 8px;text-align:right;font-weight:600;">${formatINR(item.total)}</td>`;
    html += '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

export function generateBillHTML(bill: BillSummary, type: 'full' | 'room' | 'other'): string {
  const documentTitle = bill.invoiceNumber
    ? `TAX INVOICE (${bill.invoiceNumber})`
    : type === 'room'
    ? 'Room Accommodation Bill'
    : type === 'other'
    ? 'Incidental Charges Bill'
    : 'Guest Folio Statement';

  let itemsHTML = '';

  if (type === 'room') {
    itemsHTML = buildBillTableHTML(bill.roomBillItems);
  } else if (type === 'other') {
    itemsHTML = buildBillTableHTML([...bill.additionalBillItems, ...bill.restaurantBillItems, ...bill.otherBillItems]);
  } else {
    itemsHTML = buildBillTableHTML(bill.allItems);
  }

  let paymentsHTML = '';
  if (bill.allPayments.length === 0) {
    paymentsHTML = '<tr><td colspan="4" style="text-align:center;color:#888;padding:8px;">No payments recorded</td></tr>';
  } else {
    for (const p of bill.allPayments) {
      paymentsHTML += `<tr style="border-bottom:1px solid #eee;">
        <td style="padding:5px 8px;">${formatDateShort(p.date)}</td>
        <td style="padding:5px 8px;">${p.method}</td>
        <td style="padding:5px 8px;text-align:right;font-weight:600;">${formatINR(p.amount)}</td>
        <td style="padding:5px 8px;color:#666;">${p.reference || '—'}</td>
      </tr>`;
    }
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${documentTitle} - ${bill.guestName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 24px; color: #333; font-size: 12px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #173B2F; padding-bottom: 16px; margin-bottom: 20px; }
    .property-brand h1 { margin: 0 0 4px; font-size: 20px; color: #173B2F; font-weight: 700; letter-spacing: -0.5px; }
    .property-brand p { margin: 2px 0; color: #555; font-size: 11px; }
    .doc-meta { text-align: right; }
    .doc-meta h2 { margin: 0 0 4px; font-size: 16px; color: #173B2F; }
    .doc-meta p { margin: 2px 0; font-size: 11px; color: #555; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; margin-bottom: 20px; padding: 12px; background: #fafafa; border: 1px solid #eaeaea; border-radius: 6px; }
    .info-item { font-size: 11px; }
    .info-item label { font-weight: 600; color: #555; margin-right: 4px; }
    .summary-box { margin: 16px 0; padding: 12px; border: 1px solid #eaeaea; border-radius: 6px; background: #fff; }
    .summary-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 11px; }
    .summary-row.total { font-weight: 700; font-size: 13px; border-top: 2px solid #173B2F; padding-top: 8px; margin-top: 4px; color: #173B2F; }
    .summary-row.balance { font-weight: 700; font-size: 14px; color: #173B2F; border-top: 2px solid #173B2F; padding-top: 8px; }
    .terms-box { margin-top: 20px; padding: 10px; background: #fafafa; border: 1px solid #eaeaea; border-radius: 4px; font-size: 10px; color: #666; white-space: pre-line; }
    .footer { text-align: center; margin-top: 30px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 10px; color: #888; }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
      @page { size: A4; margin: 15mm; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="property-brand">
      <h1>${bill.propertyName}</h1>
      <p>${bill.propertyAddress}</p>
      <p>${bill.propertyCityState}</p>
      <p>Tel: ${bill.propertyPhone} | Email: ${bill.propertyEmail}</p>
      ${bill.propertyGstin ? `<p style="font-weight:600;">GSTIN: ${bill.propertyGstin}</p>` : ''}
    </div>
    <div class="doc-meta">
      <h2>${documentTitle}</h2>
      ${bill.invoiceNumber ? `<p style="font-weight:700;font-size:12px;color:#173B2F;">Invoice No: ${bill.invoiceNumber}</p>` : ''}
      <p>Folio: ${bill.folioNumber}</p>
      <p>Date: ${formatDate(bill.billDate)}</p>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-item"><label>Guest:</label> ${bill.guestName}</div>
    <div class="info-item"><label>Room:</label> ${bill.roomNumber} (${bill.roomTypeName})</div>
    <div class="info-item"><label>Stay #:</label> ${bill.stayNumber}</div>
    <div class="info-item"><label>Reservation #:</label> ${bill.reservationNumber || 'N/A'}</div>
    <div class="info-item"><label>Check-in:</label> ${formatDate(bill.actualCheckIn)}</div>
    <div class="info-item"><label>Expected Checkout:</label> ${formatDate(bill.expectedCheckOut)}</div>
    ${bill.actualCheckOut ? `<div class="info-item"><label>Actual Checkout:</label> ${formatDate(bill.actualCheckOut)}</div>` : ''}
    <div class="info-item"><label>Guest Phone:</label> ${bill.guestPhone || '—'}</div>
  </div>

  ${itemsHTML}

  <div class="summary-box">
    <div class="summary-row"><span>Total Charges (Net Base)</span><span>${formatINR((parseFloat(bill.grossCharges) - parseFloat(bill.totalTax)).toFixed(2))}</span></div>
    <div class="summary-row"><span>Goods & Services Tax (GST Breakdown)</span><span>${formatINR(bill.totalTax)}</span></div>
    ${parseFloat(bill.totalDiscounts) > 0 ? `<div class="summary-row"><span>Discounts Credited</span><span>-${formatINR(bill.totalDiscounts)}</span></div>` : ''}
    <div class="summary-row total"><span>Total Gross Charges</span><span>${formatINR(bill.grossCharges)}</span></div>
  </div>

  <div class="summary-box">
    <h3 style="font-size:12px;margin:0 0 8px;color:#173B2F;">Payment History</h3>
    <table style="width:100%;border-collapse:collapse;font-size:11px;">
      <thead><tr style="background:#f5f5f5;border-bottom:1px solid #ddd;">
        <th style="text-align:left;padding:5px 8px;">Date</th>
        <th style="text-align:left;padding:5px 8px;">Method</th>
        <th style="text-align:right;padding:5px 8px;">Amount Paid</th>
        <th style="text-align:left;padding:5px 8px;">Reference</th>
      </tr></thead>
      <tbody>${paymentsHTML}</tbody>
    </table>
  </div>

  <div class="summary-box">
    ${parseFloat(bill.advancePaid) > 0 ? `<div class="summary-row"><span>Reservation Advance Paid</span><span>${formatINR(bill.advancePaid)}</span></div>` : ''}
    ${parseFloat(bill.stayPayments) > 0 ? `<div class="summary-row"><span>Payments Settled During Stay</span><span>${formatINR(bill.stayPayments)}</span></div>` : ''}
    <div class="summary-row"><span>Total Payments Received</span><span>${formatINR(bill.totalPayments)}</span></div>
    <div class="summary-row balance"><span>Outstanding Amount Due</span><span>${formatINR(bill.outstandingBalance)}</span></div>
  </div>

  ${bill.invoiceTerms ? `<div class="terms-box"><strong>Terms & Conditions:</strong>\n${bill.invoiceTerms}</div>` : ''}

  <div class="footer">
    <p>${bill.invoiceFooter || `${bill.propertyName} | This is a computer-generated tax invoice.`}</p>
  </div>
</body>
</html>`;
}
