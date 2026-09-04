# Front Desk & Stay Lifecycle Operations

## 1. Overview

The Front Desk module orchestrates the guest stay journey from reservation confirmation to departure. It coordinates between front-of-house staff, housekeeping, ledger billing, and property status machines.

The complete stay lifecycle follows the strict operational path:

```text
Reservation (CONFIRMED/PENDING)
       │
       ▼
Guest Identity & Webcam Verification
       │
       ▼
Eligible Physical Room Assignment (AVAILABLE/RESERVED)
       │
       ▼
Transactional Check-In (executeCheckIn)
  ├─ Stay created (status: ACTIVE, actualCheckIn = now())
  ├─ RoomAssignment created (status: ACTIVE)
  ├─ Physical Room transitioned: -> OCCUPIED
  ├─ Primary Folio initialized (status: OPEN)
  └─ Accommodation charge FolioItem posted
       │
       ▼
Active In-House Stay (Charges, Restaurant, Services)
       │
       ▼
Transactional Checkout (executeCheckOut)
  ├─ Decimal Ledger Balance calculation (Charges - Credits - Payments)
  ├─ Folio Settlement payment collected (context: FOLIO_SETTLEMENT)
  ├─ Zero balance enforced (balance <= 0)
  ├─ RoomAssignment ended (status: ENDED, releasedAt = now())
  ├─ Physical Room transitioned: OCCUPIED -> DIRTY
  ├─ Stay closed (status: CHECKED_OUT, actualCheckOut = now())
  └─ Folio settled (status: SETTLED)
```

---

## 2. Front Desk Console Submodules

1. **Dashboard Console (`/admin/frontdesk`)**:
   - Live KPI overview: Arrivals today, departures today, in-house active stays, and clean rooms available.
   - Physical room inventory status breakdown: AVAILABLE, OCCUPIED, DIRTY, CLEANING, MAINTENANCE/OOO.
   - Direct launchpads to Arrivals, In-House, and Departures consoles.

2. **Arrivals Console (`/admin/frontdesk/arrivals`)**:
   - Filtered listing of all reservations pending check-in with check-in date matching today or unfulfilled.
   - Single-click entry to the 4-step Check-In Wizard (`/admin/frontdesk/checkin/[reservationId]`).

3. **In-House Console (`/admin/frontdesk/inhouse`)**:
   - Real-time directory of all currently active stays (`status: ACTIVE`).
   - Displays assigned physical room, primary guest contact, arrival timestamp, expected departure date, running folio charges, and net ledger balance.
   - Quick link to settle folio and checkout.

4. **Departures Console (`/admin/frontdesk/departures`)**:
   - Departure queue for active stays scheduled for departure today.
   - Displays real-time folio balance status: Green for zero-balance departures, Red for unsettled departures requiring settlement collection.
   - One-click launch to Checkout & Folio Settlement (`/admin/frontdesk/checkout/[stayId]`).

---

## 3. RBAC Boundaries & Permissions

All Front Desk operations are strictly bounded by centralized permissions:

| Operation | Permission Required | Authorized Roles |
|:---|:---|:---|
| View Front Desk Dashboard & In-House | `booking:read` | `SUPER_ADMIN`, `ADMIN`, `RECEPTIONIST` |
| View Arrivals & Eligible Rooms | `checkin:perform` | `SUPER_ADMIN`, `ADMIN`, `RECEPTIONIST` |
| Execute Check-In Transaction | `checkin:perform` | `SUPER_ADMIN`, `ADMIN`, `RECEPTIONIST` |
| Execute Check-Out & Settle Folio | `checkout:perform` | `SUPER_ADMIN`, `ADMIN`, `RECEPTIONIST` |
| Upload Guest ID & Capture Photo | `guest:manage` | `SUPER_ADMIN`, `ADMIN`, `RECEPTIONIST` |
| View Raw Sensitive ID Document Numbers | `guest:view_sensitive` | `SUPER_ADMIN`, `ADMIN` (RECEPTIONIST cannot view) |
| Post Manual Folio Charge | `folio:update` | `SUPER_ADMIN`, `ADMIN`, `RECEPTIONIST` |

---

## 4. Concurrency & Integrity Guarantees

- **Room Double-Booking Protection**:
  Check-in queries physical room status within `prisma.$transaction`. If two receptionists attempt to check guests into the same room simultaneously, the transaction verifies active room assignments and room status: exactly one transaction succeeds while the other fails with `ROOM_ALREADY_OCCUPIED`.
- **Workflow-Owned Status Transitions**:
  Physical room transitions to `OCCUPIED` during check-in and transitions to `DIRTY` during checkout. Manual status overrides cannot circumvent active stay assignments.
- **Audit Logging**:
  All check-in, checkout, document upload, photo capture, and sensitive document accesses emit immutable `AuditLog` records containing actor ID, entity ID, and previous/new values.
