import { prisma } from '../src/lib/db/prisma';
import {
  openTableSession,
  closeTableSession,
  addTablesToSession,
} from '../src/lib/restaurant/session-service';
import {
  createRestaurantOrder,
  cancelRestaurantOrder,
} from '../src/lib/restaurant/order-service';
import {
  fireKOT,
  updateKOTStatus,
} from '../src/lib/restaurant/kot-service';
import {
  generateRestaurantBill,
  recordBillPayment,
  postBillToRoomCharge,
  splitRestaurantBill,
  calculateOrderFinancials,
} from '../src/lib/restaurant/billing-service';
import { deductOrderRecipeStock } from '../src/lib/restaurant/recipe-service';
import {
  OrderType,
  OrderStatus,
  TableStatus,
  TableSessionStatus,
  BillStatus,
  PaymentMethod,
  SplitType,
  Prisma,
} from '@prisma/client';

async function runTests() {
  console.log('?? Starting Comprehensive Phase 0.6 Automated Verification Tests...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`  ? PASS: ${desc}`);
      passed++;
    } else {
      console.error(`  ? FAIL: ${desc}`);
      failed++;
    }
  }

  try {
    // 0. Setup: Ensure a restaurant exists
    const restaurant = await prisma.restaurant.findFirst({
      where: { isActive: true },
      include: { tables: true, menus: { include: { items: true } } },
    });

    if (!restaurant) {
      throw new Error('No active restaurant found. Seed data must be run before tests.');
    }

    const testTable1 = restaurant.tables.find((t) => t.tableNumber === 'T-01') || restaurant.tables[0];
    const testTable2 = restaurant.tables.find((t) => t.tableNumber === 'T-02') || restaurant.tables[1];
    const menuItem1 = restaurant.menus[0]?.items[0];
    const menuItem2 = restaurant.menus[1]?.items[0] || restaurant.menus[0]?.items[1];

    if (!testTable1 || !testTable2 || !menuItem1 || !menuItem2) {
      throw new Error('Required tables or menu items missing from database.');
    }

    // Clean up any stale active sessions on test tables
    const staleSessions = await prisma.tableSession.findMany({
      where: {
        status: TableSessionStatus.ACTIVE,
        tables: { some: { tableId: { in: [testTable1.id, testTable2.id] } } },
      },
    });
    for (const s of staleSessions) {
      await closeTableSession({ sessionId: s.id, force: true });
    }

    // -------------------------------------------------------------
    // GROUP A: TABLES & SESSIONS
    // -------------------------------------------------------------
    console.log('\n--- Group A: Table Sessions & Concurrency ---');

    // Test 1: Open available table
    const openRes = await openTableSession({
      restaurantId: restaurant.id,
      tableIds: [testTable1.id],
      paxCount: 3,
      guestName: 'Dr. Mehta Party',
    });
    assert(Boolean(openRes.session.id), 'Open available table session');

    const checkTable1 = await prisma.restaurantTable.findUnique({ where: { id: testTable1.id } });
    assert(checkTable1?.status === TableStatus.OCCUPIED, 'Table status set to OCCUPIED');

    // Test 2: Prevent conflicting table session (Concurrency protection)
    let conflictCaught = false;
    try {
      await openTableSession({
        restaurantId: restaurant.id,
        tableIds: [testTable1.id],
        paxCount: 2,
      });
    } catch (e) {
      conflictCaught = true;
    }
    assert(conflictCaught, 'Prevent duplicate/conflicting active table session on same table');

    // Test 3: Add Table / Join Table logically (Physical tables not merged)
    const addTableRes = await addTablesToSession({
      sessionId: openRes.session.id,
      tableIds: [testTable2.id],
    });
    assert(addTableRes.success && addTableRes.totalTables === 2, 'Join table 2 to active session');

    const checkTable2 = await prisma.restaurantTable.findUnique({ where: { id: testTable2.id } });
    assert(checkTable2?.status === TableStatus.JOINED, 'Joined table status marked JOINED');

    // -------------------------------------------------------------
    // GROUP B: ORDERS & KOT
    // -------------------------------------------------------------
    console.log('\n--- Group B: Restaurant Orders & Multiple KOTs ---');

    // Test 4: Create DINE_IN order
    const dineInOrderRes = await createRestaurantOrder({
      restaurantId: restaurant.id,
      orderType: OrderType.DINE_IN,
      tableSessionId: openRes.session.id,
      items: [
        { menuItemId: menuItem1.id, quantity: 4, notes: 'Extra crispy' },
        { menuItemId: menuItem2.id, quantity: 2 },
      ],
      fireKOTImmediately: true,
      kitchenNote: 'VIP table, serve piping hot',
    });
    assert(Boolean(dineInOrderRes.order.id), 'Create DINE_IN order linked to table session');
    assert(Boolean(dineInOrderRes.kot?.id), 'Auto-fire initial KOT with order');

    // Test 5: Snapshot financial integrity (Never trust client, Decimal used)
    const orderItems = await prisma.restaurantOrderItem.findMany({
      where: { orderId: dineInOrderRes.order.id },
    });
    const item1Snapshot = orderItems.find((i) => i.menuItemId === menuItem1.id);
    assert(
      Boolean(item1Snapshot?.unitPrice.equals(menuItem1.price) && item1Snapshot?.taxRate.equals(menuItem1.taxRate)),
      'Snapshot accurate unit price & tax rate from database'
    );

    // Test 6: Partial KOT generation & Multiple KOTs per order
    // Order has 4x of menuItem1. Initial KOT consumed 4x.
    // Let's add a second order for partial testing:
    const takeAwayOrderRes = await createRestaurantOrder({
      restaurantId: restaurant.id,
      orderType: OrderType.TAKE_AWAY,
      items: [{ menuItemId: menuItem1.id, quantity: 5 }],
      fireKOTImmediately: false,
    });

    const kot1 = await fireKOT({
      orderId: takeAwayOrderRes.order.id,
      items: [{ orderItemId: takeAwayOrderRes.items[0].id, quantity: 3 }],
      kitchenNote: 'Fire 3 first',
    });
    assert(kot1.success && kot1.kot.items[0].quantity === 3, 'Fire partial KOT (3 out of 5 portions)');

    // Test 7: Fire second KOT for remaining 2 portions
    const kot2 = await fireKOT({
      orderId: takeAwayOrderRes.order.id,
      items: [{ orderItemId: takeAwayOrderRes.items[0].id, quantity: 2 }],
      kitchenNote: 'Fire remaining 2',
    });
    assert(kot2.success && kot2.kot.items[0].quantity === 2, 'Fire second KOT on same order (2 out of 5 portions)');

    // Test 8: Prevent KOT quantity exceeding ordered quantity
    let overflowCaught = false;
    try {
      await fireKOT({
        orderId: takeAwayOrderRes.order.id,
        items: [{ orderItemId: takeAwayOrderRes.items[0].id, quantity: 1 }],
      });
    } catch (e) {
      overflowCaught = true;
    }
    assert(overflowCaught, 'Prevent KOT quantity exceeding total ordered quantity');

    // Test 9: KOT State Transitions: SENT -> PREPARING -> READY -> SERVED
    const kotToProgress = kot1.kot.id;
    const prepRes = await updateKOTStatus({ kotId: kotToProgress, status: 'PREPARING' });
    assert(prepRes.kot.status === 'PREPARING' && Boolean(prepRes.kot.preparedAt), 'KOT transition to PREPARING with SLA timestamp');

    const readyRes = await updateKOTStatus({ kotId: kotToProgress, status: 'READY' });
    assert(readyRes.kot.status === 'READY' && Boolean(readyRes.kot.readyAt), 'KOT transition to READY with SLA timestamp');

    const servedRes = await updateKOTStatus({ kotId: kotToProgress, status: 'SERVED' });
    assert(servedRes.kot.status === 'SERVED' && Boolean(servedRes.kot.servedAt), 'KOT transition to SERVED with SLA timestamp');

    // Test 10: Reject invalid KOT transitions (e.g. SERVED -> PREPARING)
    let invalidTransitionCaught = false;
    try {
      await updateKOTStatus({ kotId: kotToProgress, status: 'PREPARING' });
    } catch (e) {
      invalidTransitionCaught = true;
    }
    assert(invalidTransitionCaught, 'Reject invalid backward KOT state transition (SERVED -> PREPARING)');

    // Test 10b: Strict SERVED State Verification (Guardrail 1)
    // takeAwayOrder has 5 items. kot1 had 3 items, kot2 had 2 items.
    // kot1 is SERVED, kot2 is still SENT. The order status must NOT be SERVED yet.
    const checkOrderPartiallyServed = await prisma.restaurantOrder.findUnique({
      where: { id: takeAwayOrderRes.order.id },
    });
    assert(
      checkOrderPartiallyServed?.status === 'PREPARING',
      'Order remains PREPARING when only subset of KOT quantities are served'
    );

    // Now progress kot2 to READY then SERVED
    await updateKOTStatus({ kotId: kot2.kot.id, status: 'PREPARING' });
    await updateKOTStatus({ kotId: kot2.kot.id, status: 'READY' });
    await updateKOTStatus({ kotId: kot2.kot.id, status: 'SERVED' });

    const checkOrderFullyServed = await prisma.restaurantOrder.findUnique({
      where: { id: takeAwayOrderRes.order.id },
    });
    assert(
      checkOrderFullyServed?.status === 'SERVED',
      'Order advances to SERVED strictly when ALL non-cancelled fired KOT quantities are SERVED'
    );

    // -------------------------------------------------------------
    // GROUP C: RESTAURANT BILLING & MULTI-TENDER PAYMENTS
    // -------------------------------------------------------------
    console.log('\n--- Group C: Authoritative Billing & Payment Settlements ---');

    // Test 11: Authoritative Server-side Bill calculation
    const calcResult = calculateOrderFinancials(
      [
        { quantity: 2, unitPrice: new Prisma.Decimal(100), taxRate: new Prisma.Decimal(5) },
        { quantity: 1, unitPrice: new Prisma.Decimal(200), taxRate: new Prisma.Decimal(5) },
      ],
      50
    );
    // subtotal = 400, tax = 20, discount = 50 -> total = 370
    assert(
      calcResult.subtotal.equals(new Prisma.Decimal(400)) &&
        calcResult.taxAmount.equals(new Prisma.Decimal(20)) &&
        calcResult.totalAmount.equals(new Prisma.Decimal(370)),
      'Deterministic Decimal calculation (Subtotal 400 + Tax 20 - Disc 50 = Total 370)'
    );

    // Test 12: Generate RestaurantBill for Dine-In order
    const billGenRes = await generateRestaurantBill({
      orderId: dineInOrderRes.order.id,
      discountAmount: 0,
    });
    assert(Boolean(billGenRes.bill.id) && billGenRes.bill.status === BillStatus.ISSUED, 'Generate RestaurantBill in ISSUED status');

    // Test 12b: Payment Idempotency Key (Guardrail 4)
    const testIdempotencyKey = `PAY-IDEM-${Date.now()}`;
    const firstIdemPay = await recordBillPayment({
      billId: billGenRes.bill.id,
      amount: 50,
      method: PaymentMethod.UPI,
      idempotencyKey: testIdempotencyKey,
    });
    assert(firstIdemPay.success, 'First payment with idempotency key succeeded');

    const retryIdemPay = await recordBillPayment({
      billId: billGenRes.bill.id,
      amount: 50,
      method: PaymentMethod.UPI,
      idempotencyKey: testIdempotencyKey,
    });
    assert(
      retryIdemPay.success && retryIdemPay.payment.id === firstIdemPay.payment.id,
      'Duplicate payment request with same idempotency key safely returns existing payment (no double charge)'
    );

    // Test 13: Partial Payment (Multi-tender)
    const billTotal = billGenRes.bill.totalAmount.toNumber();
    const halfPayment = Math.floor(billTotal / 2);
    const pay1 = await recordBillPayment({
      billId: billGenRes.bill.id,
      amount: halfPayment - 50, // deduct the 50 paid via idempotency test
      method: PaymentMethod.CASH,
      notes: 'Cash partial payment',
    });
    assert(
      pay1.success && !pay1.isFullySettled,
      `Partial cash payment recorded (Multi-tender progression)`
    );

    // Test 14: Prevent Overpayment
    let overpaymentCaught = false;
    try {
      await recordBillPayment({
        billId: billGenRes.bill.id,
        amount: billTotal + 500,
        method: PaymentMethod.UPI,
      });
    } catch (e) {
      overpaymentCaught = true;
    }
    assert(overpaymentCaught, 'Prevent overpayment exceeding outstanding bill balance');

    // Test 15: Exact final settlement (Tender 2: UPI)
    const currentBill = await prisma.restaurantBill.findUnique({
      where: { id: billGenRes.bill.id },
      include: { payments: true },
    });
    const paidSoFar = currentBill!.payments.reduce((s, p) => s + p.amount.toNumber(), 0);
    const remaining = billTotal - paidSoFar;
    const pay2 = await recordBillPayment({
      billId: billGenRes.bill.id,
      amount: remaining,
      method: PaymentMethod.UPI,
      transactionReference: 'UPI-INDORE-987654',
    });
    assert(
      pay2.success && pay2.isFullySettled && pay2.bill?.status === BillStatus.SETTLED,
      'Final multi-tender payment settles bill (Status: SETTLED, zero balance)'
    );

    // Test 16: Prevent further payments on settled bill
    let settledPaymentCaught = false;
    try {
      await recordBillPayment({
        billId: billGenRes.bill.id,
        amount: 10,
        method: PaymentMethod.CASH,
      });
    } catch (e) {
      settledPaymentCaught = true;
    }
    assert(settledPaymentCaught, 'Reject payment on already settled bill');

    // -------------------------------------------------------------
    // GROUP D: SPLIT BILLING (Zero Rounding Drift & BY_ITEM)
    // -------------------------------------------------------------
    console.log('\n--- Group D: Split Billing Reconciliations & Allocations ---');

    // Create fresh order & bill for split test
    const splitOrder = await createRestaurantOrder({
      restaurantId: restaurant.id,
      orderType: OrderType.TAKE_AWAY,
      items: [
        { menuItemId: menuItem1.id, quantity: 2 },
        { menuItemId: menuItem2.id, quantity: 1 },
      ],
      fireKOTImmediately: false,
    });
    const splitBill = await generateRestaurantBill({ orderId: splitOrder.order.id });

    // Test 17: Equal Split into 3 portions with exact cent reconciliation
    const splitRes = await splitRestaurantBill({
      parentBillId: splitBill.bill.id,
      splitType: SplitType.EQUAL,
      equalParts: 3,
    });
    assert(
      splitRes.success && splitRes.childBills.length === 3,
      'Split bill into 3 equal child portions'
    );

    const sumChildBills = splitRes.childBills.reduce(
      (s, c) => s.plus(c.totalAmount),
      new Prisma.Decimal(0)
    );
    assert(
      sumChildBills.equals(splitBill.bill.totalAmount),
      `Exact reconciliation of split sum (Sum: ${sumChildBills} === Parent: ${splitBill.bill.totalAmount})`
    );

    // Test 17b: BY_ITEM Split with Mathematical Auditability (Guardrail 1)
    const byItemOrder = await createRestaurantOrder({
      restaurantId: restaurant.id,
      orderType: OrderType.DINE_IN,
      tableSessionId: openRes.session.id,
      items: [
        { menuItemId: menuItem1.id, quantity: 2 },
        { menuItemId: menuItem2.id, quantity: 1 },
      ],
      fireKOTImmediately: false,
    });
    const byItemBill = await generateRestaurantBill({ orderId: byItemOrder.order.id });

    const item1 = byItemOrder.items[0];
    const item2 = byItemOrder.items[1];

    const byItemSplitRes = await splitRestaurantBill({
      parentBillId: byItemBill.bill.id,
      splitType: SplitType.BY_ITEM,
      itemAllocations: [
        { orderItemId: item1.id, quantity: 1, childBillIndex: 0 },
        { orderItemId: item1.id, quantity: 1, childBillIndex: 1 },
        { orderItemId: item2.id, quantity: 1, childBillIndex: 1 },
      ],
    });

    assert(
      byItemSplitRes.success && byItemSplitRes.childBills.length === 2,
      'BY_ITEM Split created 2 child bills with item allocations'
    );

    const dbAllocations = await prisma.restaurantBillAllocation.findMany({
      where: { billId: { in: byItemSplitRes.childBills.map((c) => c.id) } },
    });
    assert(
      dbAllocations.length === 3,
      'Persisted 3 explicit RestaurantBillAllocation records linking order items to child bills'
    );

    // -------------------------------------------------------------
    // GROUP E: ROOM SERVICE & PMS FOLIO INTEGRATION
    // -------------------------------------------------------------
    console.log('\n--- Group E: Room Service & Guest Folio Integration ---');

    // Find active in-house stay
    const inhouseStay = await prisma.stay.findFirst({
      where: {
        status: 'ACTIVE',
        roomAssignments: { some: { status: 'ACTIVE' } },
        folio: { isNot: null },
      },
      include: {
        roomAssignments: { where: { status: 'ACTIVE' }, include: { room: true } },
        folio: true,
      },
    });

    if (inhouseStay && inhouseStay.roomAssignments.length > 0 && inhouseStay.folio) {
      const activeRoom = inhouseStay.roomAssignments[0].room;

      // Test 18: Create ROOM_SERVICE order
      const roomOrderRes = await createRestaurantOrder({
        restaurantId: restaurant.id,
        orderType: OrderType.ROOM_SERVICE,
        stayId: inhouseStay.id,
        roomId: activeRoom.id,
        items: [{ menuItemId: menuItem1.id, quantity: 1, notes: 'Deliver to room' }],
        fireKOTImmediately: true,
      });
      assert(Boolean(roomOrderRes.order.id), 'Create valid ROOM_SERVICE order linked to active stay and room');

      // Test 19: Generate Bill for Room Service
      const roomBillRes = await generateRestaurantBill({ orderId: roomOrderRes.order.id });
      assert(Boolean(roomBillRes.bill.id), 'Generate bill for Room Service');

      // Test 20: Post Bill to Guest Folio (Atomic Room Charge)
      const roomChargeRes = await postBillToRoomCharge({
        billId: roomBillRes.bill.id,
        stayId: inhouseStay.id,
        roomId: activeRoom.id,
      });
      assert(
        roomChargeRes.success && roomChargeRes.bill.status === BillStatus.CHARGED_TO_ROOM,
        'Post restaurant bill to guest folio (Status: CHARGED_TO_ROOM)'
      );

      // Verify FolioItem exists and Folio total updated
      const updatedFolio = await prisma.folio.findUnique({
        where: { id: inhouseStay.folio.id },
        include: { items: true },
      });
      const postedItem = updatedFolio?.items.find((i) => i.restaurantBillId === roomBillRes.bill.id);
      assert(
        Boolean(postedItem && postedItem.amount.equals(roomBillRes.bill.totalAmount)),
        'FolioItem created with 1:1 restaurantBillId link and exact financial amount'
      );

      // Test 21: Duplicate Room Charge Protection (Idempotency & Guardrail 3)
      const dupChargeRes = await postBillToRoomCharge({
        billId: roomBillRes.bill.id,
        stayId: inhouseStay.id,
        roomId: activeRoom.id,
      });
      assert(
        dupChargeRes.success && dupChargeRes.alreadyProcessed === true,
        'Idempotency: Duplicate posting of same restaurant bill safely returns existing folio item (no duplicate debit)'
      );

      // Verify that folio ledger only has ONE FolioItem for this restaurant bill
      const folioItemsAfterDup = await prisma.folioItem.findMany({
        where: { restaurantBillId: roomBillRes.bill.id },
      });
      assert(
        folioItemsAfterDup.length === 1,
        'Database constraint guarantees exactly 1 FolioItem exists per RestaurantBill'
      );

      // Test 22: Confirm room charge creates NO direct Payment record
      const checkPayments = await prisma.payment.findMany({
        where: { restaurantBillId: roomBillRes.bill.id },
      });
      assert(
        checkPayments.length === 0,
        'Financial Integrity: Room charge posts FolioItem debit, NOT a Payment record'
      );
    } else {
      console.log('  ?? SKIP: No active in-house stay with active folio found for Room Service test.');
    }

    // -------------------------------------------------------------
    // GROUP F: RECIPE / BOM & INVENTORY BOUNDARY
    // -------------------------------------------------------------
    console.log('\n--- Group F: Recipe BOM & Inventory Boundary ---');

    // Find a menu item with a recipe
    const recipeItem = await prisma.menuItem.findFirst({
      where: { recipe: { isNot: null } },
      include: { recipe: { include: { ingredients: true } } },
    });

    if (recipeItem) {
      const bomOrder = await createRestaurantOrder({
        restaurantId: restaurant.id,
        orderType: OrderType.TAKE_AWAY,
        items: [{ menuItemId: recipeItem.id, quantity: 2 }],
        fireKOTImmediately: false,
      });

      const deductRes = await deductOrderRecipeStock({ orderId: bomOrder.order.id });
      assert(
        deductRes.success && deductRes.deductions.length > 0,
        `Recipe BOM calculation triggered StockMovement deduction (${deductRes.deductions.length} ingredients)`
      );
    } else {
      console.log('  ?? SKIP: No menu item with recipe found for BOM test.');
    }

    // -------------------------------------------------------------
    // GROUP G: TABLE SESSION CLOSE & RELEASE
    // -------------------------------------------------------------
    console.log('\n--- Group G: Session Closure & Table Release ---');

    const closeRes = await closeTableSession({ sessionId: openRes.session.id, force: true });
    assert(closeRes.success && closeRes.session.status === TableSessionStatus.CLOSED, 'Close table session');

    const releasedTable1 = await prisma.restaurantTable.findUnique({ where: { id: testTable1.id } });
    const releasedTable2 = await prisma.restaurantTable.findUnique({ where: { id: testTable2.id } });
    assert(
      releasedTable1?.status === TableStatus.AVAILABLE && releasedTable2?.status === TableStatus.AVAILABLE,
      'Both physical tables released back to AVAILABLE status upon session closure'
    );
  } catch (err) {
    console.error('?? Unexpected test runner error:', err);
    failed++;
  } finally {
    await prisma.$disconnect();
  }

  console.log('\n========================================');
  console.log(`Test Execution Summary: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
