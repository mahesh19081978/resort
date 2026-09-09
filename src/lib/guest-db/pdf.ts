import type { StayDetailData } from './stay-detail';
import type { GuestProfile } from './guest-profile';
import { Prisma } from '@prisma/client';

function formatINR(amount: string): string {
  const num = parseFloat(amount);
  return '\u20B9' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function buildItemTableHTML(
  items: Array<{ date: string; description: string; quantity: number; unitPrice: string; taxAmount: string; amount: string }>,
  showTax: boolean = true
): string {
  if (items.length === 0) return '<p style="color:#888;font-size:11px;text-align:center;padding:8px 0;">No items</p>';

  let html = '<table style="width:100%;border-collapse:collapse;font-size:10px;margin-bottom:12px;">';
  html += '<thead><tr style="background:#f5f5f5;border-bottom:1px solid #ddd;">';
  html += '<th style="text-align:left;padding:4px 6px;font-weight:600;">Date</th>';
  html += '<th style="text-align:left;padding:4px 6px;font-weight:600;">Description</th>';
  html += '<th style="text-align:center;padding:4px 6px;font-weight:600;">Qty</th>';
  html += '<th style="text-align:right;padding:4px 6px;font-weight:600;">Rate</th>';
  if (showTax) {
    html += '<th style="text-align:right;padding:4px 6px;font-weight:600;">Tax</th>';
  }
  html += '<th style="text-align:right;padding:4px 6px;font-weight:600;">Amount</th>';
  html += '</tr></thead><tbody>';

  for (const item of items) {
    html += '<tr style="border-bottom:1px solid #eee;">';
    html += `<td style="padding:3px 6px;color:#555;">${formatDate(item.date)}</td>`;
    html += `<td style="padding:3px 6px;">${item.description}</td>`;
    html += `<td style="padding:3px 6px;text-align:center;">${item.quantity}</td>`;
    html += `<td style="padding:3px 6px;text-align:right;">${formatINR(item.unitPrice)}</td>`;
    if (showTax) {
      html += `<td style="padding:3px 6px;text-align:right;color:#666;">${formatINR(item.taxAmount)}</td>`;
    }
    html += `<td style="padding:3px 6px;text-align:right;font-weight:600;">${formatINR(item.amount)}</td>`;
    html += '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

function buildPaymentTableHTML(
  payments: Array<{ date: string; method: string; amount: string; reference: string | null }>
): string {
  if (payments.length === 0) return '<p style="color:#888;font-size:11px;text-align:center;padding:8px 0;">No payments recorded</p>';

  let html = '<table style="width:100%;border-collapse:collapse;font-size:10px;margin-bottom:12px;">';
  html += '<thead><tr style="background:#f5f5f5;border-bottom:1px solid #ddd;">';
  html += '<th style="text-align:left;padding:4px 6px;">Date</th>';
  html += '<th style="text-align:left;padding:4px 6px;">Method</th>';
  html += '<th style="text-align:right;padding:4px 6px;">Amount</th>';
  html += '<th style="text-align:left;padding:4px 6px;">Reference</th>';
  html += '</tr></thead><tbody>';

  for (const p of payments) {
    html += '<tr style="border-bottom:1px solid #eee;">';
    html += `<td style="padding:3px 6px;color:#555;">${formatDate(p.date)}</td>`;
    html += `<td style="padding:3px 6px;">${p.method}</td>`;
    html += `<td style="padding:3px 6px;text-align:right;font-weight:600;color:#16a34a;">${formatINR(p.amount)}</td>`;
    html += `<td style="padding:3px 6px;color:#888;">${p.reference || '-'}</td>`;
    html += '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

export function generateStayReportHTML(stay: StayDetailData): string {
  const accomItems = stay.financialSummary.lineItems.filter((i) => i.category === 'accommodation');
  const addItems = stay.financialSummary.lineItems.filter((i) => i.category === 'additional');
  const restItems = stay.financialSummary.lineItems.filter((i) => i.category === 'restaurant');
  const otherItems = stay.financialSummary.lineItems.filter((i) => i.category === 'other' || i.category === 'tax');
  const discountItems = stay.financialSummary.lineItems.filter((i) => i.category === 'discount');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Stay Report - ${stay.stayNumber}</title>
  <style>
    @page { margin: 12mm; size: A4; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #333; margin: 0; padding: 16px; font-size: 11px; }
    .header { text-align: center; margin-bottom: 20px; border-bottom: 3px solid #173B2F; padding-bottom: 12px; }
    .header h1 { font-family: Georgia, serif; font-size: 20px; color: #173B2F; margin: 0; letter-spacing: 1px; }
    .header p { font-size: 10px; color: #666; margin: 3px 0 0; }
    .section-title { font-size: 12px; font-weight: 700; margin: 14px 0 6px; color: #173B2F; border-bottom: 2px solid #173B2F; padding-bottom: 3px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px; padding: 10px; background: #f9f9f9; border-radius: 6px; font-size: 10px; }
    .info-item label { font-weight: 600; color: #555; }
    .summary-box { margin: 12px 0; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 10px; }
    .summary-row { display: flex; justify-content: space-between; padding: 3px 0; }
    .summary-row.total { font-weight: 700; font-size: 12px; border-top: 2px solid #173B2F; padding-top: 6px; margin-top: 3px; }
    .summary-row.balance { font-weight: 700; font-size: 13px; color: #173B2F; border-top: 2px solid #173B2F; padding-top: 6px; }
    .footer { text-align: center; margin-top: 24px; padding-top: 10px; border-top: 1px solid #ddd; font-size: 9px; color: #888; }
    .guests-table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 12px; }
    .guests-table th { background: #f5f5f5; padding: 4px 6px; text-align: left; border-bottom: 1px solid #ddd; }
    .guests-table td { padding: 3px 6px; border-bottom: 1px solid #eee; }
    .timeline-item { display: flex; gap: 8px; padding: 3px 0; font-size: 10px; border-bottom: 1px solid #f0f0f0; }
    .timeline-date { min-width: 80px; color: #555; }
    .timeline-type { font-weight: 600; min-width: 100px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Infinity Resort & Restaurant</h1>
    <p>Stay Report | ${stay.stayNumber}</p>
  </div>

  <div class="section-title">Stay Information</div>
  <div class="info-grid">
    <div class="info-item"><label>Stay #:</label> ${stay.stayNumber}</div>
    <div class="info-item"><label>Status:</label> ${stay.status}</div>
    <div class="info-item"><label>Guest:</label> ${stay.primaryGuest.firstName} ${stay.primaryGuest.lastName}</div>
    <div class="info-item"><label>Phone:</label> ${stay.primaryGuest.phone}</div>
    <div class="info-item"><label>Room:</label> ${stay.roomAssignments[0]?.roomNumber ?? 'Unassigned'} (${stay.roomAssignments[0]?.roomTypeName ?? ''})</div>
    <div class="info-item"><label>Reservation #:</label> ${stay.reservation?.reservationNumber ?? 'N/A'}</div>
    <div class="info-item"><label>Check-in:</label> ${formatDateTime(stay.actualCheckIn)}</div>
    <div class="info-item"><label>Expected Checkout:</label> ${formatDate(stay.expectedCheckOut)}</div>
    ${stay.actualCheckOut ? `<div class="info-item"><label>Actual Checkout:</label> ${formatDateTime(stay.actualCheckOut)}</div>` : ''}
  </div>

  ${stay.accompanyingGuests.length > 0 ? `
  <div class="section-title">Accompanying Guests</div>
  <table class="guests-table">
    <thead><tr><th>Name</th><th>Phone</th><th>Role</th></tr></thead>
    <tbody>
      ${stay.accompanyingGuests.map((g) => `
        <tr>
          <td>${g.firstName} ${g.lastName}</td>
          <td>${g.phone}</td>
          <td>${g.isPrimary ? 'Primary' : 'Accompanying'}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>` : ''}

  <div class="section-title">Room Assignment History</div>
  <table class="guests-table">
    <thead><tr><th>Room</th><th>Type</th><th>Assigned</th><th>Released</th><th>Status</th></tr></thead>
    <tbody>
      ${stay.roomAssignments.map((ra) => `
        <tr>
          <td>${ra.roomNumber}</td>
          <td>${ra.roomTypeName}</td>
          <td>${formatDateTime(ra.assignedAt)}</td>
          <td>${ra.releasedAt ? formatDateTime(ra.releasedAt) : '-'}</td>
          <td>${ra.status}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  ${accomItems.length > 0 ? `
  <div class="section-title">Accommodation Charges</div>
  ${buildItemTableHTML(accomItems)}` : ''}

  ${addItems.length > 0 ? `
  <div class="section-title">Additional Services</div>
  ${buildItemTableHTML(addItems)}` : ''}

  ${restItems.length > 0 ? `
  <div class="section-title">Restaurant / F&B</div>
  ${buildItemTableHTML(restItems)}` : ''}

  ${otherItems.length > 0 ? `
  <div class="section-title">Other Charges</div>
  ${buildItemTableHTML(otherItems)}` : ''}

  ${discountItems.length > 0 ? `
  <div class="section-title">Discounts</div>
  ${buildItemTableHTML(discountItems, false)}` : ''}

  <div class="summary-box">
    <div class="summary-row"><span>Gross Charges</span><span>${formatINR(stay.financialSummary.grossCharges)}</span></div>
    <div class="summary-row"><span>Total Paid</span><span>${formatINR(stay.financialSummary.totalPaid)}</span></div>
    ${parseFloat(stay.financialSummary.totalRefunds) > 0 ? `<div class="summary-row"><span>Refunds</span><span>${formatINR(stay.financialSummary.totalRefunds)}</span></div>` : ''}
    <div class="summary-row balance"><span>Outstanding Balance</span><span>${formatINR(stay.financialSummary.outstandingBalance)}</span></div>
  </div>

  <div class="section-title">Payment History</div>
  ${buildPaymentTableHTML(stay.financialSummary.payments)}

  ${stay.restaurantOrders.length > 0 ? `
  <div class="section-title">Restaurant Orders</div>
  <table class="guests-table">
    <thead><tr><th>Order #</th><th>Date</th><th>Type</th><th>Amount</th><th>Status</th></tr></thead>
    <tbody>
      ${stay.restaurantOrders.map((o) => `
        <tr>
          <td>${o.orderNumber}</td>
          <td>${formatDate(o.date)}</td>
          <td>${o.orderType}</td>
          <td>${formatINR(o.totalAmount)}</td>
          <td>${o.status}${o.isPaid ? ' (Paid)' : ''}${o.isChargedToRoom ? ' (Room Charge)' : ''}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>` : ''}

  <div class="section-title">Stay Timeline</div>
  ${stay.timeline.map((t) => `
    <div class="timeline-item">
      <span class="timeline-date">${formatDateTime(t.date)}</span>
      <span class="timeline-type">${t.type}</span>
      <span>${t.description}</span>
      ${t.amount ? `<span style="margin-left:auto;font-weight:600;">${formatINR(t.amount)}</span>` : ''}
    </div>
  `).join('')}

  <div class="footer">
    <p>Infinity Resort & Restaurant | This is a computer-generated report.</p>
  </div>
</body>
</html>`;
}

export function generateGuestHistoryHTML(profile: GuestProfile): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Guest History - ${profile.guest.firstName} ${profile.guest.lastName}</title>
  <style>
    @page { margin: 12mm; size: A4; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #333; margin: 0; padding: 16px; font-size: 11px; }
    .header { text-align: center; margin-bottom: 20px; border-bottom: 3px solid #173B2F; padding-bottom: 12px; }
    .header h1 { font-family: Georgia, serif; font-size: 20px; color: #173B2F; margin: 0; }
    .header p { font-size: 10px; color: #666; margin: 3px 0 0; }
    .section-title { font-size: 12px; font-weight: 700; margin: 14px 0 6px; color: #173B2F; border-bottom: 2px solid #173B2F; padding-bottom: 3px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px; padding: 10px; background: #f9f9f9; border-radius: 6px; font-size: 10px; }
    .info-item label { font-weight: 600; color: #555; }
    .summary-box { margin: 12px 0; padding: 10px; border: 1px solid #ddd; border-radius: 6px; }
    .summary-row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 10px; }
    .guests-table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 12px; }
    .guests-table th { background: #f5f5f5; padding: 4px 6px; text-align: left; border-bottom: 1px solid #ddd; }
    .guests-table td { padding: 3px 6px; border-bottom: 1px solid #eee; }
    .footer { text-align: center; margin-top: 24px; padding-top: 10px; border-top: 1px solid #ddd; font-size: 9px; color: #888; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Infinity Resort & Restaurant</h1>
    <p>Guest History Report</p>
  </div>

  <div class="section-title">Guest Profile</div>
  <div class="info-grid">
    <div class="info-item"><label>Name:</label> ${profile.guest.firstName} ${profile.guest.lastName}</div>
    <div class="info-item"><label>Phone:</label> ${profile.guest.phone}</div>
    <div class="info-item"><label>Email:</label> ${profile.guest.email || 'N/A'}</div>
    <div class="info-item"><label>City:</label> ${profile.guest.city || 'N/A'}</div>
    <div class="info-item"><label>Country:</label> ${profile.guest.country || 'N/A'}</div>
    <div class="info-item"><label>Guest Since:</label> ${formatDate(profile.guest.createdAt)}</div>
    <div class="info-item"><label>Total Stays:</label> ${profile.guest.stayCount}</div>
    <div class="info-item"><label>VIP:</label> ${profile.guest.vip ? 'Yes' : 'No'}</div>
  </div>

  <div class="summary-box">
    <div class="summary-row"><span>Total Spent</span><span>${formatINR(profile.guest.totalSpent)}</span></div>
    <div class="summary-row"><span>Total Paid</span><span>${formatINR(profile.guest.totalPaid)}</span></div>
  </div>

  ${profile.documents.length > 0 ? `
  <div class="section-title">Identity Documents</div>
  <table class="guests-table">
    <thead><tr><th>Type</th><th>Number (Masked)</th><th>Status</th><th>Uploaded</th><th>Verified</th></tr></thead>
    <tbody>
      ${profile.documents.map((d) => `
        <tr>
          <td>${d.documentType}</td>
          <td>${d.maskedDocumentNumber}</td>
          <td>${d.verificationStatus}</td>
          <td>${formatDate(d.uploadedAt)}</td>
          <td>${d.verifiedAt ? formatDate(d.verifiedAt) : '-'}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>` : '<p style="color:#888;font-size:10px;">No identity documents on file.</p>'}

  <div class="section-title">Stay History</div>
  <table class="guests-table">
    <thead><tr><th>Stay #</th><th>Room</th><th>Type</th><th>Check-in</th><th>Checkout</th><th>Status</th><th>Balance</th></tr></thead>
    <tbody>
      ${profile.stays.map((s) => `
        <tr>
          <td>${s.stayNumber}</td>
          <td>${s.roomNumber}</td>
          <td>${s.roomTypeName}</td>
          <td>${formatDate(s.actualCheckIn)}</td>
          <td>${s.actualCheckOut ? formatDate(s.actualCheckOut) : '-'}</td>
          <td>${s.status}</td>
          <td>${formatINR(s.folioBalance)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="footer">
    <p>Infinity Resort & Restaurant | This is a computer-generated guest history report.</p>
  </div>
</body>
</html>`;
}

export function generatePrintableBillHTML(bill: {
  guestName: string;
  stayNumber: string;
  roomNumber: string;
  roomTypeName: string;
  reservationNumber: string | null;
  actualCheckIn: string;
  expectedCheckOut: string;
  actualCheckOut: string | null;
  accommodationItems: Array<{ date: string; description: string; quantity: number; unitPrice: string; taxAmount: string; amount: string }>;
  additionalItems: Array<{ date: string; description: string; quantity: number; unitPrice: string; taxAmount: string; amount: string }>;
  restaurantItems: Array<{ date: string; description: string; quantity: number; unitPrice: string; taxAmount: string; amount: string }>;
  accommodationTotal: string;
  additionalTotal: string;
  restaurantTotal: string;
  totalTax: string;
  grossCharges: string;
  totalPaid: string;
  outstandingBalance: string;
  payments: Array<{ date: string; method: string; amount: string; reference: string | null }>;
}): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Bill - ${bill.stayNumber}</title>
  <style>
    @page { margin: 15mm; size: A4; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #333; margin: 0; padding: 20px; font-size: 12px; }
    .header { text-align: center; margin-bottom: 24px; border-bottom: 3px solid #173B2F; padding-bottom: 16px; }
    .header h1 { font-family: Georgia, serif; font-size: 22px; color: #173B2F; margin: 0; letter-spacing: 1px; }
    .header p { font-size: 11px; color: #666; margin: 4px 0 0; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; padding: 12px; background: #f9f9f9; border-radius: 6px; }
    .info-item { font-size: 11px; }
    .info-item label { font-weight: 600; color: #555; }
    .section-title { font-size: 13px; font-weight: 700; margin: 16px 0 8px; color: #173B2F; border-bottom: 2px solid #173B2F; padding-bottom: 4px; }
    .summary-box { margin: 16px 0; padding: 12px; border: 1px solid #ddd; border-radius: 6px; }
    .summary-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 11px; }
    .summary-row.total { font-weight: 700; font-size: 13px; border-top: 2px solid #173B2F; padding-top: 8px; margin-top: 4px; }
    .summary-row.balance { font-weight: 700; font-size: 14px; color: #173B2F; border-top: 2px solid #173B2F; padding-top: 8px; }
    .footer { text-align: center; margin-top: 30px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 10px; color: #888; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 12px; }
    th { background: #f5f5f5; border-bottom: 1px solid #ddd; text-align: left; padding: 6px 8px; font-weight: 600; }
    td { padding: 5px 8px; border-bottom: 1px solid #eee; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Infinity Resort & Restaurant</h1>
    <p>Mhow, Madhya Pradesh | Guest Bill</p>
  </div>

  <div class="info-grid">
    <div class="info-item"><label>Guest:</label> ${bill.guestName}</div>
    <div class="info-item"><label>Room:</label> ${bill.roomNumber} (${bill.roomTypeName})</div>
    <div class="info-item"><label>Stay #:</label> ${bill.stayNumber}</div>
    <div class="info-item"><label>Reservation #:</label> ${bill.reservationNumber || 'N/A'}</div>
    <div class="info-item"><label>Check-in:</label> ${formatDate(bill.actualCheckIn)}</div>
    <div class="info-item"><label>Checkout:</label> ${bill.actualCheckOut ? formatDate(bill.actualCheckOut) : formatDate(bill.expectedCheckOut)}</div>
  </div>

  ${bill.accommodationItems.length > 0 ? `
  <div class="section-title">Accommodation</div>
  <table>
    <thead><tr><th>Date</th><th>Description</th><th class="text-center">Qty</th><th class="text-right">Rate</th><th class="text-right">Tax</th><th class="text-right">Amount</th></tr></thead>
    <tbody>
      ${bill.accommodationItems.map((i) => `
        <tr>
          <td>${formatDate(i.date)}</td>
          <td>${i.description}</td>
          <td class="text-center">${i.quantity}</td>
          <td class="text-right">${formatINR(i.unitPrice)}</td>
          <td class="text-right">${formatINR(i.taxAmount)}</td>
          <td class="text-right" style="font-weight:600;">${formatINR(i.amount)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  <div style="text-align:right;font-size:11px;margin-bottom:12px;"><strong>Accommodation Total: ${formatINR(bill.accommodationTotal)}</strong></div>` : ''}

  ${bill.additionalItems.length > 0 ? `
  <div class="section-title">Additional Services</div>
  <table>
    <thead><tr><th>Date</th><th>Description</th><th class="text-center">Qty</th><th class="text-right">Rate</th><th class="text-right">Tax</th><th class="text-right">Amount</th></tr></thead>
    <tbody>
      ${bill.additionalItems.map((i) => `
        <tr>
          <td>${formatDate(i.date)}</td>
          <td>${i.description}</td>
          <td class="text-center">${i.quantity}</td>
          <td class="text-right">${formatINR(i.unitPrice)}</td>
          <td class="text-right">${formatINR(i.taxAmount)}</td>
          <td class="text-right" style="font-weight:600;">${formatINR(i.amount)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  <div style="text-align:right;font-size:11px;margin-bottom:12px;"><strong>Additional Total: ${formatINR(bill.additionalTotal)}</strong></div>` : ''}

  ${bill.restaurantItems.length > 0 ? `
  <div class="section-title">Restaurant / F&B</div>
  <table>
    <thead><tr><th>Date</th><th>Description</th><th class="text-center">Qty</th><th class="text-right">Rate</th><th class="text-right">Tax</th><th class="text-right">Amount</th></tr></thead>
    <tbody>
      ${bill.restaurantItems.map((i) => `
        <tr>
          <td>${formatDate(i.date)}</td>
          <td>${i.description}</td>
          <td class="text-center">${i.quantity}</td>
          <td class="text-right">${formatINR(i.unitPrice)}</td>
          <td class="text-right">${formatINR(i.taxAmount)}</td>
          <td class="text-right" style="font-weight:600;">${formatINR(i.amount)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  <div style="text-align:right;font-size:11px;margin-bottom:12px;"><strong>Restaurant Total: ${formatINR(bill.restaurantTotal)}</strong></div>` : ''}

  <div class="summary-box">
    <div class="summary-row"><span>Total Tax</span><span>${formatINR(bill.totalTax)}</span></div>
    <div class="summary-row total"><span>Gross Charges</span><span>${formatINR(bill.grossCharges)}</span></div>
  </div>

  <div class="section-title">Payments</div>
  <table>
    <thead><tr><th>Date</th><th>Method</th><th class="text-right">Amount</th><th>Reference</th></tr></thead>
    <tbody>
      ${bill.payments.length > 0 ? bill.payments.map((p) => `
        <tr>
          <td>${formatDate(p.date)}</td>
          <td>${p.method}</td>
          <td class="text-right" style="font-weight:600;color:#16a34a;">${formatINR(p.amount)}</td>
          <td>${p.reference || '-'}</td>
        </tr>
      `).join('') : '<tr><td colspan="4" style="text-align:center;color:#888;">No payments recorded</td></tr>'}
    </tbody>
  </table>

  <div class="summary-box">
    <div class="summary-row"><span>Total Paid</span><span>${formatINR(bill.totalPaid)}</span></div>
    <div class="summary-row balance"><span>Balance Due</span><span>${formatINR(bill.outstandingBalance)}</span></div>
  </div>

  <div class="footer">
    <p>Thank you for staying with us!</p>
    <p>Infinity Resort & Restaurant | This is a computer-generated bill.</p>
  </div>
</body>
</html>`;
}
