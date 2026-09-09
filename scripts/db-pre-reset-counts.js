const path = require('path');
const { PrismaClient } = require(path.join(__dirname, '..', 'node_modules', '@prisma', 'client'));

async function main() {
  const prisma = new PrismaClient();
  
  const masterModels = [
    'Property', 'Building', 'Floor', 'RoomType', 'Room', 'Amenity',
    'RoomTypeAmenity', 'RoomAmenityOverride',
    'Tax', 'RatePlan', 'RoomRate',
    'Restaurant', 'RestaurantTable', 'MenuCategory', 'MenuItem', 'Recipe', 'RecipeIngredient',
    'InventoryCategory', 'InventoryItem', 'Unit', 'UnitConversion', 'Store',
    'Vendor', 'Service', 'Media', 'Attraction', 'Offer',
    'User', 'Role', 'Permission', 'RolePermission'
  ];

  const transactionalModels = [
    'Guest', 'GuestDocument', 'GuestPhoto',
    'Reservation', 'ReservationRoom', 'ReservationGuest',
    'Stay', 'StayGuest', 'RoomAssignment',
    'Folio', 'FolioItem',
    'Payment', 'Refund',
    'TableSession', 'TableSessionTable',
    'RestaurantOrder', 'RestaurantOrderItem',
    'KOT', 'KOTItem',
    'RestaurantBill', 'RestaurantBillItem', 'RestaurantBillAllocation',
    'Stock', 'InventoryConsumption',
    'StockTransfer', 'StockTransferItem', 'StockMovement',
    'StockCount', 'StockCountItem',
    'PurchaseRequest', 'PurchaseRequestItem',
    'PurchaseOrder', 'PurchaseOrderItem',
    'GoodsReceipt', 'GoodsReceiptItem',
    'PurchaseBill', 'VendorPayment', 'VendorPaymentAllocation', 'VendorReturn',
    'ServiceRequest', 'AuditLog'
  ];

  console.log('='.repeat(60));
  console.log('PRE-RESET TABLE COUNTS');
  console.log('='.repeat(60));
  
  console.log('\n--- MASTER DATA (PRESERVE) ---');
  for (const model of masterModels) {
    try {
      const count = await prisma[model].count();
      console.log(`${model.padEnd(25)} ${count}`);
    } catch (e) {
      console.log(`${model.padEnd(25)} ERROR: ${e.message.substring(0, 50)}`);
    }
  }

  console.log('\n--- TRANSACTIONAL DATA (DELETE) ---');
  for (const model of transactionalModels) {
    try {
      const count = await prisma[model].count();
      console.log(`${model.padEnd(25)} ${count}`);
    } catch (e) {
      console.log(`${model.padEnd(25)} ERROR: ${e.message.substring(0, 50)}`);
    }
  }

  // Room state summary
  console.log('\n--- ROOM STATE ---');
  try {
    const roomStates = await prisma.$queryRawUnsafe(`
      SELECT "physicalStatus", COUNT(*) as count 
      FROM "Room" 
      GROUP BY "physicalStatus" 
      ORDER BY "physicalStatus"
    `);
    for (const row of roomStates) {
      console.log(`${row.physicalStatus.padEnd(25)} ${row.count}`);
    }
  } catch (e) {
    console.log('Error:', e.message);
  }

  // Stay status summary
  console.log('\n--- STAY STATUS ---');
  try {
    const stayStates = await prisma.$queryRawUnsafe(`
      SELECT status, COUNT(*) as count 
      FROM "Stay" 
      GROUP BY status 
      ORDER BY status
    `);
    for (const row of stayStates) {
      console.log(`${row.status.padEnd(25)} ${row.count}`);
    }
  } catch (e) {
    console.log('Error:', e.message);
  }

  // Reservation status summary
  console.log('\n--- RESERVATION STATUS ---');
  try {
    const resStates = await prisma.$queryRawUnsafe(`
      SELECT status, COUNT(*) as count 
      FROM "Reservation" 
      GROUP BY status 
      ORDER BY status
    `);
    for (const row of resStates) {
      console.log(`${row.status.padEnd(25)} ${row.count}`);
    }
  } catch (e) {
    console.log('Error:', e.message);
  }

  // Restaurant table status
  console.log('\n--- RESTAURANT TABLE STATUS ---');
  try {
    const tableStates = await prisma.$queryRawUnsafe(`
      SELECT status, COUNT(*) as count 
      FROM "RestaurantTable" 
      GROUP BY status 
      ORDER BY status
    `);
    for (const row of tableStates) {
      console.log(`${row.status.padEnd(25)} ${row.count}`);
    }
  } catch (e) {
    console.log('Error:', e.message);
  }

  // Stock summary
  console.log('\n--- STOCK SUMMARY ---');
  try {
    const stockCount = await prisma.stock.count();
    console.log(`Total Stock records: ${stockCount}`);
    if (stockCount > 0) {
      const stockSummary = await prisma.$queryRawUnsafe(`
        SELECT s."quantityOnHand", i.name as item_name, st.name as store_name
        FROM "Stock" s
        JOIN "InventoryItem" i ON s."itemId" = i.id
        JOIN "Store" st ON s."storeId" = st.id
        ORDER BY st.name, i.name
        LIMIT 20
      `);
      for (const row of stockSummary) {
        console.log(`  ${row.store_name} | ${row.item_name} | Qty: ${row.quantityOnHand}`);
      }
    }
  } catch (e) {
    console.log('Error:', e.message);
  }

  await prisma.$disconnect();
}

main();
