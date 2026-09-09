const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const roomTypes = await p.roomType.findMany({ select: { id: true, name: true, basePrice: true, isActive: true } });
  console.log('=== ROOM TYPES ===');
  console.log(JSON.stringify(roomTypes, null, 2));

  const heritageType = roomTypes.find(r => r.name.toLowerCase().includes('heritage'));
  if (heritageType) {
    const rooms = await p.room.findMany({
      where: { roomTypeId: heritageType.id, isActive: true },
      select: { id: true, roomNumber: true, status: true, floor: { select: { name: true, building: { select: { name: true } } } } }
    });
    console.log('\n=== STANDARD HERITAGE ROOMS ===');
    console.log(JSON.stringify(rooms, null, 2));
  }

  const count = await p.reservation.count();
  console.log('\nTotal reservations: ' + count);
  const stayCount = await p.stay.count();
  console.log('Total stays: ' + stayCount);

  await p.$disconnect();
}
main();
