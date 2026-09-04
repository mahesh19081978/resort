import assert from 'node:assert';
import {
  generateDeterministicRoomNumbers,
  previewRoomGenerationCollisions,
  executeBatchRoomGeneration,
} from '../src/lib/pms/room-generator';
import {
  isValidStatusTransition,
  validateManualStatusTransition,
} from '../src/lib/pms/status-machine';
import { computeEffectiveRoomAmenities } from '../src/lib/pms/amenities';
import { hasPermission } from '../src/lib/permissions/rbac';
import {
  roomTypeSchema,
  roomGenerationSchema,
  roomStatusTransitionSchema,
  buildingSchema,
  floorSchema,
} from '../src/validations/pms';
import { PhysicalRoomStatus } from '@prisma/client';

async function runPmsTestSuite() {
  console.log('--- Starting PMS Domain & Security Test Suite (Phase 0.4) ---');

  // ----------------------------------------------------
  // 1. DETERMINISTIC ROOM GENERATION TESTS
  // ----------------------------------------------------
  console.log('1. Testing Deterministic Room Generation...');

  // Valid batch
  const genStandard = generateDeterministicRoomNumbers('S-', 101, 10);
  assert.strictEqual(genStandard.length, 10);
  assert.strictEqual(genStandard[0], 'S-101');
  assert.strictEqual(genStandard[9], 'S-110');

  // Count boundary checks
  assert.deepStrictEqual(generateDeterministicRoomNumbers('V-', 301, 0), []);
  assert.deepStrictEqual(generateDeterministicRoomNumbers('V-', 301, -5), []);

  // Validation schema
  const validGenInput = roomGenerationSchema.safeParse({
    propertyId: 'clxxxxxxxxxxxxxxxxxxxxxxxxx',
    floorId: 'clyyyyyyyyyyyyyyyyyyyyyyyyy',
    roomTypeId: 'clzzzzzzzzzzzzzzzzzzzzzzzzz',
    prefix: 'D-',
    startingNumber: 201,
    count: 10,
  });
  assert.ok(validGenInput.success, 'Valid generation input should pass Zod');

  // Zero count rejected
  const zeroCountInput = roomGenerationSchema.safeParse({
    propertyId: 'clxxxxxxxxxxxxxxxxxxxxxxxxx',
    floorId: 'clyyyyyyyyyyyyyyyyyyyyyyyyy',
    roomTypeId: 'clzzzzzzzzzzzzzzzzzzzzzzzzz',
    prefix: 'D-',
    startingNumber: 201,
    count: 0,
  });
  assert.ok(!zeroCountInput.success, 'Count of 0 should fail Zod');

  // Negative count rejected
  const negCountInput = roomGenerationSchema.safeParse({
    propertyId: 'clxxxxxxxxxxxxxxxxxxxxxxxxx',
    floorId: 'clyyyyyyyyyyyyyyyyyyyyyyyyy',
    roomTypeId: 'clzzzzzzzzzzzzzzzzzzzzzzzzz',
    prefix: 'D-',
    startingNumber: 201,
    count: -5,
  });
  assert.ok(!negCountInput.success, 'Negative count should fail Zod');

  // Exceeds batch max (100)
  const excessiveCountInput = roomGenerationSchema.safeParse({
    propertyId: 'clxxxxxxxxxxxxxxxxxxxxxxxxx',
    floorId: 'clyyyyyyyyyyyyyyyyyyyyyyyyy',
    roomTypeId: 'clzzzzzzzzzzzzzzzzzzzzzzzzz',
    prefix: 'D-',
    startingNumber: 201,
    count: 101,
  });
  assert.ok(!excessiveCountInput.success, 'Count > 100 should fail Zod');

  // Invalid prefix rejected
  const badPrefixInput = roomGenerationSchema.safeParse({
    propertyId: 'clxxxxxxxxxxxxxxxxxxxxxxxxx',
    floorId: 'clyyyyyyyyyyyyyyyyyyyyyyyyy',
    roomTypeId: 'clzzzzzzzzzzzzzzzzzzzzzzzzz',
    prefix: 'S#@!',
    startingNumber: 201,
    count: 10,
  });
  assert.ok(!badPrefixInput.success, 'Special char prefix should fail Zod');

  // Collision detection mock test
  const mockDbWithCollisions = {
    room: {
      findMany: async () => [{ roomNumber: 'S-105' }],
    },
  };
  const collisionResult = await previewRoomGenerationCollisions(
    'prop-1',
    'S-',
    101,
    10,
    mockDbWithCollisions as any
  );
  assert.strictEqual(collisionResult.hasCollisions, true);
  assert.deepStrictEqual(collisionResult.existingCollisions, ['S-105']);

  // Transactional rollback on collision
  let rollbackCaught = false;
  const mockTxClient = {
    $transaction: async (cb: any) => {
      return cb({
        floor: {
          findUnique: async () => ({ id: 'f-1', building: { propertyId: 'prop-1' } }),
        },
        roomType: {
          findUnique: async () => ({ id: 'rt-1' }),
        },
        room: {
          findMany: async () => [{ roomNumber: 'S-103' }],
          create: async () => {
            throw new Error('Should not reach create on collision');
          },
        },
      });
    },
  };

  try {
    await executeBatchRoomGeneration(
      {
        propertyId: 'prop-1',
        floorId: 'f-1',
        roomTypeId: 'rt-1',
        prefix: 'S-',
        startingNumber: 101,
        count: 5,
      },
      mockTxClient as any
    );
  } catch (err: any) {
    rollbackCaught = true;
    assert.ok(err.message.includes('ROOM_NUMBER_ALREADY_EXISTS'));
  }
  assert.strictEqual(rollbackCaught, true, 'Batch generator must abort and throw on collision');

  // Cross-property integrity violation check
  let crossPropCaught = false;
  const mockTxForeignFloor = {
    $transaction: async (cb: any) => {
      return cb({
        floor: {
          findUnique: async () => ({ id: 'f-1', building: { propertyId: 'DIFFERENT-PROP' } }),
        },
        roomType: {
          findUnique: async () => ({ id: 'rt-1' }),
        },
      });
    },
  };

  try {
    await executeBatchRoomGeneration(
      {
        propertyId: 'prop-1',
        floorId: 'f-1',
        roomTypeId: 'rt-1',
        prefix: 'S-',
        startingNumber: 101,
        count: 5,
      },
      mockTxForeignFloor as any
    );
  } catch (err: any) {
    crossPropCaught = true;
    assert.ok(err.message.includes('CROSS_PROPERTY_VIOLATION'));
  }
  assert.strictEqual(crossPropCaught, true, 'Must reject floor from different property');
  console.log('✔ Deterministic generation, collision rollback, and cross-property integrity verified');

  // ----------------------------------------------------
  // 2. PHYSICAL ROOM STATUS MACHINE TESTS
  // ----------------------------------------------------
  console.log('2. Testing Physical Room Operational State Machine...');

  // Valid theoretical transitions
  assert.ok(isValidStatusTransition('AVAILABLE', 'MAINTENANCE'));
  assert.ok(isValidStatusTransition('DIRTY', 'CLEANING'));
  assert.ok(isValidStatusTransition('CLEANING', 'AVAILABLE'));
  assert.ok(isValidStatusTransition('MAINTENANCE', 'CLEANING'));

  // Invalid theoretical transitions (direct illegal jumps)
  assert.strictEqual(isValidStatusTransition('OCCUPIED', 'AVAILABLE'), false, 'Occupied cannot jump to Available');
  assert.strictEqual(isValidStatusTransition('DIRTY', 'AVAILABLE'), false, 'Dirty must go through Cleaning first');
  assert.strictEqual(isValidStatusTransition('OUT_OF_ORDER', 'AVAILABLE'), false, 'Out of order cannot jump to Available');

  // Manual transition validation (Workflow protection rules)
  // 1. Cleaning -> Available is a valid manual operational transition
  const manualCleaningToAvailable = validateManualStatusTransition('CLEANING', 'AVAILABLE');
  assert.strictEqual(manualCleaningToAvailable.allowed, true);

  // 2. Available -> Maintenance is a valid manual transition
  const manualAvailToMaint = validateManualStatusTransition('AVAILABLE', 'MAINTENANCE');
  assert.strictEqual(manualAvailToMaint.allowed, true);

  // 3. Manual jump into RESERVED is blocked (reserved for commercial reservation engine)
  const manualToReserved = validateManualStatusTransition('AVAILABLE', 'RESERVED');
  assert.strictEqual(manualToReserved.allowed, false);
  assert.ok(manualToReserved.reason?.includes('WORKFLOW_RESTRICTED_TRANSITION'));

  // 4. Manual jump into OCCUPIED is blocked (reserved for front desk check-in)
  const manualToOccupied = validateManualStatusTransition('AVAILABLE', 'OCCUPIED');
  assert.strictEqual(manualToOccupied.allowed, false);
  assert.ok(manualToOccupied.reason?.includes('WORKFLOW_RESTRICTED_TRANSITION'));

  // 5. Manual jump from OCCUPIED to DIRTY is blocked (reserved for checkout workflow)
  const manualOccupiedToDirty = validateManualStatusTransition('OCCUPIED', 'DIRTY');
  assert.strictEqual(manualOccupiedToDirty.allowed, false);
  assert.ok(manualOccupiedToDirty.reason?.includes('WORKFLOW_RESTRICTED_TRANSITION'));

  console.log('✔ Operational state machine & workflow-owned transition protections verified');

  // ----------------------------------------------------
  // 3. EFFECTIVE AMENITY PRECEDENCE ALGORITHM
  // ----------------------------------------------------
  console.log('3. Testing Effective Amenity Precedence Algorithm...');

  const baseAmenities = [
    { amenity: { id: 'am-wifi', name: 'High-Speed Wi-Fi', code: 'WIFI' } },
    { amenity: { id: 'am-tv', name: 'Smart LED TV', code: 'TV' } },
    { amenity: { id: 'am-minibar', name: 'Mini Bar', code: 'MINIBAR' } },
  ];

  // Override: TV = false (removed), Refrigerator = true (added)
  const overrides = [
    {
      amenityId: 'am-tv',
      hasAmenity: false,
      amenity: { id: 'am-tv', name: 'Smart LED TV', code: 'TV' },
      notes: 'Under repair',
    },
    {
      amenityId: 'am-dryer',
      hasAmenity: true,
      amenity: { id: 'am-dryer', name: 'Hair Dryer', code: 'DRYER' },
      notes: 'Added upon guest profile request',
    },
  ];

  const effective = computeEffectiveRoomAmenities(baseAmenities as any, overrides as any);
  const effectiveCodes = effective.map((a) => a.code);

  assert.ok(effectiveCodes.includes('WIFI'), 'Should retain untouched default Wi-Fi');
  assert.ok(effectiveCodes.includes('MINIBAR'), 'Should retain untouched default Mini Bar');
  assert.ok(effectiveCodes.includes('DRYER'), 'Should include added Hair Dryer override');
  assert.strictEqual(effectiveCodes.includes('TV'), false, 'Should have excluded TV per negative override');

  const dryerItem = effective.find((a) => a.code === 'DRYER');
  assert.strictEqual(dryerItem?.isOverride, true);
  assert.strictEqual(dryerItem?.overrideNote, 'Added upon guest profile request');
  console.log('✔ Effective amenity computation verified (Default + Positive - Negative)');

  // ----------------------------------------------------
  // 4. ROOM TYPE & VALIDATION SCHEMAS
  // ----------------------------------------------------
  console.log('4. Testing Room Type & Entity Validations...');

  const validRoomType = roomTypeSchema.safeParse({
    name: 'Presidential Chalet',
    code: 'PRES-CHALET',
    description: 'Ultra-luxury suite overlooking the reserve.',
    basePrice: 25000,
    maxOccupancy: 4,
    maxAdults: 4,
    maxChildren: 2,
    totalInventory: 3,
    displayOrder: 1,
  });
  assert.ok(validRoomType.success, 'Valid room type should pass');

  const negPrice = roomTypeSchema.safeParse({
    name: 'Presidential Chalet',
    code: 'PRES-CHALET',
    description: 'Ultra-luxury suite.',
    basePrice: -500,
    maxOccupancy: 4,
    maxAdults: 4,
    maxChildren: 2,
    totalInventory: 3,
  });
  assert.ok(!negPrice.success, 'Negative price must fail');

  const zeroCapacity = roomTypeSchema.safeParse({
    name: 'Invalid Room',
    code: 'INV',
    description: 'Bad capacity.',
    basePrice: 1000,
    maxOccupancy: 0,
    maxAdults: 0,
  });
  assert.ok(!zeroCapacity.success, 'Zero capacity must fail');
  console.log('✔ Room type and hierarchy validation schemas verified');

  // ----------------------------------------------------
  // 5. RBAC & PMS MUTATION AUTHORIZATION BOUNDARIES
  // ----------------------------------------------------
  console.log('5. Testing RBAC PMS Operation Authorizations...');

  // RECEPTIONIST:
  // Can read rooms and bookings, but cannot manage room catalog, batch generate rooms, or manage property
  assert.strictEqual(hasPermission({ role: 'RECEPTIONIST' }, 'room:read'), true);
  assert.strictEqual(hasPermission({ role: 'RECEPTIONIST' }, 'room:manage'), false);
  assert.strictEqual(hasPermission({ role: 'RECEPTIONIST' }, 'property:manage'), false);

  // ADMIN:
  // Can read and manage rooms, room types, and property
  assert.strictEqual(hasPermission({ role: 'ADMIN' }, 'room:read'), true);
  assert.strictEqual(hasPermission({ role: 'ADMIN' }, 'room:manage'), true);
  assert.strictEqual(hasPermission({ role: 'ADMIN' }, 'property:manage'), true);

  // SUPER_ADMIN:
  // Full authority across all operations
  assert.strictEqual(hasPermission({ role: 'SUPER_ADMIN' }, 'room:read'), true);
  assert.strictEqual(hasPermission({ role: 'SUPER_ADMIN' }, 'room:manage'), true);
  assert.strictEqual(hasPermission({ role: 'SUPER_ADMIN' }, 'property:manage'), true);

  // CONTENT_MANAGER:
  // Cannot view PMS rooms, cannot mutate rooms or property
  assert.strictEqual(hasPermission({ role: 'CONTENT_MANAGER' }, 'room:read'), false);
  assert.strictEqual(hasPermission({ role: 'CONTENT_MANAGER' }, 'room:manage'), false);
  assert.strictEqual(hasPermission({ role: 'CONTENT_MANAGER' }, 'property:manage'), false);

  // KITCHEN_STAFF & RESTAURANT_BILLER:
  // Zero PMS access
  assert.strictEqual(hasPermission({ role: 'KITCHEN_STAFF' }, 'room:read'), false);
  assert.strictEqual(hasPermission({ role: 'KITCHEN_STAFF' }, 'room:manage'), false);
  assert.strictEqual(hasPermission({ role: 'RESTAURANT_BILLER' }, 'room:read'), false);
  assert.strictEqual(hasPermission({ role: 'RESTAURANT_BILLER' }, 'room:manage'), false);

  console.log('✔ RBAC permission boundaries for PMS mutations verified');

  console.log('--- ALL PMS DOMAIN TESTS PASSED SUCCESSFULLY ---');
}

runPmsTestSuite().catch((err) => {
  console.error('PMS Test Suite Failed:', err);
  process.exit(1);
});