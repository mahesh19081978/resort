import { PhysicalRoomStatus } from '@prisma/client';

/**
 * Theoretical domain state machine transitions.
 * Defines all valid operational transitions within the PMS lifecycle.
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<PhysicalRoomStatus, readonly PhysicalRoomStatus[]> = {
  AVAILABLE: ['RESERVED', 'OCCUPIED', 'DIRTY', 'MAINTENANCE', 'OUT_OF_ORDER'],
  RESERVED: ['OCCUPIED', 'AVAILABLE', 'DIRTY', 'MAINTENANCE'],
  OCCUPIED: ['DIRTY', 'MAINTENANCE'],
  DIRTY: ['CLEANING', 'MAINTENANCE', 'OUT_OF_ORDER'],
  CLEANING: ['AVAILABLE', 'DIRTY', 'MAINTENANCE'],
  MAINTENANCE: ['CLEANING', 'DIRTY', 'AVAILABLE', 'OUT_OF_ORDER'],
  OUT_OF_ORDER: ['MAINTENANCE', 'DIRTY'],
};

/**
 * Transitions reserved for specialized future domain workflows.
 * In Phase 0.4, generic manual status changes must NOT be allowed to bypass these domain lifecycles:
 * - Commercial booking lifecycle owns: -> RESERVED
 * - Guest check-in lifecycle owns: -> OCCUPIED
 * - Guest checkout lifecycle owns: OCCUPIED -> DIRTY
 */
export const WORKFLOW_OWNED_TRANSITIONS: { from?: PhysicalRoomStatus; to: PhysicalRoomStatus; workflow: string }[] = [
  { to: 'RESERVED', workflow: 'Commercial Reservation Engine (Phase 0.6)' },
  { to: 'OCCUPIED', workflow: 'Front Desk Check-In & Room Assignment Workflow (Phase 0.5)' },
  { from: 'OCCUPIED', to: 'DIRTY', workflow: 'Front Desk Check-Out & Settlement Workflow (Phase 0.5)' },
];

/**
 * Checks if a transition between two physical room statuses is theoretically valid according to the domain matrix.
 */
export function isValidStatusTransition(
  currentStatus: PhysicalRoomStatus,
  targetStatus: PhysicalRoomStatus
): boolean {
  if (currentStatus === targetStatus) return true;
  const allowed = ALLOWED_STATUS_TRANSITIONS[currentStatus];
  return allowed ? allowed.includes(targetStatus) : false;
}

/**
 * Validates manual administrative transitions vs. workflow-owned transitions.
 * Returns { allowed: boolean; reason?: string }
 */
export function validateManualStatusTransition(
  currentStatus: PhysicalRoomStatus,
  targetStatus: PhysicalRoomStatus
): { allowed: boolean; reason?: string } {
  if (currentStatus === targetStatus) {
    return { allowed: true };
  }

  // 1. Is transition fundamentally allowed in state machine?
  if (!isValidStatusTransition(currentStatus, targetStatus)) {
    return {
      allowed: false,
      reason: `INVALID_ROOM_STATUS_TRANSITION: Cannot transition room from ${currentStatus} directly to ${targetStatus}.`,
    };
  }

  // 2. Is this transition restricted to a specialized future workflow?
  for (const restriction of WORKFLOW_OWNED_TRANSITIONS) {
    if (restriction.to === targetStatus && (!restriction.from || restriction.from === currentStatus)) {
      return {
        allowed: false,
        reason: `WORKFLOW_RESTRICTED_TRANSITION: Transition to [${targetStatus}] is strictly managed by the ${restriction.workflow} and cannot be set manually via room administration.`,
      };
    }
  }

  return { allowed: true };
}
