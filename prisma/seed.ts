import { PrismaClient, UserRole, PhysicalRoomStatus, TableStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting Resort & Restaurant Management System Seeding (Phase 0.2)...');

  // 1. ROLES & PERMISSIONS
  console.log('  -> Seeding Roles & Permissions...');
  const roles = [
    { name: 'Super Administrator', code: 'SUPER_ADMIN', description: 'Unrestricted enterprise administrative access', isSystem: true },
    { name: 'Property Administrator', code: 'ADMIN', description: 'General operational resort manager', isSystem: true },
    { name: 'Front Desk Receptionist', code: 'RECEPTIONIST', description: 'Front desk, check-in/out, folio cashier', isSystem: true },
    { name: 'Restaurant Manager', code: 'RESTAURANT_MANAGER', description: 'F&B floor, table and order management', isSystem: true },
    { name: 'Restaurant Cashier/Biller', code: 'RESTAURANT_BILLER', description: 'POS billing and settlement', isSystem: true },
    { name: 'Kitchen Staff', code: 'KITCHEN_STAFF', description: 'Kitchen Display System & KOT processing', isSystem: true },
    { name: 'Store Manager', code: 'STORE_MANAGER', description: 'Inventory stock receipt, issue and transfer', isSystem: true },
    { name: 'Purchase Manager', code: 'PURCHASE_MANAGER', description: 'Vendor PO, procurement and bills', isSystem: true },
    { name: 'Content Manager', code: 'CONTENT_MANAGER', description: 'Website public content, offers and gallery', isSystem: true },
  ];

  const roleMap: Record<string, string> = {};
  for (const r of roles) {
    const role = await prisma.role.upsert({
      where: { code: r.code },
      update: {},
      create: r,
    });
    roleMap[r.code] = role.id;
  }

  const permissions = [
    { code: 'booking:view', module: 'BOOKING', description: 'View reservations' },
    { code: 'booking:create', module: 'BOOKING', description: 'Create reservations' },
    { code: 'booking:update', module: 'BOOKING', description: 'Modify reservations' },
    { code: 'booking:cancel', module: 'BOOKING', description: 'Cancel reservations' },
    { code: 'checkin:create', module: 'PMS', description: 'Perform guest check-in' },
    { code: 'checkout:create', module: 'PMS', description: 'Perform guest checkout' },
    { code: 'room:assign', module: 'PMS', description: 'Assign or transfer physical room' },
    { code: 'folio:view', module: 'FOLIO', description: 'View guest folio balance' },
    { code: 'folio:add_charge', module: 'FOLIO', description: 'Post manual or room charge to folio' },
    { code: 'folio:settle', module: 'FOLIO', description: 'Settle and close folio' },
    { code: 'restaurant:order:create', module: 'RESTAURANT', description: 'Take restaurant orders' },
    { code: 'restaurant:kot:manage', module: 'RESTAURANT', description: 'Send and update KOTs' },
    { code: 'restaurant:bill:create', module: 'RESTAURANT', description: 'Generate and split bills' },
    { code: 'inventory:view', module: 'INVENTORY', description: 'View store stock balance' },
    { code: 'inventory:issue', module: 'INVENTORY', description: 'Issue stock to departments' },
    { code: 'inventory:adjust', module: 'INVENTORY', description: 'Record wastage and adjustments' },
    { code: 'procurement:create', module: 'PROCUREMENT', description: 'Create purchase orders' },
    { code: 'procurement:approve', module: 'PROCUREMENT', description: 'Approve purchase requests' },
    { code: 'procurement:receive', module: 'PROCUREMENT', description: 'Receive GRN goods' },
    { code: 'vendor:payment:create', module: 'PROCUREMENT', description: 'Record vendor payment' },
  ];

  for (const p of permissions) {
    const perm = await prisma.permission.upsert({
      where: { code: p.code },
      update: {},
      create: p,
    });
    // Assign to Super Admin
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: roleMap['SUPER_ADMIN'], permissionId: perm.id } },
      update: {},
      create: { roleId: roleMap['SUPER_ADMIN'], permissionId: perm.id },
    });
  }

  // Initial Admin User
  await prisma.user.upsert({
    where: { email: 'admin@royalreserve.com' },
    update: {},
    create: {
      email: 'admin@royalreserve.com',
      name: 'Executive General Manager',
      role: UserRole.SUPER_ADMIN,
      roleEntityId: roleMap['SUPER_ADMIN'],
      isActive: true,
    },
  });

  // 2. PROPERTY, BUILDINGS & FLOORS
  console.log('  -> Seeding Property, Buildings & Floors...');
  const property = await prisma.property.upsert({
    where: { code: 'TRR-MAIN' },
    update: {},
    create: {
      name: 'The Royal Reserve Resort & Spa',
      code: 'TRR-MAIN',
      address: 'Reserve Forest Sanctuary Road, Nilgiri Foothills',
      city: 'Wayanad',
      state: 'Kerala',
      postalCode: '673577',
      country: 'India',
      contactPhone: '+91 98765 43210',
      contactEmail: 'reservations@royalreserve.com',
    },
  });

  const bMain = await prisma.building.upsert({
    where: { propertyId_code: { propertyId: property.id, code: 'HERITAGE-MAIN' } },
    update: {},
    create: {
      propertyId: property.id,
      name: 'Heritage Main Wing',
      code: 'HERITAGE-MAIN',
    },
  });

  const bChalet = await prisma.building.upsert({
    where: { propertyId_code: { propertyId: property.id, code: 'CHALET-BLOCK' } },
    update: {},
    create: {
      propertyId: property.id,
      name: 'Forest Chalets Block',
      code: 'CHALET-BLOCK',
    },
  });

  const floorG = await prisma.floor.upsert({
    where: { buildingId_floorNumber: { buildingId: bMain.id, floorNumber: 0 } },
    update: {},
    create: { buildingId: bMain.id, floorNumber: 0, name: 'Ground Floor' },
  });

  const floor1 = await prisma.floor.upsert({
    where: { buildingId_floorNumber: { buildingId: bMain.id, floorNumber: 1 } },
    update: {},
    create: { buildingId: bMain.id, floorNumber: 1, name: 'First Floor' },
  });

  const floorChalet = await prisma.floor.upsert({
    where: { buildingId_floorNumber: { buildingId: bChalet.id, floorNumber: 0 } },
    update: {},
    create: { buildingId: bChalet.id, floorNumber: 0, name: 'Ground Chalets' },
  });
  // 3. AMENITIES
  console.log('  -> Seeding Database-Driven Amenities...');
  const amenityData = [
    { name: 'High-Speed Wi-Fi', code: 'WIFI', icon: 'wifi', description: 'Dual-band fiber wireless internet' },
    { name: 'Climate Control AC', code: 'AC', icon: 'wind', description: 'Inverter hot/cold air conditioning' },
    { name: 'Smart LED TV', code: 'TV', icon: 'tv', description: '55-inch 4K with OTT applications' },
    { name: 'Instant Geyser', code: 'GEYSER', icon: 'flame', description: '24/7 hot water supply' },
    { name: 'Mini Bar & Refrigerator', code: 'MINIBAR', icon: 'glass-water', description: 'Curated refreshments and beverages' },
    { name: 'Digital In-Room Locker', code: 'LOCKER', icon: 'shield', description: 'Electronic laptop-sized safe' },
    { name: 'Forest View Balcony', code: 'BALCONY', icon: 'trees', description: 'Private outdoor balcony with teak seating' },
    { name: 'Jacuzzi Stone Bathtub', code: 'JACUZZI', icon: 'bath', description: 'Handcrafted mountain stone deep soak bath' },
  ];

  const amenityMap: Record<string, string> = {};
  for (const a of amenityData) {
    const am = await prisma.amenity.upsert({
      where: { code: a.code },
      update: {},
      create: a,
    });
    amenityMap[a.code] = am.id;
  }

  // 4. ROOM TYPES & PHYSICAL ROOM GENERATION
  console.log('  -> Seeding Room Types and Physical Rooms...');
  const rtStandard = await prisma.roomType.upsert({
    where: { code: 'STD' },
    update: {},
    create: {
      name: 'Standard Heritage Room',
      code: 'STD',
      description: 'Comfortable garden-facing room with handcrafted wooden accents.',
      basePrice: 5500.00,
      maxOccupancy: 2,
      maxAdults: 2,
      maxChildren: 1,
      totalInventory: 10,
      displayOrder: 1,
    },
  });

  const rtDeluxe = await prisma.roomType.upsert({
    where: { code: 'DLX' },
    update: {},
    create: {
      name: 'Deluxe Heritage Suite',
      code: 'DLX',
      description: 'Spacious upper-level suite with panoramic valley and garden vistas.',
      basePrice: 8500.00,
      maxOccupancy: 3,
      maxAdults: 3,
      maxChildren: 2,
      totalInventory: 10,
      displayOrder: 2,
    },
  });

  const rtVilla = await prisma.roomType.upsert({
    where: { code: 'VILLA' },
    update: {},
    create: {
      name: 'Royal Forest Chalet Villa',
      code: 'VILLA',
      description: 'Private standalone forest chalet with plunge pool and outdoor stone bath.',
      basePrice: 16000.00,
      maxOccupancy: 4,
      maxAdults: 4,
      maxChildren: 2,
      totalInventory: 5,
      displayOrder: 3,
    },
  });

  // Assign default amenities
  for (const code of ['WIFI', 'AC', 'TV', 'GEYSER']) {
    await prisma.roomTypeAmenity.upsert({
      where: { roomTypeId_amenityId: { roomTypeId: rtStandard.id, amenityId: amenityMap[code] } },
      update: {},
      create: { roomTypeId: rtStandard.id, amenityId: amenityMap[code] },
    });
  }
  for (const code of ['WIFI', 'AC', 'TV', 'GEYSER', 'MINIBAR', 'LOCKER', 'BALCONY']) {
    await prisma.roomTypeAmenity.upsert({
      where: { roomTypeId_amenityId: { roomTypeId: rtDeluxe.id, amenityId: amenityMap[code] } },
      update: {},
      create: { roomTypeId: rtDeluxe.id, amenityId: amenityMap[code] },
    });
  }
  for (const code of ['WIFI', 'AC', 'TV', 'GEYSER', 'MINIBAR', 'LOCKER', 'BALCONY', 'JACUZZI']) {
    await prisma.roomTypeAmenity.upsert({
      where: { roomTypeId_amenityId: { roomTypeId: rtVilla.id, amenityId: amenityMap[code] } },
      update: {},
      create: { roomTypeId: rtVilla.id, amenityId: amenityMap[code] },
    });
  }

  // Generate Physical Rooms:
  // Standard: S-101 through S-110 (Ground Floor)
  for (let i = 1; i <= 10; i++) {
    const rNum = `S-10${i === 10 ? '10' : '0' + i}`;
    await prisma.room.upsert({
      where: { propertyId_roomNumber: { propertyId: property.id, roomNumber: rNum } },
      update: {},
      create: {
        propertyId: property.id,
        floorId: floorG.id,
        roomTypeId: rtStandard.id,
        roomNumber: rNum,
        status: PhysicalRoomStatus.AVAILABLE,
      },
    });
  }

  // Deluxe: D-201 through D-210 (First Floor)
  for (let i = 1; i <= 10; i++) {
    const rNum = `D-20${i === 10 ? '10' : '0' + i}`;
    await prisma.room.upsert({
      where: { propertyId_roomNumber: { propertyId: property.id, roomNumber: rNum } },
      update: {},
      create: {
        propertyId: property.id,
        floorId: floor1.id,
        roomTypeId: rtDeluxe.id,
        roomNumber: rNum,
        status: PhysicalRoomStatus.AVAILABLE,
      },
    });
  }

  // Villa: V-301 through V-305 (Chalet Block)
  for (let i = 1; i <= 5; i++) {
    const rNum = `V-30${i}`;
    await prisma.room.upsert({
      where: { propertyId_roomNumber: { propertyId: property.id, roomNumber: rNum } },
      update: {},
      create: {
        propertyId: property.id,
        floorId: floorChalet.id,
        roomTypeId: rtVilla.id,
        roomNumber: rNum,
        status: PhysicalRoomStatus.AVAILABLE,
      },
    });
  }

  // 5. TAXES & RATE PLANS
  console.log('  -> Seeding Taxes & Rate Plans...');
  await prisma.tax.upsert({
    where: { code: 'GST_ROOM_12' },
    update: {},
    create: { name: 'Hospitality GST (Below ₹7,500)', code: 'GST_ROOM_12', rate: 12.00 },
  });
  await prisma.tax.upsert({
    where: { code: 'GST_ROOM_18' },
    update: {},
    create: { name: 'Luxury Hospitality GST (₹7,500 & Above)', code: 'GST_ROOM_18', rate: 18.00 },
  });
  await prisma.tax.upsert({
    where: { code: 'GST_FNB_5' },
    update: {},
    create: { name: 'Restaurant F&B GST', code: 'GST_FNB_5', rate: 5.00 },
  });

  const rpEP = await prisma.ratePlan.upsert({
    where: { code: 'EP' },
    update: {},
    create: { name: 'European Plan (Room Only)', code: 'EP', description: 'Room accommodation only without meals' },
  });

  const rpCP = await prisma.ratePlan.upsert({
    where: { code: 'CP' },
    update: {},
    create: { name: 'Continental Plan (Bed & Breakfast)', code: 'CP', description: 'Room accommodation including complimentary buffet breakfast' },
  });
  // 6. RESTAURANT, TABLES & MENUS
  console.log('  -> Seeding Restaurant, Tables & Menus...');
  const restaurant = await prisma.restaurant.upsert({
    where: { code: 'SPICE-PAV' },
    update: {},
    create: {
      name: 'The Spice Pavilion',
      code: 'SPICE-PAV',
      description: 'Signature farm-to-table culinary restaurant overlooking the valley and stream.',
    },
  });

  // Tables T-01 through T-12
  for (let i = 1; i <= 12; i++) {
    const tNum = `T-${i < 10 ? '0' + i : i}`;
    await prisma.restaurantTable.upsert({
      where: { restaurantId_tableNumber: { restaurantId: restaurant.id, tableNumber: tNum } },
      update: {},
      create: {
        restaurantId: restaurant.id,
        tableNumber: tNum,
        capacity: i <= 8 ? 4 : 6,
        section: i <= 6 ? 'Indoor Heritage AC' : 'Open Forest Terrace',
        status: TableStatus.AVAILABLE,
      },
    });
  }

  const catKebabs = await prisma.menuCategory.upsert({
    where: { restaurantId_name: { restaurantId: restaurant.id, name: 'Clay Oven & Tandoor Kebabs' } },
    update: {},
    create: {
      restaurantId: restaurant.id,
      name: 'Clay Oven & Tandoor Kebabs',
      displayOrder: 1,
    },
  });

  const catMains = await prisma.menuCategory.upsert({
    where: { restaurantId_name: { restaurantId: restaurant.id, name: 'Regional Curries & Biryani' } },
    update: {},
    create: {
      restaurantId: restaurant.id,
      name: 'Regional Curries & Biryani',
      displayOrder: 2,
    },
  });

  const catBeverages = await prisma.menuCategory.upsert({
    where: { restaurantId_name: { restaurantId: restaurant.id, name: 'Cold Pressed Juices & Brews' } },
    update: {},
    create: {
      restaurantId: restaurant.id,
      name: 'Cold Pressed Juices & Brews',
      displayOrder: 3,
    },
  });

  const itemPaneer = await prisma.menuItem.upsert({
    where: { code: 'FNB-KBB-01' },
    update: {},
    create: {
      categoryId: catKebabs.id,
      name: 'Charcoal Smoked Malai Paneer Tikka',
      code: 'FNB-KBB-01',
      description: 'Fresh farm cottage cheese marinated in hung curd, green cardamom and mild spices.',
      price: 450.00,
      taxRate: 5.00,
      isVegetarian: true,
      isAvailable: true,
    },
  });

  const itemBiryani = await prisma.menuItem.upsert({
    where: { code: 'FNB-MAIN-01' },
    update: {},
    create: {
      categoryId: catMains.id,
      name: 'Malabar Dum Chicken Biryani',
      code: 'FNB-MAIN-01',
      description: 'Fragrant Kaima rice cooked with country chicken, fried shallots and local spices.',
      price: 580.00,
      taxRate: 5.00,
      isVegetarian: false,
      isAvailable: true,
    },
  });

  // 7. INVENTORY: UNITS, STORES, CATEGORIES & ITEMS
  console.log('  -> Seeding Inventory Units, Stores, Categories & Items...');
  const uKg = await prisma.unit.upsert({ where: { code: 'KG' }, update: {}, create: { name: 'Kilogram', code: 'KG' } });
  const uGm = await prisma.unit.upsert({ where: { code: 'GM' }, update: {}, create: { name: 'Gram', code: 'GM' } });
  const uLtr = await prisma.unit.upsert({ where: { code: 'LTR' }, update: {}, create: { name: 'Litre', code: 'LTR' } });
  const uPcs = await prisma.unit.upsert({ where: { code: 'PCS' }, update: {}, create: { name: 'Piece', code: 'PCS' } });

  // Conversion: 1 KG = 1000 GM
  await prisma.unitConversion.upsert({
    where: { fromUnitId_toUnitId: { fromUnitId: uKg.id, toUnitId: uGm.id } },
    update: {},
    create: { fromUnitId: uKg.id, toUnitId: uGm.id, factor: 1000.000000 },
  });

  const storeMain = await prisma.store.upsert({
    where: { code: 'STORE-MAIN' },
    update: {},
    create: { name: 'Central Warehouse Store', code: 'STORE-MAIN', department: 'Procurement' },
  });

  const storeKitchen = await prisma.store.upsert({
    where: { code: 'STORE-KIT' },
    update: {},
    create: { name: 'Kitchen Pantry Sub-Store', code: 'STORE-KIT', department: 'F&B' },
  });

  const storeBar = await prisma.store.upsert({
    where: { code: 'STORE-BAR' },
    update: {},
    create: { name: 'Bar & Lounge Store', code: 'STORE-BAR', department: 'F&B' },
  });

  const storeHK = await prisma.store.upsert({
    where: { code: 'STORE-HK' },
    update: {},
    create: { name: 'Housekeeping Linen & Chemical Store', code: 'STORE-HK', department: 'Housekeeping' },
  });

  const storeMaint = await prisma.store.upsert({
    where: { code: 'STORE-MAINT' },
    update: {},
    create: { name: 'Engineering & Maintenance Store', code: 'STORE-MAINT', department: 'Maintenance' },
  });

  const catGrains = await prisma.inventoryCategory.upsert({
    where: { code: 'GRAINS' },
    update: {},
    create: { name: 'Rice, Flour & Grains', code: 'GRAINS' },
  });

  const catMeat = await prisma.inventoryCategory.upsert({
    where: { code: 'MEAT' },
    update: {},
    create: { name: 'Fresh Poultry & Meat', code: 'MEAT' },
  });

  const catLinen = await prisma.inventoryCategory.upsert({
    where: { code: 'LINEN' },
    update: {},
    create: { name: 'Guest Room Linen & Towels', code: 'LINEN' },
  });

  const itemRice = await prisma.inventoryItem.upsert({
    where: { code: 'RAW-RICE-KAIMA' },
    update: {},
    create: {
      categoryId: catGrains.id,
      name: 'Malabar Kaima Biryani Rice',
      code: 'RAW-RICE-KAIMA',
      baseUnitId: uKg.id,
      reorderLevel: 25.00,
      reorderQuantity: 100.00,
      currentStockTotal: 150.00,
      standardCost: 110.00,
    },
  });

  const itemChicken = await prisma.inventoryItem.upsert({
    where: { code: 'RAW-CHICKEN-CURRY' },
    update: {},
    create: {
      categoryId: catMeat.id,
      name: 'Fresh Farm Whole Chicken',
      code: 'RAW-CHICKEN-CURRY',
      baseUnitId: uKg.id,
      reorderLevel: 10.00,
      reorderQuantity: 30.00,
      currentStockTotal: 40.00,
      standardCost: 180.00,
    },
  });

  // Recipe foundation: Biryani uses Kaima Rice & Chicken
  const recipeBiryani = await prisma.recipe.upsert({
    where: { menuItemId: itemBiryani.id },
    update: {},
    create: {
      menuItemId: itemBiryani.id,
      yieldCount: 1,
      instructions: 'Parboil rice with spices, layer over marinated chicken, and slow dum cook for 35 minutes.',
    },
  });

  await prisma.recipeIngredient.upsert({
    where: { recipeId_inventoryItemId: { recipeId: recipeBiryani.id, inventoryItemId: itemRice.id } },
    update: {},
    create: { recipeId: recipeBiryani.id, inventoryItemId: itemRice.id, quantity: 0.2000, notes: '200 gm rice per plate' },
  });

  await prisma.recipeIngredient.upsert({
    where: { recipeId_inventoryItemId: { recipeId: recipeBiryani.id, inventoryItemId: itemChicken.id } },
    update: {},
    create: { recipeId: recipeBiryani.id, inventoryItemId: itemChicken.id, quantity: 0.3500, notes: '350 gm chicken per plate' },
  });

  // 8. VENDORS & SERVICES
  console.log('  -> Seeding Representative Vendors & Resort Services...');
  await prisma.vendor.upsert({
    where: { vendorCode: 'VEND-AGRO-01' },
    update: {},
    create: {
      vendorCode: 'VEND-AGRO-01',
      name: 'Green Valley Organic Farms',
      companyName: 'Green Valley Agro Pvt Ltd',
      contactPerson: 'K. Rajendran',
      phone: '+91 94470 12345',
      email: 'sales@greenvalleyagro.com',
      address: 'Meppadi Estate Road, Wayanad',
      gstin: '32AABCG1234F1Z5',
      paymentTermsDays: 15,
    },
  });

  await prisma.service.upsert({
    where: { code: 'SVC-SPA-01' },
    update: {},
    create: {
      name: 'Abhyanga Ayurvedic Full Body Massage (60 mins)',
      code: 'SVC-SPA-01',
      description: 'Traditional warm herbal oil rejuvenating therapy with steam bath.',
      basePrice: 3200.00,
      isChargeable: true,
    },
  });

  await prisma.service.upsert({
    where: { code: 'SVC-HK-BLANKET' },
    update: {},
    create: {
      name: 'Extra Herbal Wool Blanket',
      code: 'SVC-HK-BLANKET',
      description: 'Complimentary additional warm blanket upon request.',
      basePrice: 0.00,
      isChargeable: false,
    },
  });

  console.log('✅ Seed completed successfully with enterprise baseline data!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });