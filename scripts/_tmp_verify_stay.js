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
      console.log('Balance:', stay.folio.balance?.toString());
      console.log('Status:', stay.folio.status);
      console.log('Items:');
      for (const item of stay.folio.items) {
        console.log('  -', item.type, item.description, 'Amt:', item.amount?.toString(), 'Tax:', item.taxAmount?.toString(), 'Total:', item.totalAmount?.toString());
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
  
  await p.$disconnect();
}
main();
