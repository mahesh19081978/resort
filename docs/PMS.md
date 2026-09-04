# Property Management System (PMS) Architecture & Domain Guide

## 1. Domain Overview & Boundaries

The Property Management System (PMS) Foundation in The Royal Reserve Resort Management System establishes the physical and conceptual models for inventory, real-world resort assets, spatial organization, and room operational readiness.

### Strict Domain Boundaries
- **In Scope (Phase 0.4):**
  - Spatial physical hierarchy: `Property -> Building -> Floor -> Room`
  - Conceptual room catalog: `RoomType`
  - Granular amenities & overrides: `Amenity`, `RoomTypeAmenity`, `RoomAmenityOverride`
  - Operational room readiness state machine: `PhysicalRoomStatus`
  - Deterministic batch generation & collision prevention
  - PMS Backoffice Administration UI (`/admin/rooms`, `/admin/property`)
  - Granular RBAC (`room:read`, `room:manage`, `property:manage`)
  - Server actions with atomic transactions and audit logging
- **Out of Scope (Deferred to Phase 0.5+):**
  - Online booking engine, shopping cart, and guest reservation checkout
  - Payment gateway processing (Stripe / Razorpay)
  - Front desk registration, check-in, keycards, and check-out workflows
  - Guest folios, charges, ledger posting, and billing settlement
  - Housekeeping task assignment, shift rosters, and maintenance tickets
  - Restaurant POS, KOTs, and F&B operations

---

## 2. Structural Hierarchy

The physical resort is organized hierarchically:

```
[Property]
   └── [Building] (Wings, Blocks, Villas, Cottages)
          └── [Floor] (Floor number/index)
                 └── [Room] (Physical unit with door number)
                        └── Associated with [RoomType] (Sales & specification class)
```

1. **Property (`Property`)**: Root business unit representing the resort estate (e.g., The Royal Reserve Main Estate). Holds core geo-location, currency, time zone, and property settings.
2. **Building (`Building`)**: Physical detached wings or structures (e.g., "East Wing", "West Garden Pavilion", "Lakeside Villas"). Identified within the property by a unique uppercase code (e.g., `WING-A`, `VILLA-1`).
3. **Floor (`Floor`)**: Structural floor level within a building. Has a numeric index (e.g., `0` for Ground Floor, `1` for First Floor, `-1` for Lower Ground).
4. **Physical Room (`Room`)**: The actual physical room (e.g., room `A-101`, `VILLA-04`) located on a floor. Contains attributes such as `roomNumber`, `status` (`PhysicalRoomStatus`), `isActive`, and `isSmokingAllowed`.

---

## 3. Reservation vs. Stay vs. RoomAssignment vs. Physical Room

To maintain high concurrency, prevent race conditions, and support modern hospitality practices, the booking model cleanly separates reservations from physical rooms:

| Concept | Role & Lifecycle | Relation |
| :--- | :--- | :--- |
| **`RoomType`** | Categorization of accommodation (e.g., Deluxe Ocean Suite). Defines capacity (adults/children), bed configuration, base pricing snapshot, and quota limits. | 1 RoomType has many Physical Rooms. |
| **`Reservation`** | Commercial contract with a guest for dates `[checkIn, checkOut]` for a specific `RoomType`. **Does not hold or lock a physical room number upon booking.** | Holds quota against `RoomType`. |
| **`Stay`** | Operational manifestation of the reservation when the guest actually arrives and registers at the front desk (Phase 0.5). | Links to Reservation. |
| **`RoomAssignment`** | Operational linking of an active `Stay` to a specific `Physical Room` for a defined time slice. | Links `Stay` and `Room`. |
| **`Physical Room`** | The physical asset (`Room`). Its state changes based on physical events (cleaning, inspection, maintenance) or front-desk check-in/out workflows. | Linked via assignments. |

> **IMPORTANT**: A booking reserves a **RoomType quota**, not a physical room number. Physical room assignment is an operational front-desk decision executed during pre-arrival or check-in.

---

## 4. Physical Rooms vs. Inventory Quotas & Intentional Global Scope of RoomType

### Intentional Global Scope of RoomType
In The Royal Reserve domain model, `RoomType` is **intentionally global**:
- It does **not** have a `propertyId` foreign key in `prisma/schema.prisma`.
- Instead, physical `Room` records bind a global catalog `RoomType` to a specific `Property` (`Room.propertyId` and `Room.roomTypeId`).
- This intentional architectural decision enables brand-wide accommodation standard definitions, centralized marketing catalog management, and consistent rate plan structures across multi-wing resort properties.
- When generating physical rooms (`executeBatchRoomGeneration`), the transaction verifies that `params.roomTypeId` points to an active valid `RoomType`, and links the resulting physical room directly to the selected `Property` and `Floor`.

### Inventory Quota vs Physical Rooms
- **Room Inventory (`RoomTypeInventory`)**: A date-wise ledger representing total sellable inventory, booked count, blocked units, and available quota for a `RoomType`. This prevents table locks on physical rooms during high-traffic online reservations.
- **Physical Rooms (`Room`)**: Concrete physical inventory. The count of active physical rooms linked to a `RoomType` defines the theoretical capacity ceiling of that `RoomType`.
- **Blocked Rooms**: Physical rooms in `OUT_OF_ORDER` reduce the operational sellable capacity of that `RoomType`. Rooms undergoing routine `MAINTENANCE` or `CLEANING` remain in inventory capacity planning.

---

## 5. Deterministic Room Generation

The system provides a deterministic batch room generator (`src/lib/pms/room-generator.ts`):

- **Format Options**:
  - `WING_FLOOR_SEQUENCE`: `{BuildingCode}-{FloorNumber}{Seq}` (e.g., `A-101`, `A-102`)
  - `FLOOR_SEQUENCE`: `{FloorNumber}{Seq}` (e.g., `101`, `102`)
  - `PREFIX_SEQUENCE`: `{CustomPrefix}-{Seq}` (e.g., `VILLA-01`, `VILLA-02`)
- **Collision Detection**: Previews existing room numbers within the property before execution.
- **Transactional Rollback**: If any collision occurs or structural validation fails, the entire batch generation rolls back atomically.
- **Cross-Property Integrity**: Validates that the selected Floor belongs to a Building within the specified Property before inserting rooms.

---

## 6. Amenity Inheritance & Overrides

Amenities follow a cascading inheritance model:

`Effective Amenities = (RoomType Amenities) + (Positive Overrides) - (Negative Overrides)`

1. **`RoomTypeAmenity`**: Standard baseline amenities assigned to all rooms of a given type (e.g., King Bed, Air Conditioning, WiFi, Minibar).
2. **`RoomAmenityOverride`**: Unit-specific adjustments on a physical room:
   - `isAdded = true`: The physical room has an extra amenity not typical for its type (e.g., room `A-101` has an additional "Private Jacuzzi").
   - `isAdded = false`: An amenity standard for the type is unavailable or removed in this specific room (e.g., room `B-204` "Balcony" is undergoing repair or not present).
3. **Computation Service**: `computeEffectiveRoomAmenities(roomId)` dynamically resolves the union and difference to display the accurate list of amenities in backoffice and guest itineraries.

---

## 7. Deletion vs. Deactivation Lifecycle Policy

Physical rooms and property structures follow strict audit and historical preservation guidelines:

1. **Physical Rooms**:
   - Rooms that have historical stays, maintenance logs, or audit records **cannot be hard-deleted**.
   - Instead, the room is set to `isActive = false` and transitioned to `OUT_OF_ORDER`.
   - Inactive rooms do not count toward sellable room type capacity and are hidden from assignment pickers.
2. **Room Types**:
   - Cannot be deleted if physical rooms or historical reservations are attached.
   - Deactivated via `isActive = false`.
3. **Buildings & Floors**:
   - Cannot be deleted while active physical rooms exist on the floor or in the building.