# Physical Room Operational State Machine

## 1. Physical Room Status Enum
The system tracks physical operational readiness via the PhysicalRoomStatus enum:
- CLEAN: Cleaned, awaiting housekeeping supervisor inspection.
- INSPECTED: Inspected and certified ready for guest check-in.
- DIRTY: Departure or turnover room requiring full service.
- OCCUPIED: Guest actively residing in the room.
- RESERVED: Assigned for imminent arrival.
- OUT_OF_ORDER: Major physical defect or maintenance (removed from inventory quota).
- OUT_OF_SERVICE: Minor issue or temporary block (does not impact quota).

## 2. Transition Matrix

| From Status | Allowed Target Statuses | Authority |
| :--- | :--- | :--- |
| CLEAN | INSPECTED, DIRTY, OUT_OF_ORDER, OUT_OF_SERVICE | Housekeeping / Staff |
| INSPECTED | CLEAN, DIRTY, OUT_OF_ORDER, OUT_OF_SERVICE, RESERVED (workflow) | Staff / Workflow |
| DIRTY | CLEAN, OUT_OF_ORDER, OUT_OF_SERVICE | Housekeeping |
| OCCUPIED | DIRTY (workflow checkout) | Front Desk Workflow |
| RESERVED | OCCUPIED (workflow check-in), INSPECTED (workflow cancel/reassign) | Front Desk Workflow |
| OUT_OF_ORDER | DIRTY, CLEAN | Maintenance / Staff |
| OUT_OF_SERVICE | DIRTY, CLEAN | Maintenance / Staff |

## 3. Workflow-Restricted Transitions
- Staff cannot manually jump a room into RESERVED, OCCUPIED, or trigger checkout transition OCCUPIED -> DIRTY.
- These transitions are strictly owned by Phase 0.5 Check-In / Check-Out domain workflows.
- Attempting manual transition returns error WORKFLOW_RESTRICTED_TRANSITION.