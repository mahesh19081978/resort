const path = require('path');
const { PrismaClient } = require(path.join(__dirname, '..', 'node_modules', '@prisma', 'client'));

async function main() {
  const prisma = new PrismaClient();
  try {
    // AuditLog entity breakdown
    const auditEntities = await prisma.$queryRawUnsafe(`
      SELECT entity, COUNT(*) as count
      FROM "AuditLog"
      GROUP BY entity
      ORDER BY count DESC
    `);
    console.log('AUDIT LOG ENTITY BREAKDOWN:');
    for (const row of auditEntities) {
      console.log(`  ${String(row.entity).padEnd(30)} ${row.count}`);
    }

    // AuditLog action breakdown
    const auditActions = await prisma.$queryRawUnsafe(`
      SELECT action, COUNT(*) as count
      FROM "AuditLog"
      GROUP BY action
      ORDER BY count DESC
      LIMIT 20
    `);
    console.log('\nAUDIT LOG ACTION BREAKDOWN (top 20):');
    for (const row of auditActions) {
      console.log(`  ${String(row.action).padEnd(40)} ${row.count}`);
    }

    // Room current statuses
    const roomStatuses = await prisma.$queryRawUnsafe(`
      SELECT status, COUNT(*) as count
      FROM "Room"
      GROUP BY status
      ORDER BY status
    `);
    console.log('\nROOM STATUS BREAKDOWN:');
    for (const row of roomStatuses) {
      console.log(`  ${String(row.status).padEnd(25)} ${row.count}`);
    }

    // Check for intentional MAINTENANCE/OUT_OF_ORDER rooms
    const nonAvailableRooms = await prisma.$queryRawUnsafe(`
      SELECT r."roomNumber", r.status, rt.name as room_type
      FROM "Room" r
      JOIN "RoomType" rt ON r."roomTypeId" = rt.id
      WHERE r.status != 'AVAILABLE'
      ORDER BY r."roomNumber"
    `);
    console.log('\nNON-AVAILABLE ROOMS:');
    if (nonAvailableRooms.length === 0) {
      console.log('  (none - all rooms are AVAILABLE)');
    } else {
      for (const row of nonAvailableRooms) {
        console.log(`  Room ${row.roomNumber} (${row.room_type}): ${row.status}`);
      }
    }

    // Check for Stock records and their current quantities
    const stockRecords = await prisma.$queryRawUnsafe(`
      SELECT s."quantityOnHand", i.name as item_name, st.name as store_name
      FROM "Stock" s
      JOIN "InventoryItem" i ON s."itemId" = i.id
      JOIN "Store" st ON s."storeId" = st.id
      ORDER BY st.name, i.name
    `);
    console.log('\nSTOCK RECORDS (current quantities):');
    for (const row of stockRecords) {
      console.log(`  ${row.store_name} | ${row.item_name} | Qty: ${row.quantityOnHand}`);
    }

    // Check PurchaseBill <-> VendorPaymentAllocation circular dependency
    const pbCount = await prisma.purchaseBill.count();
    const vpaCount = await prisma.vendorPaymentAllocation.count();
    console.log(`\nCIRCULAR DEPENDENCY CHECK:`);
    console.log(`  PurchaseBill: ${pbCount}`);
    console.log(`  VendorPaymentAllocation: ${vpaCount}`);
    if (pbCount > 0 && vpaCount > 0) {
      console.log('  WARNING: Circular FK dependency detected between PurchaseBill and VendorPaymentAllocation');
    }

  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
