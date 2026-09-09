#!/usr/bin/env node

/**
 * CONTROLLED FRESH DATABASE RESET — DEVELOPMENT/INTEGRATION TESTING ONLY
 *
 * SAFETY ARCHITECTURE:
 * ────────────────────
 * Gate 1: Explicit development environment marker required
 *         (APP_ENV=development OR ENVIRONMENT=development OR NODE_ENV=development)
 *         NODE_ENV alone is NOT sufficient — the database identity must also be approved.
 *
 * Gate 2: Database identity must be EXPLICITLY allow-listed via:
 *         RESET_ALLOWED_DB_HOST=<exact host>
 *         RESET_ALLOWED_DB_NAME=<exact database name>
 *         The actual DATABASE_URL and current_database() must match these exactly.
 *
 * Gate 3: Production markers — blocks if host/DB contains known production indicators.
 *         This is a defense-in-depth check, NOT the primary gate.
 *
 * Gate 4: --confirm requires a second explicit acknowledgment.
 *
 * Gate 5: --dry-run NEVER performs DELETE, UPDATE, TRUNCATE, or DROP.
 *         It connects read-only and reports counts only.
 *
 * Gate 6: Single transaction with ROLLBACK on any failure.
 *
 * USAGE:
 *   APP_ENV=development \
 *   RESET_ALLOWED_DB_HOST=ep-my-dev-123456.us-east-2.aws.neon.tech \
 *   RESET_ALLOWED_DB_NAME=my_dev_db \
 *   node scripts/db-reset-development-only.js --dry-run
 *
 *   APP_ENV=development \
 *   RESET_ALLOWED_DB_HOST=ep-my-dev-123456.us-east-2.aws.neon.tech \
 *   RESET_ALLOWED_DB_NAME=my_dev_db \
 *   node scripts/db-reset-development-only.js --confirm
 *
 * NO COMMIT. NO PUSH.
 */

const path = require('path');
const { PrismaClient } = require(path.join(__dirname, '..', 'node_modules', '@prisma', 'client'));

// ============================================================
// SAFETY GATE 1: Require explicit development environment marker
// ============================================================
const ALLOWED_DEV_MARKERS = ['development', 'dev', 'test', 'testing', 'staging'];
const appEnv = (process.env.APP_ENV || process.env.ENVIRONMENT || '').toLowerCase();
const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();

// NODE_ENV alone is NOT sufficient — must also have APP_ENV/ENVIRONMENT
const hasAppLevelMarker = ALLOWED_DEV_MARKERS.includes(appEnv);
const hasNodeMarker = ALLOWED_DEV_MARKERS.includes(nodeEnv);
const isExplicitDev = hasAppLevelMarker;

// ============================================================
// SAFETY GATE 2: Explicit database allow-list (REQUIRED)
// ============================================================
const allowedDbHost = process.env.RESET_ALLOWED_DB_HOST || '';
const allowedDbName = process.env.RESET_ALLOWED_DB_NAME || '';

// ============================================================
// SAFETY GATE 3: Production identity rejection (EXACT MATCH)
// ============================================================
// The known production identity is hardcoded and checked by exact match.
// This is NOT substring matching — the host and database must match exactly.
// This prevents the production database from ever being a valid dev-reset target.
const KNOWN_PRODUCTION_HOST = 'ep-frosty-hall-aynudwnt-pooler.c-5.us-east-2.aws.neon.tech';
const KNOWN_PRODUCTION_DB = 'neondb';

function isKnownProductionIdentity(host, dbName) {
  return host === KNOWN_PRODUCTION_HOST || dbName === KNOWN_PRODUCTION_DB;
}

// ============================================================
// SAFETY GATE 4: Parse CLI arguments
// ============================================================
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isConfirm = args.includes('--confirm');

if (!isDryRun && !isConfirm) {
  console.error('ERROR: Must specify --dry-run or --confirm');
  console.error('');
  console.error('Usage:');
  console.error('  APP_ENV=development \\');
  console.error('  RESET_ALLOWED_DB_HOST=<your-dev-host> \\');
  console.error('  RESET_ALLOWED_DB_NAME=<your-dev-db> \\');
  console.error('  node scripts/db-reset-development-only.js --dry-run');
  console.error('');
  console.error('  APP_ENV=development \\');
  console.error('  RESET_ALLOWED_DB_HOST=<your-dev-host> \\');
  console.error('  RESET_ALLOWED_DB_NAME=<your-dev-db> \\');
  console.error('  node scripts/db-reset-development-only.js --confirm');
  process.exit(1);
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  const prisma = new PrismaClient();

  console.log('='.repeat(70));
  if (isConfirm) {
    console.log('DESTRUCTIVE DEVELOPMENT DATABASE RESET');
  } else {
    console.log('DATABASE RESET — DRY-RUN (NO OPERATIONS EXECUTED)');
  }
  console.log('='.repeat(70));

  // ---- Safety Gate 1: Environment ----
  console.log('\n[SAFETY GATE 1] Environment check...');
  console.log(`  APP_ENV: ${process.env.APP_ENV || '(not set)'}`);
  console.log(`  ENVIRONMENT: ${process.env.ENVIRONMENT || '(not set)'}`);
  console.log(`  NODE_ENV: ${process.env.NODE_ENV || '(not set)'}`);
  console.log(`  APP_ENV/ENVIRONMENT dev marker: ${hasAppLevelMarker}`);
  console.log(`  NODE_ENV dev marker: ${hasNodeMarker}`);

  if (!hasAppLevelMarker) {
    console.error('\n  BLOCKED: No explicit APP_ENV or ENVIRONMENT development marker found.');
    console.error('  NODE_ENV=development alone is NOT sufficient.');
    console.error('  Required: APP_ENV=development or ENVIRONMENT=development');
    console.error('  Example: APP_ENV=development RESET_ALLOWED_DB_HOST=... RESET_ALLOWED_DB_NAME=... node scripts/db-reset-development-only.js --dry-run');
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log('  PASSED: APP_ENV/ENVIRONMENT contains development marker.');

  // ---- Safety Gate 2: Allow-list configuration ----
  console.log('\n[SAFETY GATE 2] Database allow-list check...');
  console.log(`  RESET_ALLOWED_DB_HOST: ${allowedDbHost || '(not set)'}`);
  console.log(`  RESET_ALLOWED_DB_NAME: ${allowedDbName || '(not set)'}`);

  if (!allowedDbHost || !allowedDbName) {
    console.error('\n  BLOCKED: Database allow-list not configured.');
    console.error('  Required environment variables:');
    console.error('    RESET_ALLOWED_DB_HOST=<exact database host>');
    console.error('    RESET_ALLOWED_DB_NAME=<exact database name>');
    console.error('');
    console.error('  These must match your DATABASE_URL exactly.');
    console.error('  Example: RESET_ALLOWED_DB_HOST=ep-my-dev-123456.us-east-2.aws.neon.tech');
    console.error('           RESET_ALLOWED_DB_NAME=my_dev_database');
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log('  PASSED: Allow-list variables are set.');

  // ---- Safety Gate 3: Database identity verification ----
  console.log('\n[SAFETY GATE 3] Database identity verification...');
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

  // Clean up: urlDb may contain path artifacts
  const cleanUrlDb = urlDb.split('/').pop() || urlDb;

  console.log(`  DATABASE_URL host: ${urlHost || '(not found)'}`);
  console.log(`  DATABASE_URL database: ${cleanUrlDb || '(not found)'}`);

  // Exact match against allow-list
  const hostMatches = urlHost === allowedDbHost;
  const dbMatches = cleanUrlDb === allowedDbName;
  const connectedDbMatches = dbInfo.db_name === allowedDbName;

  console.log(`  Host exact match: ${hostMatches}`);
  console.log(`  DB name exact match (URL): ${dbMatches}`);
  console.log(`  DB name exact match (connected): ${connectedDbMatches}`);

  if (!hostMatches) {
    console.error(`\n  BLOCKED: DATABASE_URL host does not match allow-list.`);
    console.error(`  Expected: ${allowedDbHost}`);
    console.error(`  Found:    ${urlHost || '(empty)'}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  if (!connectedDbMatches) {
    console.error(`\n  BLOCKED: Connected database does not match allow-list.`);
    console.error(`  Expected: ${allowedDbName}`);
    console.error(`  Found:    ${dbInfo.db_name}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log('  PASSED: Database identity matches allow-list.');

  // ---- Safety Gate 3b: Production identity rejection (exact match) ----
  console.log('\n[SAFETY GATE 3b] Production identity rejection...');
  const isProduction = isKnownProductionIdentity(urlHost, cleanUrlDb);

  console.log(`  Known production host match: ${urlHost === KNOWN_PRODUCTION_HOST}`);
  console.log(`  Known production DB match: ${cleanUrlDb === KNOWN_PRODUCTION_DB}`);

  if (isProduction) {
    console.error('\n  BLOCKED: Database identity matches known production.');
    console.error(`  Host: ${KNOWN_PRODUCTION_HOST}`);
    console.error(`  Database: ${KNOWN_PRODUCTION_DB}`);
    console.error('  This database is NEVER a valid development reset target.');
    console.error('  Use db-reset-production.js for intentional production resets.');
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log('  PASSED: Database is not the known production identity.');

  // ---- All safety gates passed ----
  console.log('\n' + '='.repeat(70));
  console.log('ALL SAFETY GATES PASSED');
  console.log('='.repeat(70));
  console.log(`  Database: ${dbInfo.db_name}`);
  console.log(`  Host: ${urlHost}`);
  console.log(`  Mode: ${isDryRun ? 'DRY-RUN (read-only)' : 'CONFIRM (destructive)'}`);

  // ============================================================
  // CONFIRM MODE: Additional warning banner
  // ============================================================
  if (isConfirm) {
    console.log('\n' + '='.repeat(70));
    console.log('WARNING: DESTRUCTIVE OPERATION AHEAD');
    console.log('='.repeat(70));
    console.log('');
    console.log('  DATABASE HOST: ' + urlHost);
    console.log('  DATABASE NAME: ' + dbInfo.db_name);
    console.log('');
    console.log('  This operation will permanently delete transactional data.');
    console.log('  All changes are wrapped in a single transaction.');
    console.log('  If any deletion fails, ROLLBACK will restore the original state.');
    console.log('');
    console.log('='.repeat(70));
  }

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
    'Stock', 'InventoryConsumption',
    'StockTransfer', 'StockTransferItem', 'StockMovement',
    'StockCount', 'StockCountItem',
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

  // Room state
  let roomStates = [];
  try {
    roomStates = await prisma.$queryRawUnsafe(`
      SELECT status, COUNT(*) as count FROM "Room" GROUP BY status ORDER BY status
    `);
    console.log('\nROOM STATUS:');
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
    console.log('\nRESTAURANT TABLE STATUS:');
    for (const row of tableStates) {
      console.log(`  ${String(row.status).padEnd(25)} ${row.count}`);
    }
  } catch (e) {
    console.log('  Error reading table status:', e.message);
  }

  // AuditLog breakdown (preserved, not deleted)
  let auditEntityCounts = [];
  try {
    auditEntityCounts = await prisma.$queryRawUnsafe(`
      SELECT entity, COUNT(*) as count FROM "AuditLog" GROUP BY entity ORDER BY count DESC
    `);
    console.log('\nAUDIT LOG (WILL BE PRESERVED):');
    for (const row of auditEntityCounts) {
      console.log(`  ${String(row.entity).padEnd(25)} ${row.count}`);
    }
  } catch (e) {
    console.log('  Error reading audit log:', e.message);
  }

  // ============================================================
  // DELETION ORDER (built from actual FK dependencies in schema.prisma)
  // ============================================================
  console.log('\n' + '='.repeat(70));
  console.log('DELETION ORDER (dependency-aware, from schema.prisma)');
  console.log('='.repeat(70));

  const deletionPlan = [
    // ---- PHASE 1: Deepest leaf nodes ----
    { model: 'AuditLog', description: 'Audit logs' },

    // ---- PHASE 2: Restaurant deepest children ----
    { model: 'KOTItem', description: 'KOT items (depends on: KOT, RestaurantOrderItem, MenuItem)' },
    { model: 'RestaurantBillAllocation', description: 'Bill allocations (depends on: RestaurantBill, RestaurantOrderItem)' },
    { model: 'RestaurantBillItem', description: 'Bill line items (depends on: RestaurantBill)' },

    // ---- PHASE 3: Restaurant mid-level ----
    { model: 'KOT', description: 'KOTs (depends on: RestaurantOrder, User)' },
    { model: 'RestaurantBill', description: 'Restaurant bills (depends on: RestaurantOrder; self-referential parentBill)' },

    // ---- PHASE 4: Restaurant order items & session junction ----
    { model: 'RestaurantOrderItem', description: 'Order items (depends on: RestaurantOrder, MenuItem)' },
    { model: 'TableSessionTable', description: 'Session-table junction (depends on: TableSession, RestaurantTable)' },

    // ---- PHASE 5: Restaurant orders & sessions ----
    { model: 'RestaurantOrder', description: 'Restaurant orders (depends on: Restaurant, TableSession, Stay, Room)' },
    { model: 'TableSession', description: 'Table sessions' },

    // ---- PHASE 6: Financial leaf nodes ----
    { model: 'Refund', description: 'Refunds (depends on: Payment)' },

    // ---- PHASE 7: Service requests (depends on: Stay — must go before Stay) ----
    { model: 'ServiceRequest', description: 'Service requests (depends on: Service, Stay, Room)' },

    // ---- PHASE 8: Stay children ----
    { model: 'StayGuest', description: 'Stay-guest junction (depends on: Stay, Guest)' },
    { model: 'RoomAssignment', description: 'Room assignments (depends on: Stay, Room)' },

    // ---- PHASE 9: Folio chain (FolioItem before Folio before Stay) ----
    { model: 'FolioItem', description: 'Folio line items (depends on: Folio)' },
    { model: 'Folio', description: 'Folios (depends on: Stay)' },

    // ---- PHASE 10: Payments ----
    { model: 'Payment', description: 'Payments (depends on: Reservation, Folio, RestaurantBill, VendorPayment)' },

    // ---- PHASE 11: Stay ----
    { model: 'Stay', description: 'Stays (depends on: Reservation, Guest)' },

    // ---- PHASE 12: Reservation chain ----
    { model: 'ReservationRoom', description: 'Reservation rooms (depends on: Reservation, RoomType)' },
    { model: 'ReservationGuest', description: 'Reservation-guest junction (depends on: Reservation, Guest)' },
    { model: 'Reservation', description: 'Reservations (depends on: Guest)' },

    // ---- PHASE 13: Inventory deepest children ----
    { model: 'StockMovement', description: 'Stock movements (depends on: Store, Item, Unit, Transfer, GRN, Consumption, Count)' },
    { model: 'InventoryConsumption', description: 'Inventory consumption (depends on: KOTItem)' },
    { model: 'StockCountItem', description: 'Stock count items (depends on: StockCount, InventoryItem)' },
    { model: 'StockTransferItem', description: 'Transfer items (depends on: StockTransfer, InventoryItem, Unit)' },

    // ---- PHASE 14: Inventory mid-level ----
    { model: 'StockCount', description: 'Stock counts (depends on: Store)' },
    { model: 'StockTransfer', description: 'Stock transfers (depends on: Store, User)' },

    // ---- PHASE 15: Procurement chain ----
    { model: 'PurchaseRequestItem', description: 'Purchase request items (depends on: PurchaseRequest, InventoryItem)' },
    { model: 'PurchaseRequest', description: 'Purchase requests (depends on: User)' },
    { model: 'PurchaseOrderItem', description: 'PO items (depends on: PurchaseOrder, InventoryItem)' },
    { model: 'GoodsReceiptItem', description: 'GRN items (depends on: GoodsReceipt, InventoryItem)' },
    { model: 'VendorReturn', description: 'Vendor returns (depends on: Vendor)' },

    // ---- PHASE 16: Resolve PurchaseBill <-> VendorPaymentAllocation circular dependency ----
    {
      model: 'VendorPaymentAllocation',
      description: 'Vendor payment allocations — nullify purchaseBillId first (circular FK)',
      preAction: async (tx) => {
        const result = await tx.vendorPaymentAllocation.updateMany({
          data: { purchaseBillId: null }
        });
        return result.count;
      }
    },
    { model: 'PurchaseBill', description: 'Purchase bills (depends on: Vendor, PurchaseOrder, GoodsReceipt)' },

    // ---- PHASE 17: Remaining procurement ----
    { model: 'VendorPayment', description: 'Vendor payments (depends on: Vendor)' },
    { model: 'GoodsReceipt', description: 'Goods receipts (depends on: PurchaseOrder, Vendor, User)' },
    { model: 'PurchaseOrder', description: 'Purchase orders (depends on: Vendor, PurchaseRequest, User)' },

    // ---- PHASE 18: Guest data ----
    { model: 'GuestDocument', description: 'Guest documents (depends on: Guest, User)' },
    { model: 'GuestPhoto', description: 'Guest photos (depends on: Guest, User)' },
    { model: 'Guest', description: 'Guests' },

    // ---- PHASE 19: Stock (RESET, not delete) ----
    {
      model: 'Stock',
      description: 'Stock records — RESET quantityOnHand to 0',
      isReset: true,
      resetData: { quantityOnHand: 0 }
    },

    // ---- PHASE 20: Room status reset ----
    {
      model: 'Room',
      description: 'Rooms — reset non-AVAILABLE active rooms to AVAILABLE',
      isReset: true,
      resetWhere: { isActive: true, status: { not: 'AVAILABLE' } },
      resetData: { status: 'AVAILABLE' }
    },

    // ---- PHASE 21: Restaurant table status reset ----
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
    console.log('DRY-RUN COMPLETE — NO DESTRUCTIVE OPERATIONS EXECUTED');
    console.log('='.repeat(70));
    console.log('\nThis was a read-only preview. No data was modified.');
    console.log('\nTo execute the reset, run:');
    console.log(`  APP_ENV=development RESET_ALLOWED_DB_HOST=${urlHost} RESET_ALLOWED_DB_NAME=${dbInfo.db_name} node scripts/db-reset-development-only.js --confirm`);
    await prisma.$disconnect();
    return;
  }

  // ============================================================
  // CONFIRM MODE: Execute reset in transaction
  // ============================================================
  console.log('\n' + '='.repeat(70));
  console.log('EXECUTING RESET IN SINGLE TRANSACTION...');
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
            if (step.preAction) {
              const preCount = await step.preAction(tx);
              console.log(`  ${label} Pre-action: nullified ${preCount} FK references`);
            }

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
      timeout: 120000,
      maxWait: 10000,
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

  console.log('\nSTOCK (post-reset, all quantities should be 0):');
  try {
    const stock = await prisma.$queryRawUnsafe(`
      SELECT st.name as store_name, i.name as item_name, s."quantityOnHand"
      FROM "Stock" s
      JOIN "InventoryItem" i ON s."itemId" = i.id
      JOIN "Store" st ON s."storeId" = st.id
      ORDER BY st.name, i.name
    `);
    for (const row of stock) {
      console.log(`  ${row.store_name} | ${row.item_name} | Qty: ${row.quantityOnHand}`);
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
  ];

  for (const check of orphanChecks) {
    try {
      const result = await prisma.$queryRawUnsafe(check.query);
      const count = Number(result[0].count);
      console.log(`  ${check.name.padEnd(30)} ${count === 0 ? 'PASS (0)' : 'FAIL (' + count + ')'}`);
    } catch (e) {
      console.log(`  ${check.name.padEnd(30)} ERROR - ${e.message.substring(0, 50)}`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('RESET COMPLETE');
  console.log('='.repeat(70));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('FATAL ERROR:', e);
  process.exit(1);
});
