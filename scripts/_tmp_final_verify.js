const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const res = await p.reservation.findFirst({
    where: { reservationNumber: 'RES-20260909-40F4F6' },
    include: {
      primaryGuest: true,
      payments: true,
      stays: {
        include: {
          folio: { include: { items: true, payments: true } },
          roomAssignments: { include: { room: true } }
        }
      }
    }
  });
  
  console.log('=== RESERVATION ===');
  console.log('Status:', res.status);
  console.log('Subtotal:', res.subtotal?.toString());
  console.log('Tax:', res.taxAmount?.toString());
  console.log('Total:', res.totalAmount?.toString());
  console.log('AdvancePaid:', res.advancePaidAmount?.toString());
  
  for (const stay of res.stays) {
    console.log('\n=== STAY:', stay.id, '===');
    console.log('Status:', stay.status);
    
    if (stay.folio) {
      console.log('\n=== FOLIO:', stay.folio.folioNumber, '===');
      console.log('Status:', stay.folio.status);
      console.log('Balance:', stay.folio.balance?.toString());
      console.log('Items:');
      for (const item of stay.folio.items) {
        console.log('  -', item.type, item.description, 'Amt:', item.amount?.toString(), 'Tax:', item.taxAmount?.toString());
      }
      console.log('Payments:');
      for (const pay of stay.folio.payments) {
        console.log('  -', pay.method, pay.amount?.toString(), pay.status);
      }
    }
  }
  
  // Check room status
  const room = await p.room.findFirst({ where: { roomNumber: 'S-1003' }, select: { roomNumber: true, status: true } });
  console.log('\n=== ROOM S-1003 ===');
  console.log('Status:', room?.status);
  
  // Financial invariant check
  console.log('\n=== FINANCIAL INVARIANT CHECK ===');
  const subtotal = Number(res.subtotal);
  const tax = Number(res.taxAmount);
  const total = Number(res.totalAmount);
  const advance = Number(res.advancePaidAmount);
  
  console.log('Base: ₹' + subtotal);
  console.log('GST 12%: ₹' + tax);
  console.log('Expected Total: ₹' + (subtotal + tax));
  console.log('Actual Total: ₹' + total);
  console.log('Match:', total === subtotal + tax ? 'YES' : 'NO');
  
  // Check folio
  const folio = res.stays[0]?.folio;
  if (folio) {
    const roomCharge = folio.items.find(i => i.type === 'ROOM_CHARGE');
    const restaurantCharge = folio.items.find(i => i.type === 'ROOM_SERVICE_CHARGE');
    
    console.log('\nRoom Charge Amount:', roomCharge?.amount?.toString());
    console.log('Room Charge Tax:', roomCharge?.taxAmount?.toString());
    console.log('Restaurant Charge Amount:', restaurantCharge?.amount?.toString());
    console.log('Restaurant Charge Tax:', restaurantCharge?.taxAmount?.toString());
    
    // Verify no double counting
    const totalTax = tax + (restaurantCharge ? Number(restaurantCharge.taxAmount) : 0);
    console.log('Total Tax (Room + Restaurant): ₹' + totalTax);
    console.log('Gross Charges: ₹' + (total + (restaurantCharge ? Number(restaurantCharge.amount) : 0)));
  }
  
  await p.$disconnect();
}
main();
