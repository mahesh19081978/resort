# RESORT & RESTAURANT MANAGEMENT SYSTEM — BUSINESS DOMAIN MODEL

**System:** The Royal Reserve Resort Management System (PMS + POS + ERP)  
**Phase:** 0.2 Relational Domain Architecture  
**Database Engine:** PostgreSQL / Neon Serverless via Prisma ORM  

---

## 1. Executive Domain Summary

The business domain model spans 7 interconnected core subsystems:
1. **Property, Room Inventory & Dynamic Amenities (PMS)**
2. **Guest Profiles, Identity Documents & Webcam Verification**
3. **Reservations vs. Actual Stays vs. Physical Room Assignments**
4. **Folio Transactions & Unified Multi-Context Payments**
5. **Restaurant POS: 3 Channels, Table Grouping, KOTs & Split Billing**
6. **Multi-Department Store Inventory & Double-Entry Stock Movement Ledger**
7. **Procurement Lifecycle, Vendor Payables & RBAC Audit Engine**

---

## 2. Core Domain Principles

### 2.1 Reservation ≠ Stay ≠ Room Assignment ≠ Physical Room
* **Reservation (`Reservation`):** Commercial booking commitment agreed in advance for specific dates and room types. It holds financial rates, taxes, and deposit state.
* **Stay (`Stay`):** Actual operational guest stay that begins at physical check-in and ends at physical checkout. Tracks exact timestamps (`actualCheckIn`, `actualCheckOut`), which may diverge from original booking dates (e.g. early checkout or extended stay) without corrupting reservation history.
* **Room Assignment (`RoomAssignment`):** An associative, historical record binding a Stay to a Physical Room. If a guest moves from room `S-101` to `S-104`, the previous assignment is closed (`status = TRANSFERRED`), creating an audit trail of room moves.
* **Physical Room (`Room`):** The concrete physical asset (`S-101`, `D-201`) assigned to a specific floor, building, and room type with its own operational cleaning/maintenance state (`AVAILABLE`, `DIRTY`, `CLEANING`, `MAINTENANCE`, `OUT_OF_ORDER`).

### 2.2 Dynamic, Relational Room Amenities
* Amenities (`Amenity`) are independent database records with unique codes (`WIFI`, `AC`, `GEYSER`, `JACUZZI`).
* `RoomTypeAmenity` defines default amenity associations per room type (e.g. all Standard rooms have Wi-Fi, AC, and Geyser).
* `RoomAmenityOverride` allows physical rooms to override defaults with boolean flags (e.g., room `S-104` has `hasAmenity: false` for Geyser due to temporary plumbing repairs).

### 2.3 Running Guest Folio (Append-Only Transaction Ledger)
* Every active stay has exactly one primary `Folio`.
* All debits (nightly room charges, dining bills charged to room, spa treatments, extra blankets) and credits (advance deposits, card payments, manager discounts) are persisted as immutable `FolioItem` records.
* The balance is always verifiable by summing transactions: `totalBalance = sum(debits) - sum(credits)`.

### 2.4 Restaurant POS Decoupled Architecture
* **3 Order Channels (`OrderType`):** `DINE_IN`, `TAKE_AWAY`, `ROOM_SERVICE`.
* **Table Sessions (`TableSession`):** Dining sessions group one or more physical tables (`TableSessionTable`) to support joining tables (`T-01 + T-02`) without altering physical table identities.
* **Decoupled Entities:** `RestaurantOrder` (the commercial order) -> `KOT` (Kitchen Order Ticket routed to chefs) -> `RestaurantBill` (tax invoice) -> `Payment` or `FolioItem` (posting to room stay).

### 2.5 Multi-Store Stock Movement Ledger
* Inventory is department-agnostic (Warehouse, Kitchen Pantry, Bar, Housekeeping, Maintenance).
* Tracks raw ingredients, guest amenities, cleaning agents, and linen with unit conversions (`UnitConversion`: e.g. 1 KG = 1000 GM).
* Every stock alteration is recorded in `StockMovement` with type tags (`PURCHASE_RECEIPT`, `STOCK_ISSUE`, `TRANSFER_IN/OUT`, `WASTAGE`, `DAMAGE`, `RETURN`).

### 2.6 Procurement Pipeline
* `PurchaseRequest` (department request) -> `PurchaseOrder` (vendor commitment) -> `GoodsReceipt` (GRN with accepted/rejected/damaged counts) -> `PurchaseBill` (vendor payable) -> `VendorPaymentAllocation` (reconciling payments to bills).

---

## 3. Financial Architecture & Rules
1. All monetary values are defined as PostgreSQL `Decimal` (`@db.Decimal(12, 2)`). Zero IEEE 754 floating-point numbers are used for financial balances.
2. Direct mutation of bill totals or folio balances without an underlying ledger entry is prohibited.
3. Overpayments and refunds are recorded as explicit `Refund` records linked to parent payments.