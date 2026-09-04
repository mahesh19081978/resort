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