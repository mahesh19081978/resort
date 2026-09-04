# Physical Room Operational State Machine

## 1. Authoritative Physical Room Status Model

The operational readiness of physical rooms in The Royal Reserve Resort Management System is governed by the single authoritative Prisma enum PhysicalRoomStatus:

`prisma
enum PhysicalRoomStatus {
  AVAILABLE
  RESERVED
  OCCUPIED
  DIRTY
  CLEANING
  MAINTENANCE
  OUT_OF_ORDER
}
`

### Status Definitions & Operational Roles

| Status | Business Definition | Operational Role & Inventory Impact |
| :--- | :--- | :--- |
| **AVAILABLE** | Cleaned, inspected, vacant, and ready for immediate guest occupancy. | Counted in sellable operational inventory ceiling. Eligible for front desk room assignment. |
| **RESERVED** | Blocked or earmarked for an imminent arrival reservation. | Pre-allocated to an upcoming stay. Not available for walk-in assignment. |
| **OCCUPIED** | In-house guest currently registered and staying in the room. | Active guest stay. Front desk folio ledger active. |
| **DIRTY** | Guest has departed (turnover) or daily service required. | Not ready for occupancy. Housekeeping queue item. |
| **CLEANING** | Housekeeping attendants actively servicing and sanitizing the room. | In-progress turnover. Transits to AVAILABLE upon completion. |
| **MAINTENANCE** | Minor preventative maintenance, cosmetic repair, or servicing. | Temporarily withheld from check-in. Does not alter commercial room type quota. |
| **OUT_OF_ORDER** | Major physical defect, plumbing/HVAC breakdown, or major renovation. | Subtracted from operational inventory capacity ceiling. |

---

## 2. State Machine Lifecycle & Conceptual Flow

The primary operational lifecycle follows this flow:

`
        AVAILABLE
       /    |    \
      /     |     \
  (maint)   |   (workflow: reservation)
    /       |       \
   v        v        v
MAINTENANCE DIRTY   RESERVED
   ^        ^        |
   |        |   (workflow: check-in)
   |        |        |
   |        |        v
   |        |     OCCUPIED
   |        |        |
   |   (workflow: checkout)
   |        |        |
   |        v        v
   +---- DIRTY <-----+
            |
            v
         CLEANING
            |
            v
        AVAILABLE
`

---

## 3. Transition Matrix

The table below defines every theoretical transition, the executing authority, and whether manual backoffice execution is permitted:

| Current Status | Permitted Target Statuses | Authority | Manual Admin Action Allowed? |
| :--- | :--- | :--- | :---: |
| **AVAILABLE** | RESERVED | Commercial Booking Engine | **NO (Workflow-owned)** |
| | OCCUPIED | Front Desk Check-In | **NO (Workflow-owned)** |
| | DIRTY | Housekeeping / Staff | **YES** |
| | MAINTENANCE | Engineering / Facilities | **YES** |
| | OUT_OF_ORDER | General Manager / Facilities | **YES** |
| **RESERVED** | OCCUPIED | Front Desk Check-In | **NO (Workflow-owned)** |
| | AVAILABLE | Reservation Cancellation | **YES (or workflow)** |
| | DIRTY | Housekeeping | **YES** |
| | MAINTENANCE | Engineering | **YES** |
| **OCCUPIED** | DIRTY | Front Desk Checkout | **NO (Workflow-owned)** |
| | MAINTENANCE | Emergency Maintenance | **YES** |
| **DIRTY** | CLEANING | Housekeeping Staff | **YES** |
| | MAINTENANCE | Engineering | **YES** |
| | OUT_OF_ORDER | Facilities | **YES** |
| **CLEANING** | AVAILABLE | Housekeeping Supervisor | **YES** |
| | DIRTY | Re-clean required | **YES** |
| | MAINTENANCE | Defect found during cleaning | **YES** |
| **MAINTENANCE** | CLEANING | Housekeeping turnover | **YES** |
| | DIRTY | Turnover required | **YES** |
| | AVAILABLE | Maintenance completed | **YES** |
| | OUT_OF_ORDER | Escalation to major defect | **YES** |
| **OUT_OF_ORDER** | MAINTENANCE | Work order commenced | **YES** |
| | DIRTY | Turnover after repair | **YES** |

---

## 4. Workflow-Restricted Transitions & Domain Protections

To protect system integrity, prevent double-bookings, and eliminate concurrency race conditions, the following transitions **cannot be executed manually via generic room administration**:

1. * -> RESERVED:
   - **Restricted To**: Commercial Booking Engine & Reservation Allocation workflow (Phase 0.6).
   - **Rationale**: Manual reservation jumping bypasses rate plan rules, credit card authorization, and inventory quota allocation.
2. * -> OCCUPIED:
   - **Restricted To**: Front Desk Check-In & Room Key Assignment workflow (Phase 0.5).
   - **Rationale**: Manual occupation bypasses guest identification, webcam verification, advance payment/deposit, and folio ledger activation.
3. OCCUPIED -> DIRTY:
   - **Restricted To**: Front Desk Check-Out & Settlement workflow (Phase 0.5).
   - **Rationale**: Checkout requires final folio audit, guest bill payment, key return, and transaction balance settlement.

### Domain Error Codes

When an unauthorized manual status change is attempted, the system halts with structured domain error codes:

- INVALID_ROOM_STATUS_TRANSITION: The requested target status is not reachable from the current status according to the state machine matrix (e.g. OCCUPIED -> AVAILABLE or DIRTY -> AVAILABLE).
- WORKFLOW_RESTRICTED_TRANSITION: The target transition is theoretically valid but strictly owned by an automated or specialized domain workflow.
