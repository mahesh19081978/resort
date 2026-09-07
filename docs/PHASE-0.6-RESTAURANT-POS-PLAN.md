# PHASE 0.6: RESTAURANT POS + TABLE MANAGEMENT + KOT + KITCHEN + RESTAURANT BILLING + ROOM CHARGE INTEGRATION

## 1. Executive Summary & Existing Architecture Discovered

Infinity Resort and Restaurant (Indore, Madhya Pradesh, India) operates a production-grade enterprise PMS and Restaurant Management platform built with Next.js 16 (React 19), Prisma ORM (v6), PostgreSQL (Neon), TypeScript 5.8, and Tailwind CSS.

### Existing Architecture Audited:
1. **Prisma Schema & Domain Foundation**:
   - `Restaurant`: id, name, code, description, isActive.
   - `RestaurantTable`: id, restaurantId, tableNumber, capacity, section, status (`AVAILABLE`, `RESERVED`, `OCCUPIED`, `JOINED`, `BLOCKED`), isActive. Compound unique `[restaurantId, tableNumber]`.
   - `TableSession`: id, sessionCode, status (`ACTIVE`, `BILLED`, `CLOSED`, `CANCELLED`), guestName, paxCount, openedAt, closedAt.
   - `TableSessionTable`: M:N link table `[sessionId, tableId]`. Physical tables are never mutated or merged; sessions logically group multiple physical tables. Multi-table grouping is derived directly from `TableSessionTable`.
   - `MenuCategory` & `MenuItem`: Category hierarchy with display order, MenuItem code, price (`Decimal(10,2)`), taxRate (`Decimal(5,2)`), vegetarian flag, availability, kitchenStation.
   - `RestaurantOrder`: id, orderNumber, restaurantId, orderType (`DINE_IN`, `TAKE_AWAY`, `ROOM_SERVICE`), status (`PENDING`, `CONFIRMED`, `PREPARING`, `SERVED`, `DELIVERED`, `BILLED`, `COMPLETED`, `CANCELLED`), tableSessionId, stayId, roomId, notes.
   - `RestaurantOrderItem`: orderId, menuItemId, quantity, unitPrice (`Decimal(10,2)`), taxRate (`Decimal(5,2)`), notes.
   - `KOT`: id, kotNumber, orderId, status (`DRAFT`, `SENT`, `PREPARING`, `READY`, `SERVED`, `CANCELLED`), serverUserId, kitchenNote, preparedAt, readyAt, servedAt.
   - `KOTItem`: kotId, orderItemId, menuItemId, quantity, notes.
   - `RestaurantBill`: id, billNumber, orderId, status (`DRAFT`, `ISSUED`, `SETTLED`, `CHARGED_TO_ROOM`, `CANCELLED`, `SPLIT_CHILDREN`), subtotal, discountAmount, taxAmount, totalAmount (`Decimal(12,2)`), parentBillId, splitType (`EQUAL`, `BY_ITEM`, `CUSTOM_AMOUNT`).
   - `Folio` & `FolioItem`: 1:1 ledger per `Stay`. Folio item types include `RESTAURANT_CHARGE` and `ROOM_SERVICE_CHARGE`. Links to `restaurantOrderId` and `restaurantBillId`.
   - `Payment`: Context includes `RESTAURANT_BILL` and `FOLIO_SETTLEMENT`. Methods: `CASH`, `UPI`, `CARD`, `BANK_TRANSFER`, `ONLINE`. Status: `SUCCESS`, `PENDING`, `FAILED`, `REFUNDED`, `PARTIALLY_REFUNDED`, `VOIDED`.
   - `Recipe` & `RecipeIngredient`: MenuItem `1:1` Recipe `1:N` RecipeIngredient `N:1` InventoryItem.
   - `User`, `Role`, `Permission`, `RolePermission`: Centralized DB RBAC verified in live sessions.
   - `AuditLog`: Centralized audit ledger recording entity, entityId, oldValues, newValues, userId, timestamps.

---

## 2. Final Prisma Model & Schema Adjustments

To satisfy the revised enterprise requirements and protect financial and operational integrity:

1. **`RestaurantBillItem` (Split-Bill Persistence for BY_ITEM, EQUAL, CUSTOM_AMOUNT)**:
   - Introduce `RestaurantBillItem` to store explicit child bill allocations:
     ```prisma
     model RestaurantBillItem {
       id               String              @id @default(cuid())
       billId           String
       bill             RestaurantBill      @relation(fields: [billId], references: [id], onDelete: Cascade)
       orderItemId      String?
       orderItem        RestaurantOrderItem? @relation(fields: [orderItemId], references: [id], onDelete: SetNull)
       description      String
       quantity         Int                 @default(1)
       unitPrice        Decimal             @db.Decimal(10, 2)
       taxRate          Decimal             @db.Decimal(5, 2)
       amount           Decimal             @db.Decimal(12, 2)
       createdAt        DateTime            @default(now())

       @@index([billId])
       @@index([orderItemId])
     }
     ```
   - In `RestaurantBill`, add `items RestaurantBillItem[]`.
   - **Why**: Proves and persists exact child allocations in the database for `BY_ITEM` (explicit item and quantity allocated), `EQUAL` (equal proportional portions), and `CUSTOM_AMOUNT` (allocated ledger portions). Guarantees that the sum of child allocations reconciles exactly to parent totals with zero penny drift.

2. **Payment Idempotency Key**:
   - In `Payment`, add:
     ```prisma
     idempotencyKey String? @unique
     ```
   - **Why**: Database-level unique constraint prevents duplicate payment creation from duplicate network submissions, button double-clicks, or retry attempts.

3. **FolioItem Direct 1:1 Link to RestaurantBill with Conflict Handling**:
   - In `FolioItem`, maintain `restaurantBillId String? @unique` and `restaurantBill RestaurantBill? @relation(fields: [restaurantBillId], references: [id], onDelete: SetNull)`.
   - Application logic wraps posting in a transaction with explicit catch for `P2002` unique constraint violations and status checks to guarantee idempotent room-charge operations.

4. **KOT SLA Timestamps & Station Routing**:
   - In `KOT`: `preparedAt DateTime?`, `readyAt DateTime?`, `servedAt DateTime?`.
   - In `MenuItem`: `kitchenStation String? @default("MAIN_KITCHEN")`.

5. **Table Status Clarification (Eliminating Overuse of JOINED)**:
   - Multi-table grouping is derived logically from `TableSessionTable`.
   - `RestaurantTable.status` transitions strictly: `AVAILABLE` $\leftrightarrow$ `OCCUPIED` (and `RESERVED` / `BLOCKED`).
   - `JOINED` status is eliminated as a separate physical status since `TableSessionTable` associates multiple tables without mutating physical table identities.

---

## 3. Non-Negotiable Domain Model Separation

The conceptual chain must never be collapsed:
```
Restaurant --? RestaurantTable --? TableSession (groups 1..N physical tables via TableSessionTable)
                                          ¦
                                          ?
                                   RestaurantOrder (DINE_IN / TAKE_AWAY / ROOM_SERVICE)
                                          ¦
                                          +-? RestaurantOrderItem(s)
                                          ¦          ¦
                                          ¦          ?
                                          ¦      KOT(s) --? KOTItem(s) --? Kitchen Display
                                          ?
                                   RestaurantBill(s) --? RestaurantBillItem(s) [Persisted Allocations]
                                          ¦
                      +---------------------------------------+
                      ?                                       ?
        Payment(s) [Direct POS]                    FolioItem [Charged to Room]
     (CASH, UPI, CARD, etc. with                              ¦
       idempotency key)                                       ?
                                                        Guest Folio (Authoritative FolioItem Ledger)
                                                              ¦
                                                              ?
                                                     Checkout Settlement
```
- **Order $\neq$ Bill**: Multiple orders can belong to a session, or an order can produce split bills.
- **Bill $\neq$ Payment**: A bill is a financial claim; payment is actual monetary receipt.
- **Room Charge $\neq$ Payment**: Posting to a guest folio creates a `FolioItem` (charge debit). It does NOT create a Payment. The folio is settled during checkout.
- **Physical Tables are NOT merged**: Physical tables maintain distinct identity; `TableSessionTable` creates the logical group.

---

## 4. Final State Machines & Progression Rules

### 4.1. Table Status & Table Session Lifecycle
- `RestaurantTable.status`: `AVAILABLE` $\leftrightarrow$ `OCCUPIED` (or `RESERVED` / `BLOCKED`).
- Derived multi-table status: Derived from `TableSessionTable` count $> 1$.
- `TableSessionStatus`: `ACTIVE` $\rightarrow$ `BILLED` $\rightarrow$ `CLOSED` (or `CANCELLED`).
  - Concurrency rule: Cannot open a session on a table that already belongs to an `ACTIVE` session.
  - Session can only be `CLOSED` when all orders/bills are either settled, charged to room, or cancelled.

### 4.2. RestaurantOrder State Machine & Strict SERVED Condition
- Lifecycle: `PENDING` $\rightarrow$ `CONFIRMED` $\rightarrow$ `PREPARING` $\rightarrow$ `SERVED` $\rightarrow$ `BILLED` $\rightarrow$ `COMPLETED` (or `CANCELLED`).
- **Correction 1 Enforced**:
  - `RestaurantOrder.status` can ONLY transition to `SERVED` when **ALL non-cancelled fired KOT quantities are SERVED**.
  - If an order has multiple KOTs (e.g., KOT-1 for Starters, KOT-2 for Mains):
    - When KOT-1 is `SERVED` and KOT-2 is `PREPARING`, the order remains in `PREPARING`.
    - Only when both KOT-1 and KOT-2 reach `SERVED` (or terminal `CANCELLED` state with at least one served KOT), the order advances to `SERVED`.
    - If un-fired order items exist, order cannot be marked `SERVED` unless un-fired items are explicitly voided/cancelled via an authorized order amendment.

### 4.3. KOT State Machine & Incremental Firing Semantics
- Lifecycle: `DRAFT` $\rightarrow$ `SENT` $\rightarrow$ `PREPARING` $\rightarrow$ `READY` $\rightarrow$ `SERVED` (or `CANCELLED`).
- **Correction 9 Enforced (Incremental Firing Semantics)**:
  - **Immutability of Fired Quantities**: Once an order item quantity is fired in a KOT (`SENT`, `PREPARING`, `READY`, `SERVED`), that quantity cannot be destructively updated or reduced in `RestaurantOrderItem`.
  - **Additional Quantities**: Guests ordering more items creates either an additional `RestaurantOrderItem` or increments `quantity` and generates an **incremental KOT** for the difference.
  - **Reductions / Cancellations After Firing**: Any reduction of a fired quantity requires an explicit Kitchen Void / Cancellation workflow:
    - Checks whether kitchen has already prepared the food.
    - If `SENT` or `PREPARING`, requires `restaurant:order:cancel` permission.
    - If `READY` or `SERVED`, requires Manager override (`restaurant:table:manage` / `restaurant:order:cancel`) and records a mandatory audit reason.
    - KOTItem is marked cancelled or KOT status transitioned to `CANCELLED` with audit logging.

### 4.4. RestaurantBill State Machine & Payment Settled Rule
- Lifecycle: `DRAFT` $\rightarrow$ `ISSUED` $\rightarrow$ `SETTLED` (or `CHARGED_TO_ROOM` / `CANCELLED` / `SPLIT_CHILDREN`).
- **Correction 5 Enforced (Valid Payment Statuses)**:
  - Outstanding balance calculation strictly accounts for valid financial status:
    $$\text{Effective Paid} = \sum_{p \in \text{Payments}, p.status == \text{SUCCESS}} p.amount - \sum_{r \in \text{Refunds}, r.status == \text{PROCESSED}} r.amount$$
  - Payments with status `PENDING`, `FAILED`, or `VOIDED` contribute **0.00** to settlement.
  - A bill is marked `SETTLED` **only** when $\text{Effective Paid} \ge \text{bill.totalAmount}$.

---

## 5. Folio Financial Architecture & Authoritative Ledger Rule

- **Correction 2 Enforced (FolioItem is the Authoritative Ledger Entry)**:
  - In accordance with `docs/FOLIO.md`, `FolioItem` is the authoritative ledger source of truth.
  - `Folio.totalCharges`, `Folio.totalCredits`, and `Folio.totalBalance` are transactional caching columns updated atomically alongside `FolioItem` insertion/voiding.
  - Every calculation of balance verifies:
    $$\text{Net Balance} = \sum_{\text{charges}} \text{FolioItem.amount} - \sum_{\text{credits}} \text{FolioItem.amount} - \sum_{\text{payments}} \text{Payment.amount}$$
  - Room charges post a discrete `FolioItem` of type `ROOM_SERVICE_CHARGE` (or `RESTAURANT_CHARGE`) referencing `restaurantBillId` and `restaurantOrderId`.

---

## 6. Room Charge Idempotency & Concurrency Strategy

- **Correction 3 Enforced**:
  - **DB-Level Protection**: `FolioItem.restaurantBillId` has `@unique`.
  - **Application-Level Concurrency & Conflict Handling**:
    1. Read `RestaurantBill` and verify status is `ISSUED`.
    2. Check if a `FolioItem` with `restaurantBillId == bill.id` already exists.
    3. If found, return the existing folio charge idempotently without error or double-charging.
    4. If not found, attempt insertion within transaction.
    5. In case of concurrent race condition causing Prisma `P2002` (unique constraint violation on `restaurantBillId`), catch `P2002`, re-query the created `FolioItem`, and return the existing record cleanly.

---

## 7. Payment Idempotency Design

- **Correction 4 Enforced**:
  - Payment creation accepts a client-provided or generated `idempotencyKey` (UUIDv4/hash).
  - Schema defines `@unique` on `Payment.idempotencyKey`.
  - When payment is submitted:
    1. Check if `Payment` with given `idempotencyKey` already exists.
    2. If exists with `status == SUCCESS`, return existing payment data without creating a second record.
    3. If not found, insert inside transaction.
    4. If concurrent race condition triggers `P2002` on `idempotencyKey`, catch error, fetch existing payment record, and return it safely.
    5. Guarantees that browser retries or network replays never cause duplicate credit card or UPI debits.

---

## 8. Split Bill Persistence & Proof of Reconciliation

- **Correction 6 Enforced (Full Database Persistence for Split Bills)**:
  - All split bills are persisted in PostgreSQL using `RestaurantBill` (parent-child hierarchy) and `RestaurantBillItem` (line item allocations).
  - Supported Modes:
    1. **`EQUAL` Split**:
       - Divides total cents among $N$ parts.
       - Base amount assigned to parts $1 \dots N-1$; exact remainder allocated to portion $N$.
       - Persists `RestaurantBillItem` per child bill with proportional descriptions.
       - Proof invariant: $\sum_{k=1}^N \text{childBill}_k.\text{totalAmount} \equiv \text{parentBill}.\text{totalAmount}$.
    2. **`BY_ITEM` Split**:
       - Explicitly allocates specific `RestaurantOrderItem` portions to specific child bills.
       - Persists `RestaurantBillItem` for each allocated item with quantity, unitPrice, and taxRate snapshot.
       - Server validates: For every `RestaurantOrderItem`, $\sum \text{allocatedQty} \equiv \text{orderItem.quantity}$.
       - Calculates exact subtotal, tax, and total per child bill.
       - Proof invariant: $\sum \text{childBill}.\text{totalAmount} \equiv \text{parentBill}.\text{totalAmount}$.
    3. **`CUSTOM_AMOUNT` Split**:
       - Explicit amounts provided for each child bill.
       - Server rejects if $\sum \text{customAmounts} \neq \text{parentBill}.\text{totalAmount}$.
       - Persists `RestaurantBillItem` ledger portions.
       - Proof invariant: $\sum \text{customAmounts} \equiv \text{parentBill}.\text{totalAmount}$ with zero drift.

---

## 9. Inventory Boundary & Consumption Interface

- **Correction 8 Enforced**:
  - Phase 0.6 DOES NOT duplicate or pre-empt the Phase 0.7 Inventory Management module (purchasing, store transfers, physical stock audits, vendor bills).
  - Phase 0.6 establishes the clean consumption boundary:
    - When an order reaches terminal `SERVED` (or order completed), an event/interface `deductOrderRecipeStock(orderId)` is called.
    - If recipe BOM exists, records standard `StockMovement` of type `STOCK_ISSUE`.
    - No stock balances are mutated outside the authoritative stock movement ledger.
    - Adding items to cart or drafting an order never touches inventory.

---

## 10. Audit Logging Requirements

The following sensitive restaurant events are recorded via `recordAuditEvent`:
- `TABLE_SESSION_OPEN`: Session code, physical tables assigned, pax count.
- `TABLE_SESSION_ADD_TABLES`: Additional tables attached.
- `TABLE_SESSION_CLOSE`: Session closed, physical tables released to available.
- `RESTAURANT_ORDER_CREATE`: Order number, order type, line item count.
- `RESTAURANT_ORDER_CANCEL`: Order cancelled, reason, voided items.
- `KOT_FIRE`: KOT number, order ID, items fired.
- `KOT_STATUS_UPDATE`: KOT status transition, SLA timestamp, cancellation reason.
- `RESTAURANT_BILL_GENERATE`: Bill number, subtotal, discount, tax, grand total.
- `RESTAURANT_BILL_PAYMENT`: Payment number, amount, tender method, remaining balance.
- `RESTAURANT_ROOM_CHARGE_POST`: FolioItem ID, bill number, stay ID, room ID, amount.
- `RESTAURANT_BILL_SPLIT`: Parent bill ID, split type, child bills created.

---

## 11. Final Verification & Quality Gates

1. Automated Tests:
   - Table session open/join/close with concurrency collision checks.
   - Order creation across DINE_IN, TAKE_AWAY, ROOM_SERVICE.
   - Multiple KOTs per order, partial firing, overflow prevention.
   - Strict `SERVED` state verification (order remains `PREPARING` until all active KOTs are `SERVED`).
   - Incremental firing semantics (firing immutability & void permissions).
   - Authoritative billing calculation with Decimal arithmetic.
   - Multi-tender payments with payment idempotency key verification.
   - Split bill persistence and exact penny reconciliation (`EQUAL`, `BY_ITEM`, `CUSTOM_AMOUNT`).
   - Room charge posting with duplicate prevention and `P2002` conflict recovery.
   - Recipe BOM consumption boundary verification.
2. Quality Gates:
   - `npx prisma validate`
   - `npx prisma generate`
   - `npm run typecheck`
   - `npm run lint`
   - `npm run build`
