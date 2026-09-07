import { prisma } from '../src/lib/db/prisma';
import { createRestaurantOrder } from '../src/lib/restaurant/order-service';
import { generateRestaurantBill, postBillToRoomCharge } from '../src/lib/restaurant/billing-service';
import { OrderType, BillStatus, StayStatus, PhysicalRoomStatus } from '@prisma/client';

async function testRoomServiceCharge() {
  console.log('?? Testing Room Service & Guest Folio Integration with Test Guest & Stay...\n');
  try {
    const restaurant = await prisma.restaurant.findFirst({
      where: { isActive: true },
      include: { menus: { include: { items: true } } },
    });
    if (!restaurant) throw new Error('Restaurant not found');
    const menuItem = restaurant.menus[0]?.items[0];

    // 1. Create or fetch a test guest
    const guest = await prisma.guest.upsert({
      where: { email: 'vip.guest@test-resort.com' },
      update: {},
      create: {
        firstName: 'Vikram',
        lastName: 'Singhania',
        email: 'vip.guest@test-resort.com',
        phone: '+919988776655',
      },
    });

    // 2. Fetch available room
    const room = await prisma.room.findFirst({
      where: { status: PhysicalRoomStatus.AVAILABLE },
    });
    if (!room) throw new Error('No available room for test stay');

    // 3. Create Stay and Folio
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    const stay = await prisma.stay.create({
      data: {
        stayNumber: `STY-${dateStr}-${rand}`,
        primaryGuestId: guest.id,
        status: StayStatus.ACTIVE,
        actualCheckIn: new Date(),
        expectedCheckOut: new Date(Date.now() + 86400000),
        roomAssignments: {
          create: {
            roomId: room.id,
            status: 'ACTIVE',
          },
        },
        folio: {
          create: {
            folioNumber: `FOL-${dateStr}-${rand}`,
            status: 'OPEN',
          },
        },
      },
      include: { folio: true, roomAssignments: true },
    });

    console.log(`  -> Created test Stay #${stay.stayNumber} and Folio #${stay.folio?.folioNumber}`);

    // 4. Create Room Service Order
    const orderRes = await createRestaurantOrder({
      restaurantId: restaurant.id,
      orderType: OrderType.ROOM_SERVICE,
      stayId: stay.id,
      roomId: room.id,
      items: [{ menuItemId: menuItem.id, quantity: 2 }],
      fireKOTImmediately: true,
      kitchenNote: 'Send fresh to room',
    });
    console.log(`  ? PASS: Created Room Service order #${orderRes.order.orderNumber}`);

    // 5. Generate Bill
    const billRes = await generateRestaurantBill({ orderId: orderRes.order.id });
    console.log(`  ? PASS: Generated Bill #${billRes.bill.billNumber} (Total: INR ${billRes.bill.totalAmount})`);

    // 6. Post to Room Charge
    const chargeRes = await postBillToRoomCharge({
      billId: billRes.bill.id,
      stayId: stay.id,
      roomId: room.id,
    });
    console.log(`  ? PASS: Posted Bill to Room Charge. Status: ${chargeRes.bill.status}`);

    // 7. Verify Folio updated
    const updatedFolio = await prisma.folio.findUnique({
      where: { id: stay.folio!.id },
      include: { items: true },
    });
    const folioItem = updatedFolio?.items.find((i) => i.restaurantBillId === billRes.bill.id);
    if (!folioItem || !folioItem.amount.equals(billRes.bill.totalAmount)) {
      throw new Error('FolioItem not properly linked or amount mismatch');
    }
    console.log(`  ? PASS: Verified Folio ledger debit of INR ${folioItem.amount} with 1:1 bill link`);

    // 8. Prevent duplicate room charge (Idempotency)
    let dupPrevented = false;
    try {
      await postBillToRoomCharge({
        billId: billRes.bill.id,
        stayId: stay.id,
        roomId: room.id,
      });
    } catch (e) {
      dupPrevented = true;
    }
    if (!dupPrevented) throw new Error('Failed to prevent duplicate room charge posting');
    console.log('  ? PASS: Prevented duplicate room charge posting (Idempotency)');

    // 9. Clean up test stay and folio
    await prisma.folioItem.deleteMany({ where: { folioId: stay.folio!.id } });
    await prisma.folio.delete({ where: { id: stay.folio!.id } });
    await prisma.roomAssignment.deleteMany({ where: { stayId: stay.id } });
    await prisma.stay.delete({ where: { id: stay.id } });
    console.log('  -> Cleaned up test stay & folio successfully.');

    console.log('\n========================================');
    console.log('Room Service Integration Test: ALL PASSED!');
    console.log('========================================\n');
  } catch (e) {
    console.error('? Error during room charge test:', e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testRoomServiceCharge();
