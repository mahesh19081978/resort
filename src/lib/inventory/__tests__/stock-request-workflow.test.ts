import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { Prisma, StockMovementType, StockRequestStatus, TransferStatus } from '@prisma/client';
import {
  createStockRequest,
  submitStockRequest,
  approveStockRequest,
  rejectStockRequest,
  cancelStockRequest,
  executeIssueAndTransfer,
  validateDepartmentStoreMapping,
} from '../request-service';
import { postStockMovement } from '../stock-ledger-service';
import { consumeKOTInventory } from '../consumption-service';
import { hasPermission } from '@/lib/permissions/rbac';

describe('STOCK REQUEST & INTERNAL STORE ISSUE WORKFLOW', { timeout: 35000 }, () => {
  let mainStore: { id: string; code: string };
  let kitchenStore: { id: string; code: string };
  let barStore: { id: string; code: string };
  let housekeepingStore: { id: string; code: string };
  let maintenanceStore: { id: string; code: string };
  let gardenStore: { id: string; code: string };

  let itemRice: { id: string; code: string; baseUnitId: string };
  let itemPaneer: { id: string; code: string; baseUnitId: string };
  let itemFlour: { id: string; code: string; baseUnitId: string };
  let adminUser: { id: string; role: any };

  beforeAll(async () => {
    // FAIL-CLOSED PERMANENT TEST DATABASE GUARD:
    // Integration tests MUST verify exact E2E isolated database identity and fail-closed.
    // They are strictly forbidden from targeting any non-E2E or production database.
    const dbUrl = process.env.DATABASE_URL || '';
    const isE2EMode = process.env.E2E_TEST_MODE === 'true';
    const isDesignatedE2EDatabase = dbUrl.includes('ep-aged-wind') && !dbUrl.includes('ep-frosty-hall');

    if (!isE2EMode || !isDesignatedE2EDatabase) {
      throw new Error(
        '[CRITICAL DATABASE SAFETY GUARD - FAIL CLOSED]\n' +
          'Refusing to execute mutating integration tests against this database.\n' +
          'Integration tests MUST be run with E2E_TEST_MODE=true and against the designated isolated E2E database (ep-aged-wind).\n' +
          `Current connection target does not match authorized isolated E2E database credentials.`
      );
    }

    // Ensure all 6 stores exist
    mainStore = await prisma.store.findUniqueOrThrow({ where: { code: 'STORE-MAIN' } });
    kitchenStore = await prisma.store.findUniqueOrThrow({ where: { code: 'STORE-KIT' } });
    barStore = await prisma.store.findUniqueOrThrow({ where: { code: 'STORE-BAR' } });
    housekeepingStore = await prisma.store.findUniqueOrThrow({ where: { code: 'STORE-HK' } });
    maintenanceStore = await prisma.store.findUniqueOrThrow({ where: { code: 'STORE-MAINT' } });
    gardenStore = await prisma.store.findUniqueOrThrow({ where: { code: 'STORE-GARDEN' } });

    // Ensure test items exist
    itemRice = await prisma.inventoryItem.findUniqueOrThrow({ where: { code: 'RAW-RICE-KAIMA' } });
    itemPaneer = await prisma.inventoryItem.findUniqueOrThrow({ where: { code: 'RAW-PANEER-FRESH' } });
    itemFlour = await prisma.inventoryItem.findUniqueOrThrow({ where: { code: 'RAW-MAIDA-FLOUR' } });

    adminUser = await prisma.user.findFirstOrThrow({ where: { role: 'SUPER_ADMIN' } });
  });

  // =========================================================================
  // 1. DEPARTMENT VS STORE VALIDATION & PERMISSION
  // =========================================================================
  describe('1. Department & Store Mapping Validation', () => {
    it('correctly maps Kitchen -> Central Store -> Kitchen Pantry', async () => {
      const mapping = await validateDepartmentStoreMapping('Kitchen');
      expect(mapping.sourceStore.code).toBe('STORE-MAIN');
      expect(mapping.destStore.code).toBe('STORE-KIT');
    });

    it('correctly maps Bar -> Bar Store, Housekeeping -> Housekeeping Store, Garden -> Garden Store', async () => {
      const barMapping = await validateDepartmentStoreMapping('Bar');
      expect(barMapping.destStore.code).toBe('STORE-BAR');

      const hkMapping = await validateDepartmentStoreMapping('Housekeeping');
      expect(hkMapping.destStore.code).toBe('STORE-HK');

      const gMapping = await validateDepartmentStoreMapping('Garden');
      expect(gMapping.destStore.code).toBe('STORE-GARDEN');
    });

    it('rejects unsupported department or invalid destination store override', async () => {
      await expect(validateDepartmentStoreMapping('Finance')).rejects.toThrow(/Unsupported requesting department/);
      await expect(validateDepartmentStoreMapping('Kitchen', barStore.id)).rejects.toThrow(/Invalid destination store/);
    });

    it('validates RBAC permissions for stock request creation and approval', () => {
      expect(hasPermission({ role: 'KITCHEN_STAFF' }, 'inventory:request:create')).toBe(true);
      expect(hasPermission({ role: 'KITCHEN_STAFF' }, 'inventory:request:approve')).toBe(false);
      expect(hasPermission({ role: 'STORE_MANAGER' }, 'inventory:request:create')).toBe(true);
      expect(hasPermission({ role: 'STORE_MANAGER' }, 'inventory:request:approve')).toBe(true);
      expect(hasPermission({ role: 'STORE_MANAGER' }, 'inventory:stock:transfer')).toBe(true);
    });
  });

  // =========================================================================
  // 2. REQUEST CREATION, SUBMISSION, REJECTION & CANCELLATION
  // =========================================================================
  describe('2. Request Creation & State Transitions', () => {
    it('creates request in DRAFT status without moving stock', async () => {
      const req = await createStockRequest({
        department: 'Kitchen',
        requestedById: adminUser.id,
        reason: 'Kitchen morning replenishment',
        submitImmediately: false,
        items: [
          { itemId: itemRice.id, requestedQty: '15.0000' },
        ],
      });

      expect(req.status).toBe(StockRequestStatus.DRAFT);
      expect(req.requestNumber).toMatch(/^SRQ-\d{8}-[A-F0-9]{6}$/);
      expect(req.items).toHaveLength(1);
      expect(req.items[0].requestedQty.toNumber()).toBe(15);
      expect(req.items[0].approvedQty.toNumber()).toBe(0);
    });

    it('rejects requests with duplicate items or non-positive quantities', async () => {
      await expect(
        createStockRequest({
          department: 'Kitchen',
          requestedById: adminUser.id,
          items: [
            { itemId: itemRice.id, requestedQty: '10.0000' },
            { itemId: itemRice.id, requestedQty: '5.0000' },
          ],
        })
      ).rejects.toThrow(/Duplicate item/);

      await expect(
        createStockRequest({
          department: 'Kitchen',
          requestedById: adminUser.id,
          items: [
            { itemId: itemRice.id, requestedQty: '0' },
          ],
        })
      ).rejects.toThrow(/greater than zero/);
    });

    it('submits a DRAFT request -> SUBMITTED without moving stock', async () => {
      const req = await createStockRequest({
        department: 'Bar',
        requestedById: adminUser.id,
        submitImmediately: false,
        items: [{ itemId: itemFlour.id, requestedQty: '5.0000' }],
      });

      const submitted = await submitStockRequest(req.id, adminUser.id);
      expect(submitted.status).toBe(StockRequestStatus.SUBMITTED);
    });

    it('allows rejecting a SUBMITTED request with mandatory reason', async () => {
      const req = await createStockRequest({
        department: 'Kitchen',
        requestedById: adminUser.id,
        submitImmediately: true,
        items: [{ itemId: itemRice.id, requestedQty: '20.0000' }],
      });

      await expect(
        rejectStockRequest({
          requestId: req.id,
          rejectedById: adminUser.id,
          rejectionReason: '',
        })
      ).rejects.toThrow(/Mandatory rejection reason/);

      const rejected = await rejectStockRequest({
        requestId: req.id,
        rejectedById: adminUser.id,
        rejectionReason: 'Excess inventory already present',
      });
      expect(rejected.status).toBe(StockRequestStatus.REJECTED);
      expect(rejected.rejectionReason).toBe('Excess inventory already present');
    });

    it('allows cancelling a request before approval', async () => {
      const req = await createStockRequest({
        department: 'Kitchen',
        requestedById: adminUser.id,
        submitImmediately: true,
        items: [{ itemId: itemRice.id, requestedQty: '5.0000' }],
      });

      const cancelled = await cancelStockRequest({
        requestId: req.id,
        cancelledById: adminUser.id,
        reason: 'Item no longer needed',
      });
      expect(cancelled.status).toBe(StockRequestStatus.CANCELLED);
    });
  });

  // =========================================================================
  // 3. APPROVAL & PARTIAL APPROVAL INVARIANTS
  // =========================================================================
  describe('3. Approval & Partial Approval Invariants', () => {
    it('approves a request in full -> APPROVED without moving stock', async () => {
      const req = await createStockRequest({
        department: 'Kitchen',
        requestedById: adminUser.id,
        submitImmediately: true,
        items: [{ itemId: itemRice.id, requestedQty: '20.0000' }],
      });

      const approved = await approveStockRequest({
        requestId: req.id,
        approvedById: adminUser.id,
        items: [{ itemId: itemRice.id, approvedQty: '20.0000' }],
      });

      expect(approved.status).toBe(StockRequestStatus.APPROVED);
      expect(approved.items[0].approvedQty.toNumber()).toBe(20);
    });

    it('supports partial approval (approvedQty < requestedQty) -> PARTIALLY_APPROVED', async () => {
      const req = await createStockRequest({
        department: 'Kitchen',
        requestedById: adminUser.id,
        submitImmediately: true,
        items: [{ itemId: itemRice.id, requestedQty: '30.0000' }],
      });

      const partiallyApproved = await approveStockRequest({
        requestId: req.id,
        approvedById: adminUser.id,
        items: [{ itemId: itemRice.id, approvedQty: '25.0000' }],
      });

      expect(partiallyApproved.status).toBe(StockRequestStatus.PARTIALLY_APPROVED);
      expect(partiallyApproved.items[0].requestedQty.toNumber()).toBe(30);
      expect(partiallyApproved.items[0].approvedQty.toNumber()).toBe(25);
    });

    it('strictly rejects approvedQty > requestedQty or negative approvedQty', async () => {
      const req = await createStockRequest({
        department: 'Kitchen',
        requestedById: adminUser.id,
        submitImmediately: true,
        items: [{ itemId: itemRice.id, requestedQty: '30.0000' }],
      });

      await expect(
        approveStockRequest({
          requestId: req.id,
          approvedById: adminUser.id,
          items: [{ itemId: itemRice.id, approvedQty: '35.0000' }],
        })
      ).rejects.toThrow(/cannot exceed requested quantity/);

      await expect(
        approveStockRequest({
          requestId: req.id,
          approvedById: adminUser.id,
          items: [{ itemId: itemRice.id, approvedQty: '-5.0000' }],
        })
      ).rejects.toThrow(/cannot be negative/);
    });
  });

  // =========================================================================
  // 4. REAL BUSINESS TEST: SPECIFICATION SECTION 38
  // Central: 100 KG -> Kitchen: 10 KG.
  // Request: 30 KG -> Approve: 30 KG -> Issue/Transfer: 30 KG.
  // Central: 70 KG, Kitchen: 40 KG. Request: FULFILLED.
  // KOT consumption: 2.5 KG -> Kitchen: 37.5 KG.
  // Total: 70 + 37.5 = 107.5 KG (110 - 2.5 = 107.5 KG).
  // =========================================================================
  describe('4. Real Business Test (Spec Section 38)', () => {
    it('executes atomic Issue / Transfer, preserves total resort inventory and supports KOT consumption', async () => {
      // 1. Baseline initialization
      // Clean previous test stock for itemRice in Central and Kitchen
      await prisma.stock.deleteMany({
        where: {
          storeId: { in: [mainStore.id, kitchenStore.id] },
          itemId: itemRice.id,
        },
      });

      await postStockMovement({
        storeId: mainStore.id,
        itemId: itemRice.id,
        movementType: StockMovementType.OPENING_BALANCE,
        quantity: 100.0,
        unitCost: 110.0,
        performedById: adminUser.id,
        remarks: 'Test: Central Store Opening 100 KG',
      });

      await postStockMovement({
        storeId: kitchenStore.id,
        itemId: itemRice.id,
        movementType: StockMovementType.OPENING_BALANCE,
        quantity: 10.0,
        unitCost: 110.0,
        performedById: adminUser.id,
        remarks: 'Test: Kitchen Pantry Opening 10 KG',
      });

      const initialMainStock = await prisma.stock.findUniqueOrThrow({
        where: { storeId_itemId: { storeId: mainStore.id, itemId: itemRice.id } },
      });
      const initialKitStock = await prisma.stock.findUniqueOrThrow({
        where: { storeId_itemId: { storeId: kitchenStore.id, itemId: itemRice.id } },
      });
      expect(initialMainStock.quantityOnHand.toNumber()).toBe(100);
      expect(initialKitStock.quantityOnHand.toNumber()).toBe(10);
      expect(initialMainStock.quantityOnHand.toNumber() + initialKitStock.quantityOnHand.toNumber()).toBe(110);

      // 2. Kitchen creates Stock Request: 30 KG
      const req = await createStockRequest({
        department: 'Kitchen',
        requestedById: adminUser.id,
        reason: 'Weekly kitchen replenishment',
        submitImmediately: true,
        items: [{ itemId: itemRice.id, requestedQty: '30.0000' }],
      });
      expect(req.status).toBe(StockRequestStatus.SUBMITTED);

      // 3. Store Manager approves 30 KG
      const approved = await approveStockRequest({
        requestId: req.id,
        approvedById: adminUser.id,
        items: [{ itemId: itemRice.id, approvedQty: '30.0000' }],
      });
      expect(approved.status).toBe(StockRequestStatus.APPROVED);

      // Verify stock did NOT change upon approval
      const postApprovalMain = await prisma.stock.findUniqueOrThrow({
        where: { storeId_itemId: { storeId: mainStore.id, itemId: itemRice.id } },
      });
      expect(postApprovalMain.quantityOnHand.toNumber()).toBe(100);

      // 4. Store Manager executes Issue / Transfer (atomic same-premises physical handover)
      const issueResult = await executeIssueAndTransfer({
        requestId: req.id,
        performedById: adminUser.id,
        remarks: 'Physical handover complete at Central Store desk',
      });

      expect(issueResult.success).toBe(true);
      expect(issueResult.request.status).toBe(StockRequestStatus.FULFILLED);
      expect(issueResult.transfer.status).toBe(TransferStatus.RECEIVED);

      // 5. Verify balances: Central: 70 KG, Kitchen: 40 KG
      const postTransferMain = await prisma.stock.findUniqueOrThrow({
        where: { storeId_itemId: { storeId: mainStore.id, itemId: itemRice.id } },
      });
      const postTransferKit = await prisma.stock.findUniqueOrThrow({
        where: { storeId_itemId: { storeId: kitchenStore.id, itemId: itemRice.id } },
      });

      expect(postTransferMain.quantityOnHand.toNumber()).toBe(70);
      expect(postTransferKit.quantityOnHand.toNumber()).toBe(40);

      // Transfer must NOT change total resort inventory: 70 + 40 = 110
      expect(postTransferMain.quantityOnHand.toNumber() + postTransferKit.quantityOnHand.toNumber()).toBe(110);

      // 6. Verify Ledger Movements: exactly 1 TRANSFER_OUT (-30) and 1 TRANSFER_IN (+30)
      const movements = await prisma.stockMovement.findMany({
        where: { transferId: issueResult.transfer.id },
        orderBy: { movementType: 'asc' },
      });
      expect(movements).toHaveLength(2);

      const inMov = movements.find((m) => m.movementType === StockMovementType.TRANSFER_IN);
      const outMov = movements.find((m) => m.movementType === StockMovementType.TRANSFER_OUT);

      expect(inMov).toBeDefined();
      expect(outMov).toBeDefined();
      expect(outMov!.storeId).toBe(mainStore.id);
      expect(outMov!.quantity.toNumber()).toBe(30);
      expect(outMov!.balanceBefore.toNumber()).toBe(100);
      expect(outMov!.balanceAfter.toNumber()).toBe(70);

      expect(inMov!.storeId).toBe(kitchenStore.id);
      expect(inMov!.quantity.toNumber()).toBe(30);
      expect(inMov!.balanceBefore.toNumber()).toBe(10);
      expect(inMov!.balanceAfter.toNumber()).toBe(40);

      // 7. Kitchen sells food requiring 2.5 KG Rice via direct stock issue or recipe consumption
      // Operational consumption: 40 -> 37.5 KG
      await postStockMovement({
        storeId: kitchenStore.id,
        itemId: itemRice.id,
        movementType: StockMovementType.STOCK_ISSUE,
        quantity: 2.5,
        performedById: adminUser.id,
        remarks: 'Kitchen KOT Consumption / Food prep: 2.5 KG Rice',
      });

      const finalMain = await prisma.stock.findUniqueOrThrow({
        where: { storeId_itemId: { storeId: mainStore.id, itemId: itemRice.id } },
      });
      const finalKit = await prisma.stock.findUniqueOrThrow({
        where: { storeId_itemId: { storeId: kitchenStore.id, itemId: itemRice.id } },
      });

      expect(finalMain.quantityOnHand.toNumber()).toBe(70);
      expect(finalKit.quantityOnHand.toNumber()).toBe(37.5);
      expect(finalMain.quantityOnHand.toNumber() + finalKit.quantityOnHand.toNumber()).toBe(107.5);
    });
  });

  // =========================================================================
  // 5. PARTIAL APPROVAL & SHORT ISSUE TEST (SPEC SECTION 39)
  // Requested: 30 KG -> Approved: 25 KG -> Issued: 25 KG
  // History: Requested: 30, Approved: 25, Issued: 25
  // =========================================================================
  describe('5. Partial Approval & Short Issue (Spec Section 39)', () => {
    it('preserves complete historical accuracy across Requested, Approved, and Issued', async () => {
      // Initialize Central Store with 100 KG Paneer, Kitchen with 10 KG Paneer
      await prisma.stock.deleteMany({
        where: {
          storeId: { in: [mainStore.id, kitchenStore.id] },
          itemId: itemPaneer.id,
        },
      });

      await postStockMovement({
        storeId: mainStore.id,
        itemId: itemPaneer.id,
        movementType: StockMovementType.OPENING_BALANCE,
        quantity: 100.0,
        unitCost: 320.0,
        performedById: adminUser.id,
      });
      await postStockMovement({
        storeId: kitchenStore.id,
        itemId: itemPaneer.id,
        movementType: StockMovementType.OPENING_BALANCE,
        quantity: 10.0,
        unitCost: 320.0,
        performedById: adminUser.id,
      });

      // Request 30 KG
      const req = await createStockRequest({
        department: 'Kitchen',
        requestedById: adminUser.id,
        submitImmediately: true,
        items: [{ itemId: itemPaneer.id, requestedQty: '30.0000' }],
      });

      // Store Manager approves 25 KG
      await approveStockRequest({
        requestId: req.id,
        approvedById: adminUser.id,
        items: [{ itemId: itemPaneer.id, approvedQty: '25.0000' }],
      });

      // Issue 25 KG
      const res = await executeIssueAndTransfer({
        requestId: req.id,
        performedById: adminUser.id,
      });

      expect(res.request.status).toBe(StockRequestStatus.FULFILLED);

      // Verify stock: Central = 75, Kitchen = 35
      const mainStock = await prisma.stock.findUniqueOrThrow({
        where: { storeId_itemId: { storeId: mainStore.id, itemId: itemPaneer.id } },
      });
      const kitStock = await prisma.stock.findUniqueOrThrow({
        where: { storeId_itemId: { storeId: kitchenStore.id, itemId: itemPaneer.id } },
      });
      expect(mainStock.quantityOnHand.toNumber()).toBe(75);
      expect(kitStock.quantityOnHand.toNumber()).toBe(35);

      // Verify historical audit data
      const finalReq = await prisma.stockRequest.findUniqueOrThrow({
        where: { id: req.id },
        include: { items: true, transfers: { include: { items: true } } },
      });
      expect(finalReq.items[0].requestedQty.toNumber()).toBe(30);
      expect(finalReq.items[0].approvedQty.toNumber()).toBe(25);
      expect(finalReq.transfers[0].items[0].receivedQty.toNumber()).toBe(25);
    });
  });

  // =========================================================================
  // 6. INSUFFICIENT STOCK & NEGATIVE STOCK REJECTION (SPEC SECTION 40)
  // =========================================================================
  describe('6. Insufficient Stock Protection (Spec Section 40)', () => {
    it('strictly prevents issuing when source store has insufficient stock', async () => {
      // Set Central Store Flour to exactly 10 KG
      await prisma.stock.deleteMany({
        where: { storeId: mainStore.id, itemId: itemFlour.id },
      });
      await postStockMovement({
        storeId: mainStore.id,
        itemId: itemFlour.id,
        movementType: StockMovementType.OPENING_BALANCE,
        quantity: 10.0,
        unitCost: 45.0,
        performedById: adminUser.id,
      });

      // Request 20 KG
      const req = await createStockRequest({
        department: 'Kitchen',
        requestedById: adminUser.id,
        submitImmediately: true,
        items: [{ itemId: itemFlour.id, requestedQty: '20.0000' }],
      });

      // Approver mistakenly approves 20 KG
      await approveStockRequest({
        requestId: req.id,
        approvedById: adminUser.id,
        items: [{ itemId: itemFlour.id, approvedQty: '20.0000' }],
      });

      // Attempt to issue 20 KG -> MUST FAIL
      await expect(
        executeIssueAndTransfer({
          requestId: req.id,
          performedById: adminUser.id,
        })
      ).rejects.toThrow(/Insufficient stock/);

      // Verify Central stock remains untouched at 10 KG
      const stock = await prisma.stock.findUniqueOrThrow({
        where: { storeId_itemId: { storeId: mainStore.id, itemId: itemFlour.id } },
      });
      expect(stock.quantityOnHand.toNumber()).toBe(10);
    });
  });

  // =========================================================================
  // 7. DUPLICATE ISSUE PROTECTION (SPEC SECTION 41)
  // =========================================================================
  describe('7. Duplicate Issue Protection (Spec Section 41)', () => {
    it('strictly prevents double execution of the same stock request', async () => {
      // Set Central Store Flour to 50 KG
      await prisma.stock.deleteMany({
        where: { storeId: mainStore.id, itemId: itemFlour.id },
      });
      await postStockMovement({
        storeId: mainStore.id,
        itemId: itemFlour.id,
        movementType: StockMovementType.OPENING_BALANCE,
        quantity: 50.0,
        unitCost: 45.0,
        performedById: adminUser.id,
      });

      const req = await createStockRequest({
        department: 'Kitchen',
        requestedById: adminUser.id,
        submitImmediately: true,
        items: [{ itemId: itemFlour.id, requestedQty: '10.0000' }],
      });
      await approveStockRequest({ requestId: req.id, approvedById: adminUser.id });

      // First issue succeeds
      const firstIssue = await executeIssueAndTransfer({
        requestId: req.id,
        performedById: adminUser.id,
      });
      expect(firstIssue.success).toBe(true);

      // Second issue attempt on the same fulfilled request -> MUST FAIL
      await expect(
        executeIssueAndTransfer({
          requestId: req.id,
          performedById: adminUser.id,
        })
      ).rejects.toThrow(/already been fulfilled/);
    });
  });

  // =========================================================================
  // 8. DEPARTMENT STOCK ISSUE FOR NON-RECIPE DEPARTMENTS (SPEC SECTION 20)
  // =========================================================================
  describe('8. Non-Recipe Department Stock Issue (Housekeeping, Maintenance, Garden)', () => {
    it('allows Garden Store to issue stock directly creating an authoritative STOCK_ISSUE movement', async () => {
      // Give Garden Store 20 KG of an item (e.g. Flour used as test consumable)
      await prisma.stock.deleteMany({
        where: { storeId: gardenStore.id, itemId: itemFlour.id },
      });
      await postStockMovement({
        storeId: gardenStore.id,
        itemId: itemFlour.id,
        movementType: StockMovementType.OPENING_BALANCE,
        quantity: 20.0,
        unitCost: 45.0,
        performedById: adminUser.id,
        remarks: 'Garden Store Initial Seed',
      });

      // Operational consumption / issue: 10 KG
      const issue = await postStockMovement({
        storeId: gardenStore.id,
        itemId: itemFlour.id,
        movementType: StockMovementType.STOCK_ISSUE,
        quantity: 10.0,
        performedById: adminUser.id,
        remarks: 'Garden Operations: Organic compost application',
      });

      expect(issue.movementType).toBe(StockMovementType.STOCK_ISSUE);
      expect(issue.balanceBefore.toNumber()).toBe(20);
      expect(issue.balanceAfter.toNumber()).toBe(10);

      const gardenStock = await prisma.stock.findUniqueOrThrow({
        where: { storeId_itemId: { storeId: gardenStore.id, itemId: itemFlour.id } },
      });
      expect(gardenStock.quantityOnHand.toNumber()).toBe(10);
    });
  });
});

