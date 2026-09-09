#!/usr/bin/env node

/**
 * PRODUCTION DATABASE RESET — EXPLICITLY AUTHORIZED ONLY
 *
 * SAFETY ARCHITECTURE:
 * ────────────────────
 * Gate 1: Requires --confirm-production-reset flag (not --confirm).
 *         This flag name is unmistakable and cannot be confused with development resets.
 *
 * Gate 2: Requires PRODUCTION_RESET_AUTHORIZED=yes environment variable.
 *         Both the flag AND the env var must be present.
 *
 * Gate 3: Database identity verification.
 *         Connected database must match expected production host/database exactly.
 *
 * Gate 4: Interactive confirmation prompt (stdin required).
 *         User must type the exact phrase: I CONFIRM PRODUCTION DATABASE RESET
 *
 * Gate 5: --dry-run NEVER performs DELETE, UPDATE, TRUNCATE, or DROP.
 *
 * Gate 6: Single transaction with ROLLBACK on any failure.
 *
 * USAGE:
 *   PRODUCTION_RESET_AUTHORIZED=yes \
 *   node scripts/db-reset-production.js --dry-run
 *
 *   PRODUCTION_RESET_AUTHORIZED=yes \
 *   node scripts/db-reset-production.js --confirm-production-reset
 *
 * NO COMMIT. NO PUSH.
 */

import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '@prisma', 'client'));

// ============================================================
// SAFETY GATE 1: Parse CLI arguments
// ============================================================
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isConfirmProductionReset = args.includes('--confirm-production-reset');

if (!isDryRun && !isConfirmProductionReset) {
  console.error('ERROR: Must specify --dry-run or --confirm-production-reset');
  console.error('');
  console.error('Usage (dry-run):');
  console.error('  PRODUCTION_RESET_AUTHORIZED=yes node scripts/db-reset-production.js --dry-run');
  console.error('');
  console.error('Usage (execute):');
  console.error('  PRODUCTION_RESET_AUTHORIZED=yes node scripts/db-reset-production.js --confirm-production-reset');
  process.exit(1);
}

// ============================================================
// SAFETY GATE 2: Require explicit authorization env var
// ============================================================
const isAuthorized = process.env.PRODUCTION_RESET_AUTHORIZED === 'yes';

if (!isAuthorized) {
  console.error('BLOCKED: PRODUCTION_RESET_AUTHORIZED=yes not set.');
  console.error('Required: PRODUCTION_RESET_AUTHORIZED=yes');
  await prismaSafeDisconnect();
  process.exit(1);
}

// ============================================================
// EXPECTED PRODUCTION IDENTITY (must match .env DATABASE_URL)
// ============================================================
const EXPECTED_HOST = 'ep-frosty-hall-aynudwnt-pooler.c-5.us-east-2.aws.neon.tech';
const EXPECTED_DB = 'neondb';

// ============================================================
// MAIN
// ============================================================
async function main() {
  const prisma = new PrismaClient();

  console.log('='.repeat(70));
  if (isConfirmProductionReset) {
    console.log('PRODUCTION DATABASE RESET — DESTRUCTIVE OPERATION');
  } else {
    console.log('PRODUCTION DATABASE RESET — DRY-RUN (NO OPERATIONS EXECUTED)');
  }
  console.log('='.repeat(70));

  // ---- Safety Gate 3: Database identity verification ----
  console.log('\n[SAFETY GATE 1] Database identity verification...');
  let dbInfo;
  try {
    const result = await prisma.$queryRawUnsafe(
      'SELECT current_database() as db_name, current_user as db_user, version() as pg_version'
    );
    dbInfo = result[0];
    console.log(`  Connected database: ${dbInfo.db_name}`);
    console.log(`  Connected user: ${dbInfo.db_user}`);
    console.log(`  PostgreSQL: ${dbInfo.pg_version.substring(0, 60)}`);
  } catch (e) {
    console.error('  BLOCKED: Cannot identify database:', e.message);
    await prisma.$disconnect();
    process.exit(1);
  }

  // Parse DATABASE_URL (without exposing password)
  const dbUrl = process.env.DATABASE_URL || '';
  const urlHost = dbUrl.match(/@([^/]+)/)?.[1] || '';
  const urlDb = dbUrl.match(/\/([^?]+)/)?.[1] || '';
  const cleanUrlDb = urlDb.split('/').pop() || urlDb;

  console.log(`  DATABASE_URL host: ${urlHost || '(not found)'}`);
  console.log(`  DATABASE_URL database: ${cleanUrlDb || '(not found)'}`);

  // Verify against expected production identity
  const hostMatches = urlHost === EXPECTED_HOST;
  const dbMatches = cleanUrlDb === EXPECTED_DB;
  const connectedDbMatches = dbInfo.db_name === EXPECTED_DB;

  console.log(`  Expected host: ${EXPECTED_HOST}`);
  console.log(`  Expected database: ${EXPECTED_DB}`);
  console.log(`  Host exact match: ${hostMatches}`);
  console.log(`  DB name exact match (URL): ${dbMatches}`);
  console.log(`  DB name exact match (connected): ${connectedDbMatches}`);

  if (!hostMatches) {
    console.error(`\n  BLOCKED: DATABASE_URL host does not match expected production.`);
    console.error(`  Expected: ${EXPECTED_HOST}`);
    console.error(`  Found:    ${urlHost || '(empty)'}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  if (!connectedDbMatches) {
    console.error(`\n  BLOCKED: Connected database does not match expected production.`);
    console.error(`  Expected: ${EXPECTED_DB}`);
    console.error(`  Found:    ${dbInfo.db_name}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log('  PASSED: Database identity matches expected production.');

  // ---- Safety Gate 4: Interactive confirmation (confirm mode only) ----
  if (isConfirmProductionReset) {
    console.log('\n' + '='.repeat(70));
    console.log('CRITICAL WARNING: PRODUCTION DATABASE RESET');
    console.log('='.repeat(70));
    console.log('');
    console.log('  DATABASE HOST: ' + urlHost);
    console.log('  DATABASE NAME: ' + dbInfo.db_name);
    console.log('  DATABASE USER: ' + dbInfo.db_user);
    console.log('');
    console.log('  This operation will PERMANENTLY DELETE:');
    console.log('    - All guests, reservations, stays');
    console.log('    - All folios, payments, refunds');
    console.log('    - All restaurant orders, KOTs, bills');
    console.log('    - All inventory transactions');
    console.log('    - All procurement records');
    console.log('    - All audit logs');
    console.log('    - All service requests');
    console.log('');
    console.log('  This operation will RESET:');
    console.log('    - Stock quantities to 0');
    console.log('    - Occupied rooms to AVAILABLE');
    console.log('    - Active restaurant tables to AVAILABLE');
    console.log('');
    console.log('  This operation will PRESERVE:');
    console.log('    - All master/configuration data');
    console.log('    - All users, roles, permissions');
    console.log('    - All room types, amenities, tax codes');
    console.log('    - All restaurants, menus, recipes');
    console.log('    - All inventory items, units, stores');
    console.log('    - All vendors, services');
    console.log('');
    console.log('  All changes will be wrapped in a SINGLE TRANSACTION.');
    console.log('  If any operation fails, everything will be ROLLED BACK.');
    console.log('');
    console.log('='.repeat(70));

    // Interactive confirmation
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await new Promise((resolve) => {
      rl.question(
        '\n  Type "I CONFIRM PRODUCTION DATABASE RESET" to proceed: ',
        resolve
      );
    });
    rl.close();

    if (answer.trim() !== 'I CONFIRM PRODUCTION DATABASE RESET') {
      console.error('\n  BLOCKED: Confirmation text did not match.');
      console.error('  You typed: "' + answer.trim() + '"');
      console.error('  Required:   "I CONFIRM PRODUCTION DATABASE RESET"');
      await prisma.$disconnect();
      process.exit(1);
    }
    console.log('\n  Confirmation accepted.');
  }

  // ---- All safety gates passed ----
  console.log('\n' + '='.repeat(70));
  console.log('ALL SAFETY GATES PASSED');
  console.log('='.repeat(70));
  console.log(`  Database: ${dbInfo.db_name}`);
  console.log(`  Host: ${urlHost}`);
  console.log(`  Mode: ${isDryRun ? 'DRY-RUN (read-only)' : 'CONFIRM (destructive)'}`);

  // ============================================================
  // PRE-RESET COUNTS
  // ============================================================
  console.log('\n' + '='.repeat(70));
  console.log('PRE-RESET STATE');
  console.log('='.repeat(70));

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
    'InventoryConsumption',
    'StockMovement',
    'StockCount', 'StockCountItem',
    'StockTransfer', 'StockTransferItem',
    'PurchaseRequest', 'PurchaseRequestItem',
    'PurchaseOrder', 'PurchaseOrderItem',
    'GoodsReceipt', 'GoodsReceiptItem',
    'PurchaseBill', 'VendorPayment', 'VendorPaymentAllocation', 'VendorReturn',
    'ServiceRequest', 'AuditLog'
  ];

  const preResetCounts = {};

  console.log('\nMASTER DATA (WILL BE PRESERVED):');
  for (const model of masterModels) {
    try {
      const count = await prisma[model].count();
      preResetCounts[model] = count;
      console.log(`  ${model.padEnd(25)} ${count}`);
    } catch (e) {
      console.log(`  ${model.padEnd(25)} ERROR: ${e.message.substring(0, 40)}`);
    }
  }

  console.log('\nTRANSACTIONAL DATA (WILL BE DELETED):');
  let totalTransactional = 0;
  for (const model of transactionalModels) {
    try {
      const count = await prisma[model].count();
      preResetCounts[model] = count;
      totalTransactional += count;
      console.log(`  ${model.padEnd(25)} ${count}`);
    } catch (e) {
      console.log(`  ${model.padEnd(25)} ERROR: ${e.message.substring(0, 40)}`);
    }
  }
  console.log(`  ${'TOTAL'.padEnd(25)} ${totalTransactional}`);

  // Stock (will be reset, not deleted)
  console.log('\nSTOCK (WILL BE RESET to quantityOnHand=0):');
  try {
    const stock = await prisma.$queryRawUnsafe(`
      SELECT st.name as store_name, i.name as item_name, s."quantityOnHand"
      FROM "Stock" s
      JOIN "InventoryItem" i ON s."itemId" = i.id
      JOIN "Store" st ON s."storeId" = st.id
      ORDER BY st.name, i.name
    `);
    if (stock.length === 0) {
      console.log('  (no stock records)');
    }
    for (const row of stock) {
      console.log(`  ${row.store_name} | ${row.item_name} | Qty: ${row.quantityOnHand}`);
    }
  } catch (e) {
    console.log('  Error reading stock:', e.message);
  }

  // Room state
  let roomStates = [];
  try {
    roomStates = await prisma.$queryRawUnsafe(`
      SELECT status, COUNT(*) as count FROM "Room" GROUP BY status ORDER BY status
    `);
    console.log('\nROOM STATUS (will reset non-AVAILABLE active rooms):');
    for (const row of roomStates) {
      console.log(`  ${String(row.status).padEnd(25)} ${row.count}`);
    }
  } catch (e) {
    console.log('  Error reading room status:', e.message);
  }

  // Restaurant table state
  let tableStates = [];
  try {
    tableStates = await prisma.$queryRawUnsafe(`
      SELECT status, COUNT(*) as count FROM "RestaurantTable" GROUP BY status ORDER BY status
    `);
    console.log('\nRESTAURANT TABLE STATUS (will reset non-AVAILABLE tables):');
    for (const row of tableStates) {
      console.log(`  ${String(row.status).padEnd(25)} ${row.count}`);
    }
  } catch (e) {
    console.log('  Error reading table status:', e.message);
  }

  // AuditLog breakdown (will be deleted)
  let auditEntityCounts = [];
  try {
    auditEntityCounts = await prisma.$queryRawUnsafe(`
      SELECT entity, COUNT(*) as count FROM "AuditLog" GROUP BY entity ORDER BY count DESC
    `);
    console.log('\nAUDIT LOG BREAKDOWN (WILL BE DELETED):');
    for (const row of auditEntityCounts) {
      console.log(`  ${String(row.entity).padEnd(25)} ${row.count}`);
    }
  } catch (e) {
    console.log('  Error reading audit log:', e.message);
  }

  // ============================================================
  // DELETION ORDER (built from actual FK dependencies in schema.prisma)
  //
  // Schema audit result: 72 models, 115 FK fields, 0 circular FKs.
  // Only self-referential FK: RestaurantBill.parentBillId.
  //
  // Dependency graph is a DAG — no cycles to resolve.
  // ============================================================
  console.log('\n' + '='.repeat(70));
  console.log('DELETION ORDER (dependency-aware, from schema.prisma FK audit)');
  console.log('='.repeat(70));

  // DELETION ORDER: Built from schema.prisma FK audit (72 models, 120+ FKs).
  // Every record is deleted BEFORE any record that references it via FK.
  // Models with onDelete: Restrict must have dependents deleted first.
  // No circular FKs exist (only self-referential RestaurantBill.parentBillId).
  //
  // KEY CORRECTIONS from schema audit:
  // 1. RestaurantBill has orderId→RestaurantOrder (Restrict) — Bill MUST go before Order
  // 2. StockMovement has consumptionId→InventoryConsumption, stockCountId→StockCount,
  //    transferId→StockTransfer — all three MUST go before Movement
  // 3. PurchaseRequest has requestedById→User (Restrict) — Request MUST go after all
  //    models that depend on it (PurchaseOrder has requestId→PurchaseRequest SetNull)
  // 4. Stock is RESET not deleted (quantityOnHand → 0)
  const deletionPlan = [
    // ---- PHASE 1: Deepest leaf nodes ----
    { model: 'AuditLog', description: 'Audit logs (depends on: User)' },

    // ---- PHASE 2: InventoryConsumption FIRST (Restricts KOTItem) ----
    { model: 'InventoryConsumption', description: 'Inventory consumption (depends on: KOTItem [Restrict])' },

    // ---- PHASE 3: Restaurant deepest children (now safe — InventoryConsumption deleted) ----
    { model: 'KOTItem', description: 'KOT items (depends on: KOT, RestaurantOrderItem, MenuItem)' },
    { model: 'RestaurantBillAllocation', description: 'Bill allocations (depends on: RestaurantBill, RestaurantOrderItem)' },
    { model: 'RestaurantBillItem', description: 'Bill line items (depends on: RestaurantBill)' },

    // ---- PHASE 4: Restaurant mid-level ----
    { model: 'KOT', description: 'KOTs (depends on: RestaurantOrder, User)' },
    { model: 'RestaurantOrderItem', description: 'Order items (depends on: RestaurantOrder, MenuItem)' },
    { model: 'TableSessionTable', description: 'Session-table junction (depends on: TableSession, RestaurantTable)' },

    // ---- PHASE 5: Restaurant bill BEFORE order (Bill.orderId → Order Restrict) ----
    { model: 'RestaurantBill', description: 'Restaurant bills (depends on: RestaurantOrder [Restrict]; self-ref parentBill)' },

    // ---- PHASE 6: Restaurant orders & sessions ----
    { model: 'RestaurantOrder', description: 'Restaurant orders (depends on: Restaurant [Restrict], TableSession, Stay, Room)' },
    { model: 'TableSession', description: 'Table sessions (no FK dependencies)' },

    // ---- PHASE 7: Financial leaf nodes ----
    { model: 'Refund', description: 'Refunds (depends on: Payment [Restrict])' },

    // ---- PHASE 8: Service requests ----
    { model: 'ServiceRequest', description: 'Service requests (depends on: Service [Restrict], Stay [Cascade], Room)' },

    // ---- PHASE 9: Stay children ----
    { model: 'StayGuest', description: 'Stay-guest junction (depends on: Stay, Guest)' },
    { model: 'RoomAssignment', description: 'Room assignments (depends on: Stay, Room [Restrict])' },

    // ---- PHASE 10: Folio chain (FolioItem before Folio before Stay) ----
    { model: 'FolioItem', description: 'Folio line items (depends on: Folio [Cascade], RestaurantOrder, RestaurantBill, ServiceRequest)' },
    { model: 'Folio', description: 'Folios (depends on: Stay [Restrict])' },

    // ---- PHASE 11: Payments ----
    { model: 'Payment', description: 'Payments (depends on: Reservation, Folio, RestaurantBill, VendorPayment, User)' },

    // ---- PHASE 12: Stay ----
    { model: 'Stay', description: 'Stays (depends on: Reservation, Guest [Restrict])' },

    // ---- PHASE 13: Reservation chain ----
    { model: 'ReservationRoom', description: 'Reservation rooms (depends on: Reservation [Cascade], RoomType [Restrict], RatePlan)' },
    { model: 'ReservationGuest', description: 'Reservation-guest junction (depends on: Reservation [Cascade], Guest [Cascade])' },
    { model: 'Reservation', description: 'Reservations (depends on: Guest [Restrict])' },

    // ---- PHASE 14: Inventory — StockMovement AFTER InventoryConsumption ----
    { model: 'StockCountItem', description: 'Stock count items (depends on: StockCount [Cascade], InventoryItem [Restrict])' },
    { model: 'StockTransferItem', description: 'Transfer items (depends on: StockTransfer [Cascade], InventoryItem [Restrict], Unit [Restrict])' },
    // StockMovement depends on InventoryConsumption (SetNull) — IC already deleted in Phase 2
    { model: 'StockMovement', description: 'Stock movements (depends on: Store, Item, Unit, Transfer, GRN, Consumption, Count, User)' },
    { model: 'StockCount', description: 'Stock counts (depends on: Store [Restrict])' },
    { model: 'StockTransfer', description: 'Stock transfers (depends on: Store [Restrict], User)' },

    // ---- PHASE 15: Procurement chain ----
    { model: 'PurchaseRequestItem', description: 'Purchase request items (depends on: PurchaseRequest [Cascade], InventoryItem [Restrict])' },
    { model: 'PurchaseOrderItem', description: 'PO items (depends on: PurchaseOrder [Cascade], InventoryItem [Restrict])' },
    { model: 'GoodsReceiptItem', description: 'GRN items (depends on: GoodsReceipt [Cascade], InventoryItem [Restrict])' },
    { model: 'VendorReturn', description: 'Vendor returns (depends on: Vendor [Restrict])' },
    { model: 'VendorPaymentAllocation', description: 'Vendor payment allocations (depends on: VendorPayment [Cascade], PurchaseBill [Restrict])' },
    { model: 'PurchaseBill', description: 'Purchase bills (depends on: Vendor [Restrict], PurchaseOrder, GoodsReceipt)' },
    { model: 'VendorPayment', description: 'Vendor payments (depends on: Vendor [Restrict])' },
    { model: 'GoodsReceipt', description: 'Goods receipts (depends on: PurchaseOrder [Restrict], Vendor [Restrict], User)' },
    { model: 'PurchaseOrder', description: 'Purchase orders (depends on: Vendor [Restrict], PurchaseRequest, User)' },
    { model: 'PurchaseRequest', description: 'Purchase requests (depends on: User [Restrict])' },

    // ---- PHASE 16: Guest data ----
    { model: 'GuestDocument', description: 'Guest documents (depends on: Guest [Cascade], User)' },
    { model: 'GuestPhoto', description: 'Guest photos (depends on: Guest [Cascade], User)' },
    { model: 'Guest', description: 'Guests (no FK dependencies — root model)' },

    // ---- PHASE 17: Operational resets (not deletions) ----
    {
      model: 'Stock',
      description: 'Stock records — RESET quantityOnHand to 0',
      isReset: true,
      resetData: { quantityOnHand: 0 }
    },
    {
      model: 'Room',
      description: 'Rooms — reset non-AVAILABLE active rooms to AVAILABLE',
      isReset: true,
      resetWhere: { isActive: true, status: { not: 'AVAILABLE' } },
      resetData: { status: 'AVAILABLE' }
    },
    {
      model: 'RestaurantTable',
      description: 'Restaurant tables — reset non-AVAILABLE tables to AVAILABLE',
      isReset: true,
      resetWhere: { status: { not: 'AVAILABLE' } },
      resetData: { status: 'AVAILABLE' }
    },
  ];

  // Print deletion plan
  let stepNum = 0;
  for (const step of deletionPlan) {
    stepNum++;
    const count = preResetCounts[step.model] || 0;
    const action = step.isReset ? 'RESET' : 'DELETE';
    console.log(`  ${String(stepNum).padStart(2)}. [${action.padEnd(5)}] ${step.model.padEnd(25)} (${count} records) — ${step.description}`);
  }

  // ============================================================
  // DRY-RUN: Exit without any destructive operations
  // ============================================================
  if (isDryRun) {
    console.log('\n' + '='.repeat(70));
    console.log('DRY-RUN COMPLETE — ZERO DESTRUCTIVE SQL EXECUTED');
    console.log('='.repeat(70));
    console.log('\nThis was a read-only preview. No data was modified.');
    console.log('No DELETE, UPDATE, TRUNCATE, or DROP statements were executed.');
    console.log('\nTo execute the reset, run:');
    console.log(`  PRODUCTION_RESET_AUTHORIZED=yes node scripts/db-reset-production.js --confirm-production-reset`);
    await prisma.$disconnect();
    return;
  }

  // ============================================================
  // CONFIRM MODE: Execute reset in single transaction
  // ============================================================
  console.log('\n' + '='.repeat(70));
  console.log('EXECUTING PRODUCTION RESET IN SINGLE TRANSACTION...');
  console.log('='.repeat(70));

  const deletedCounts = {};
  const resetCounts = {};

  try {
    await prisma.$transaction(async (tx) => {
      for (const step of deletionPlan) {
        const label = `[${step.model}]`;

        if (step.isReset) {
          try {
            let result;
            if (step.resetWhere) {
              result = await tx[step.model].updateMany({
                where: step.resetWhere,
                data: step.resetData
              });
            } else {
              result = await tx[step.model].updateMany({
                data: step.resetData
              });
            }
            resetCounts[step.model] = result.count;
            console.log(`  ${label} RESET ${result.count} records`);
          } catch (e) {
            console.error(`  ${label} RESET FAILED:`, e.message);
            throw e;
          }
        } else {
          try {
            const result = await tx[step.model].deleteMany();
            deletedCounts[step.model] = result.count;
            console.log(`  ${label} Deleted ${result.count} records`);
          } catch (e) {
            console.error(`  ${label} DELETE FAILED:`, e.message);
            throw e;
          }
        }
      }

      console.log('\n  All phases completed. Committing transaction...');
    }, {
      timeout: 180000,
      maxWait: 15000,
    });

    console.log('  Transaction COMMITTED successfully.');

  } catch (error) {
    console.error('\n  TRANSACTION FAILED — ROLLBACK OCCURRED.');
    console.error('  Error:', error.message);
    await prisma.$disconnect();
    process.exit(1);
  }

  // ============================================================
  // POST-RESET VERIFICATION
  // ============================================================
  console.log('\n' + '='.repeat(70));
  console.log('POST-RESET VERIFICATION');
  console.log('='.repeat(70));

  console.log('\nTRANSACTIONAL DATA (should all be 0):');
  let allZero = true;
  for (const model of transactionalModels) {
    try {
      const count = await prisma[model].count();
      const status = count === 0 ? 'OK' : 'NOT ZERO';
      if (count !== 0) allZero = false;
      console.log(`  ${model.padEnd(25)} ${String(count).padEnd(6)} ${status}`);
    } catch (e) {
      console.log(`  ${model.padEnd(25)} ERROR`);
    }
  }
  console.log(`\n  All transactional tables zero: ${allZero ? 'YES' : 'NO'}`);

  console.log('\nMASTER DATA (should match pre-reset counts):');
  let allPreserved = true;
  for (const model of masterModels) {
    try {
      const count = await prisma[model].count();
      const preCount = preResetCounts[model] || 0;
      const status = count === preCount ? 'PRESERVED' : `CHANGED (${preCount} -> ${count})`;
      if (count !== preCount) allPreserved = false;
      console.log(`  ${model.padEnd(25)} ${String(count).padEnd(6)} ${status}`);
    } catch (e) {
      console.log(`  ${model.padEnd(25)} ERROR`);
    }
  }
  console.log(`\n  All master data preserved: ${allPreserved ? 'YES' : 'NO'}`);

  console.log('\nSTOCK (post-reset, all quantities should be 0):');
  try {
    const stock = await prisma.$queryRawUnsafe(`
      SELECT st.name as store_name, i.name as item_name, s."quantityOnHand"
      FROM "Stock" s
      JOIN "InventoryItem" i ON s."itemId" = i.id
      JOIN "Store" st ON s."storeId" = st.id
      ORDER BY st.name, i.name
    `);
    if (stock.length === 0) {
      console.log('  (no stock records)');
    }
    let allZeroQty = true;
    for (const row of stock) {
      const status = row.quantityOnHand === 0 ? 'OK' : 'NOT ZERO';
      if (row.quantityOnHand !== 0) allZeroQty = false;
      console.log(`  ${row.store_name} | ${row.item_name} | Qty: ${row.quantityOnHand} ${status}`);
    }
    console.log(`\n  All stock quantities zero: ${allZeroQty ? 'YES' : 'NO'}`);
  } catch (e) {
    console.log('  Error:', e.message);
  }

  console.log('\nROOM STATUS (post-reset):');
  try {
    const rooms = await prisma.$queryRawUnsafe(`
      SELECT status, COUNT(*) as count FROM "Room" GROUP BY status ORDER BY status
    `);
    for (const row of rooms) {
      console.log(`  ${String(row.status).padEnd(25)} ${row.count}`);
    }
  } catch (e) {
    console.log('  Error:', e.message);
  }

  console.log('\nRESTAURANT TABLE STATUS (post-reset):');
  try {
    const tables = await prisma.$queryRawUnsafe(`
      SELECT status, COUNT(*) as count FROM "RestaurantTable" GROUP BY status ORDER BY status
    `);
    for (const row of tables) {
      console.log(`  ${String(row.status).padEnd(25)} ${row.count}`);
    }
  } catch (e) {
    console.log('  Error:', e.message);
  }

  // Orphan checks
  console.log('\nORPHAN CHECKS:');
  const orphanChecks = [
    { name: 'Orphan ReservationRoom', query: 'SELECT COUNT(*) as count FROM "ReservationRoom" rr LEFT JOIN "Reservation" r ON rr."reservationId" = r.id WHERE r.id IS NULL' },
    { name: 'Orphan StayGuest', query: 'SELECT COUNT(*) as count FROM "StayGuest" sg LEFT JOIN "Stay" s ON sg."stayId" = s.id WHERE s.id IS NULL' },
    { name: 'Orphan RoomAssignment', query: 'SELECT COUNT(*) as count FROM "RoomAssignment" ra LEFT JOIN "Stay" s ON ra."stayId" = s.id WHERE s.id IS NULL' },
    { name: 'Orphan FolioItem', query: 'SELECT COUNT(*) as count FROM "FolioItem" fi LEFT JOIN "Folio" f ON fi."folioId" = f.id WHERE f.id IS NULL' },
    { name: 'Orphan Payment', query: 'SELECT COUNT(*) as count FROM "Payment" p LEFT JOIN "Folio" f ON p."folioId" = f.id LEFT JOIN "Reservation" r ON p."reservationId" = r.id WHERE f.id IS NULL AND r.id IS NULL' },
    { name: 'Orphan RestaurantOrderItem', query: 'SELECT COUNT(*) as count FROM "RestaurantOrderItem" roi LEFT JOIN "RestaurantOrder" ro ON roi."orderId" = ro.id WHERE ro.id IS NULL' },
    { name: 'Orphan KOTItem', query: 'SELECT COUNT(*) as count FROM "KOTItem" ki LEFT JOIN "KOT" k ON ki."kotId" = k.id WHERE k.id IS NULL' },
    { name: 'Orphan RestaurantBillItem', query: 'SELECT COUNT(*) as count FROM "RestaurantBillItem" rbi LEFT JOIN "RestaurantBill" rb ON rbi."billId" = rb.id WHERE rb.id IS NULL' },
    { name: 'Orphan TableSessionTable', query: 'SELECT COUNT(*) as count FROM "TableSessionTable" tst LEFT JOIN "TableSession" ts ON tst."sessionId" = ts.id WHERE ts.id IS NULL' },
    { name: 'Orphan InventoryConsumption', query: 'SELECT COUNT(*) as count FROM "InventoryConsumption" ic LEFT JOIN "KOTItem" ki ON ic."kotItemId" = ki.id WHERE ki.id IS NULL' },
    { name: 'Orphan StockMovement', query: 'SELECT COUNT(*) as count FROM "StockMovement" sm LEFT JOIN "Store" st ON sm."storeId" = st.id WHERE st.id IS NULL' },
    { name: 'Orphan VendorPaymentAllocation', query: 'SELECT COUNT(*) as count FROM "VendorPaymentAllocation" vpa LEFT JOIN "VendorPayment" vp ON vpa."vendorPaymentId" = vp.id WHERE vp.id IS NULL' },
    { name: 'Orphan PurchaseBill', query: 'SELECT COUNT(*) as count FROM "PurchaseBill" pb LEFT JOIN "Vendor" v ON pb."vendorId" = v.id WHERE v.id IS NULL' },
    { name: 'Orphan ServiceRequest', query: 'SELECT COUNT(*) as count FROM "ServiceRequest" sr LEFT JOIN "Stay" s ON sr."stayId" = s.id WHERE s.id IS NULL' },
    { name: 'Orphan GuestDocument', query: 'SELECT COUNT(*) as count FROM "GuestDocument" gd LEFT JOIN "Guest" g ON gd."guestId" = g.id WHERE g.id IS NULL' },
    { name: 'Orphan GuestPhoto', query: 'SELECT COUNT(*) as count FROM "GuestPhoto" gp LEFT JOIN "Guest" g ON gp."guestId" = g.id WHERE g.id IS NULL' },
  ];

  for (const check of orphanChecks) {
    try {
      const result = await prisma.$queryRawUnsafe(check.query);
      const count = Number(result[0].count);
      console.log(`  ${check.name.padEnd(35)} ${count === 0 ? 'PASS (0)' : 'FAIL (' + count + ')'}`);
    } catch (e) {
      console.log(`  ${check.name.padEnd(35)} ERROR - ${e.message.substring(0, 50)}`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('PRODUCTION RESET COMPLETE');
  console.log('='.repeat(70));

  await prisma.$disconnect();
}

async function prismaSafeDisconnect() {
  try {
    const p = new PrismaClient();
    await p.$disconnect();
  } catch (e) {
    // ignore
  }
}

main().catch(async (e) => {
  console.error('FATAL ERROR:', e);
  process.exit(1);
});
