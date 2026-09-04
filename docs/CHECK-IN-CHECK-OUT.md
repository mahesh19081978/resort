# Check-In & Check-Out Workflows

## 1. Check-In Operational Workflow

### Step-by-Step Flow:

1. **Reservation Selection**:
   - The receptionist selects a pending or confirmed reservation from the Arrivals list (`/admin/frontdesk/arrivals`).
   - System verifies reservation has not already been completed, cancelled, or checked in.

2. **Eligible Room Matching**:
   - The system retrieves all rooms that:
     - Match the reserved `roomTypeId`
     - Have `isActive = true`
     - Have `status IN ('AVAILABLE', 'RESERVED')`
     - Have **no active room assignment** (`RoomAssignment.status = 'ACTIVE'`)
     - Are **not** in `DIRTY`, `CLEANING`, `MAINTENANCE`, or `OUT_OF_ORDER` statuses
   - Receptionist selects a specific physical room (e.g. Room 204).

3. **Identity Verification**:
   - Receptionist records government-issued ID details (`AADHAAR`, `PASSPORT`, `DRIVING_LICENSE`, `VOTER_ID`, `OTHER`).
   - Server-side validates format, document number, and securely stores the document reference in the vault (`vault://docs/...`).

4. **Live Webcam Photo Capture**:
   - Front desk initiates HTML5 browser webcam feed (`navigator.mediaDevices.getUserMedia`).
   - Captures 640x480 photo of guest face, generates secure vault storage reference (`ref:guest-webcam:...`).

5. **Atomic Execution (`executeCheckIn`)**:
   Within a single `prisma.$transaction`:
   - Re-checks room status and active assignments to prevent concurrent check-in collisions.
   - Creates `Stay` with `stayNumber` (`STY-YYYYMMDD-XXXX`), `status = ACTIVE`, and `actualCheckIn = now()`.
   - Creates `RoomAssignment` with `status = ACTIVE` linking `Stay` and `Room`.
   - Updates physical `Room.status` to `OCCUPIED`.
   - Creates primary `Folio` with `status = OPEN`.
   - Posts base accommodation `FolioItem` (`itemType = ROOM_CHARGE`).
   - Updates reservation status to `CONFIRMED` if it was `PENDING`.
   - Emits immutable `AuditLog` event (`CHECKIN_COMPLETED`).

---

## 2. Check-Out Operational Workflow

### Step-by-Step Flow:

1. **Stay Selection**:
   - Receptionist selects an active stay from the Departures queue (`/admin/frontdesk/departures`).

2. **Ledger Balance Verification**:
   - System aggregates all unvoided `FolioItem` records into `totalCharges`.
   - System aggregates all unvoided credit items into `totalCredits`.
   - System aggregates all successful `Payment` records into `totalPayments`.
   - Calculates exact net balance using Prisma `Decimal`:
     $$\text{Final Balance} = \text{totalCharges} - \text{totalCredits} - \text{totalPayments}$$

3. **Settlement Collection (if Balance > 0)**:
   - If balance is positive, checkout cannot proceed without settlement.
   - Receptionist selects payment method (`CARD`, `UPI`, `CASH`, `BANK_TRANSFER`) and inputs transaction reference.
   - Transaction records `Payment` with `context = FOLIO_SETTLEMENT` directly against the folio.

4. **Atomic Execution (`executeCheckOut`)**:
   Within a single `prisma.$transaction`:
   - Validates that final balance is strictly $\le 0.00$.
   - Updates `Folio` to `status = SETTLED`.
   - Sets `RoomAssignment.status = ENDED` and records `releasedAt = now()`.
   - Transitions physical `Room.status` from `OCCUPIED` to `DIRTY` (automatically queuing the room for housekeeping turnover).
   - Updates `Stay` with `status = CHECKED_OUT` and `actualCheckOut = now()`.
   - If the associated reservation has no other active stays, sets `Reservation.status = COMPLETED`.
   - Emits immutable `AuditLog` event (`CHECKOUT_COMPLETED`).

---

## 3. Physical Room State Transitions

```text
[AVAILABLE] ──(Check-In)──► [OCCUPIED] ──(Check-Out)──► [DIRTY]
                                                           │
                                                      (Housekeeping)
                                                           ▼
[AVAILABLE] ◄──(Inspect)──── [CLEANING] ◄──────────────────┘
```

The transitions `AVAILABLE -> OCCUPIED` and `OCCUPIED -> DIRTY` are exclusively owned by the Check-In and Check-Out workflows and cannot be triggered manually from room configuration screens while active assignments exist.
