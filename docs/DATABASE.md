# RESORT MANAGEMENT SYSTEM — DATABASE STRATEGY & STANDARDS

**Phase:** 0.2 Relational Domain Architecture  
**Database Engine:** PostgreSQL (Neon Serverless PostgreSQL in production)  
**ORM:** Prisma ORM v6.19.3  

---

## 1. Timezone & Date Strategy

### 1.1 Business Dates vs. Operational Timestamps
* **Business Dates (`@db.Date`):** Applied to `checkInDate` and `checkOutDate` on `Reservation`. These represent commercial hospitality days (e.g. 2026-09-04 to 2026-09-08) and are timezone-neutral.
* **Operational Timestamps (`DateTime` @default(now())):** Applied to operational events (`actualCheckIn`, `actualCheckOut`, `paymentDate`, `movementDate`, `assignedAt`, `postedAt`). Stored in UTC in PostgreSQL and formatted to the local resort operational timezone (`Asia/Kolkata` - IST +05:30) at the application display boundary.

---

## 2. Business Number Generation & Formats

Internal database primary keys are opaque CUID strings (`@id @default(cuid())`). Readable human-facing business codes are maintained as indexed unique strings:

| Entity | Pattern | Sample Identifier |
| :--- | :--- | :--- |
| **Reservation** | `RES-YYYYMMDD-XXXX` | `RES-20260904-0001` |
| **Stay** | `STY-YYYYMMDD-XXXX` | `STY-20260904-0001` |
| **Folio** | `FOL-YYYYMMDD-XXXX` | `FOL-20260904-0001` |
| **Payment** | `PAY-YYYYMMDD-XXXX` | `PAY-20260904-0001` |
| **Refund** | `REF-YYYYMMDD-XXXX` | `REF-20260904-0001` |
| **Restaurant Order** | `ORD-YYYYMMDD-XXXX` | `ORD-20260904-0001` |
| **KOT** | `KOT-YYYYMMDD-XXXX` | `KOT-20260904-0001` |
| **Restaurant Bill** | `BILL-YYYYMMDD-XXXX` | `BILL-20260904-0001` |
| **Table Session** | `TS-YYYYMMDD-XXXX` | `TS-20260904-0001` |
| **Stock Movement** | `SM-YYYYMMDD-XXXX` | `SM-20260904-0001` |
| **Stock Count / Audit** | `AUDIT-YYYYMMDD-XXXX` | `AUDIT-20260904-0001` |
| **Purchase Request** | `PR-YYYYMMDD-XXXX` | `PR-20260904-0001` |
| **Purchase Order** | `PO-YYYYMMDD-XXXX` | `PO-20260904-0001` |
| **Goods Receipt (GRN)**| `GRN-YYYYMMDD-XXXX` | `GRN-20260904-0001` |
| **Purchase Bill** | `PB-YYYYMMDD-XXXX` | `PB-20260904-0001` |
| **Vendor Payment** | `VP-YYYYMMDD-XXXX` | `VP-20260904-0001` |
| **Service Request** | `SRQ-YYYYMMDD-XXXX` | `SRQ-20260904-0001` |

---

## 3. Atomic Database Transactions (`prisma.$transaction`)

Multi-step business workflows must execute within Prisma transactions:
1. **Check-In:**
   - Create `Stay` record.
   - Create initial `RoomAssignment` (`status: ACTIVE`).
   - Create initial open `Folio`.
   - Update `Room` operational status to `OCCUPIED`.
   - Record advance payment (if collected at front desk).
   - Write `AuditLog` entry.

2. **Check-Out:**
   - Verify `Folio.totalBalance == 0.00` (or record final settlement `Payment`).
   - Update `Folio.status = SETTLED` and `CLOSED`.
   - Update `Stay.status = CHECKED_OUT` and stamp `actualCheckOut`.
   - Close active `RoomAssignment` (`status: ENDED`, stamp `releasedAt`).
   - Update `Room.status = DIRTY` to signal housekeeping.
   - Write `AuditLog` entry.

3. **Goods Receipt (GRN):**
   - Create `GoodsReceipt` and `GoodsReceiptItem` records.
   - For each accepted item quantity, create `StockMovement` (`movementType: PURCHASE_RECEIPT`) into receiving store.
   - Increment `Stock.quantityOnHand` and `InventoryItem.currentStockTotal`.
   - Update `PurchaseOrderItem.receivedQuantity` and PO status (`PARTIALLY_RECEIVED` or `FULLY_RECEIVED`).

4. **Restaurant Charge to Room Folio:**
   - Create `RestaurantBill` (`status: CHARGED_TO_ROOM`).
   - Create debit `FolioItem` on the guest's active `Folio`.
   - Recalculate `Folio.totalCharges` and `totalBalance`.
---

## 4. Production Integrity Rules

To guarantee enterprise robustness across PMS, POS, and ERP modules, the following non-negotiable rules must be enforced across all database services:

### 4.1 Booking Overlap & Inventory Enforcement
* Actual room availability enforcement is a **server-side transactional responsibility**, not merely a database unique constraint.
* When booking room types, queries must compute:
  $$\text{Reserved Inventory}(\text{RoomType}, [\text{Start}, \text{End}]) = \sum \text{ReservationRoom.roomsCount} \quad \text{for non-cancelled reservations}$$
  and verify:
  $$\text{Reserved Inventory} + \text{Requested Rooms} \le \text{RoomType.totalInventory}$$
* Concurrency during high-volume checkout or booking rushes must utilize Prisma `$transaction` with optimistic locking (version fields) or PostgreSQL `SELECT FOR UPDATE` advisory locks on the target `RoomType` inventory record.

### 4.2 Financial Precision & Ledger History
* All financial values use PostgreSQL `@db.Decimal(12, 2)` or `@db.Decimal(10, 2)`.
* Under no circumstance may JavaScript IEEE 754 floating-point arithmetic calculate authoritative balances.
* The guest folio ledger is strictly append-only. Voids are recorded as reversing ledger entries (`isVoided = true`, `voidReason`) and historical charges are never deleted.
* Reconciled totals on `Folio` (`totalCharges`, `totalCredits`, `totalBalance`) must always equal the aggregate of active `FolioItem` and `Payment` records.

### 4.3 Procurement vs. Inventory Stock Increase
* **A Purchase Order (`PurchaseOrder`) does NOT increase inventory stock.**
* Physical stock increases **only** when goods are physically received and inspected through a Goods Receipt Note (`GoodsReceipt` / GRN).
* For every accepted quantity on a GRN item, a corresponding `StockMovement` with type `PURCHASE_RECEIPT` is generated, which in turn updates `Stock.quantityOnHand` and `InventoryItem.currentStockTotal`.

### 4.4 Operational Room Status vs. Reservation Status
* Physical room condition (`PhysicalRoomStatus`: `AVAILABLE`, `OCCUPIED`, `DIRTY`, `CLEANING`, `MAINTENANCE`, `OUT_OF_ORDER`) is decoupled from booking status (`ReservationStatus`: `CONFIRMED`, `CHECKED_IN`, etc.).
* Housekeeping and Front Desk staff update physical room states during turnover; guest check-in cannot proceed to an uncleaned (`DIRTY`/`CLEANING`) or maintenance room without explicit manager override.

### 4.5 Concurrency-Safe Business Number Generation
* Business identifiers (`RES-`, `STY-`, `FOL-`, `PAY-`, `ORD-`, `KOT-`, `BILL-`, `PO-`, `GRN-`, `PB-`, `VP-`) must never rely on `count() + 1` due to race conditions.
* Numbers must be generated using atomic database sequences (PostgreSQL `SEQUENCE`) or a dedicated transactional sequence counter table (`SequenceNumberGenerator`) incremented atomically in a transaction.

### 4.6 Sensitive Guest Data & Document Authorization
* Guest identification documents (`GuestDocument`) and live webcam photos (`GuestPhoto`) contain sensitive personally identifiable information (PII).
* Raw document storage URLs (Vercel Blob) must never be returned in public API payloads. Document access is restricted to authenticated staff with `guest:view_sensitive` permissions through short-lived signed URLs.