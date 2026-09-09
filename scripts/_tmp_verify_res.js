const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const res = await p.reservation.findFirst({
    where: { reservationNumber: 'RES-20260909-40F4F6' },
    include: {
      primaryGuest: true,
      reservedRooms: { include: { roomType: true } },
      payments: true,
      stays: true
    }
  });
  
  if (!res) { console.log('Reservation NOT FOUND'); await p.$disconnect(); return; }
  
  console.log('=== RESERVATION ===');
  console.log('ID:', res.id);
  console.log('ResNum:', res.reservationNumber);
  console.log('Status:', res.status);
  console.log('CheckIn:', res.checkInDate);
  console.log('CheckOut:', res.checkOutDate);
  console.log('Guest:', res.primaryGuest?.firstName, res.primaryGuest?.lastName);
  console.log('Email:', res.primaryGuest?.email);
  console.log('Subtotal:', res.subtotal?.toString());
  console.log('TaxAmount:', res.taxAmount?.toString());
  console.log('TotalAmount:', res.totalAmount?.toString());
  console.log('AdvancePaid:', res.advancePaidAmount?.toString());
  console.log('ReservedRooms:', JSON.stringify(res.reservedRooms.map(i => ({
    roomType: i.roomType.name,
    rate: i.rate?.toString(),
    nights: i.nights,
    status: i.status
  }))));
  console.log('Payments:', JSON.stringify(res.payments.map(p => ({
    method: p.method,
    amount: p.amount?.toString(),
    status: p.status
  }))));
  console.log('Stays:', JSON.stringify(res.stays.map(s => ({ id: s.id, status: s.status }))));
  
  await p.$disconnect();
}
main();
