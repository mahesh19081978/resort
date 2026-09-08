'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db/prisma';
import { requirePermission } from '@/lib/auth/auth';
import { recordAuditEvent } from '@/lib/auth/audit';
import { generateUniqueRoomTypeSlug } from '@/lib/slug';
import {
  propertyUpdateSchema,
  buildingSchema,
  floorSchema,
  roomTypeSchema,
  roomTypeUpdateSchema,
  roomGenerationSchema,
  roomStatusTransitionSchema,
  amenitySchema,
  roomTypeAmenitiesSchema,
  roomAmenityOverrideSchema,
  deleteEntitySchema,
} from '@/validations/pms';
import { validateManualStatusTransition } from '@/lib/pms/status-machine';
import { executeBatchRoomGeneration, previewRoomGenerationCollisions } from '@/lib/pms/room-generator';
import { PhysicalRoomStatus } from '@prisma/client';

export interface ActionResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ----------------------------------------------------
// 1. PROPERTY ADMINISTRATION
// Permission: 'property:manage'
// ----------------------------------------------------

export async function updatePropertyAction(
  prevState: ActionResponse | null,
  formData: FormData
): Promise<ActionResponse> {
  try {
    const user = await requirePermission('property:manage');

    const raw = {
      propertyId: formData.get('propertyId')?.toString() || '',
      name: formData.get('name')?.toString() || '',
      address: formData.get('address')?.toString() || '',
      city: formData.get('city')?.toString() || '',
      state: formData.get('state')?.toString() || '',
      postalCode: formData.get('postalCode')?.toString() || '',
      country: formData.get('country')?.toString() || 'India',
      contactPhone: formData.get('contactPhone')?.toString() || '',
      contactEmail: formData.get('contactEmail')?.toString() || '',
    };

    const parsed = propertyUpdateSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.property.findUnique({
        where: { id: parsed.data.propertyId },
      });

      if (!existing) {
        throw new Error('Property not found.');
      }

      const prop = await tx.property.update({
        where: { id: parsed.data.propertyId },
        data: {
          name: parsed.data.name,
          address: parsed.data.address,
          city: parsed.data.city,
          state: parsed.data.state,
          postalCode: parsed.data.postalCode,
          country: parsed.data.country,
          contactPhone: parsed.data.contactPhone,
          contactEmail: parsed.data.contactEmail,
        },
      });

      await recordAuditEvent(
        {
          userId: user.id,
          action: 'PROPERTY_UPDATE',
          entity: 'Property',
          entityId: prop.id,
          oldValues: {
            name: existing.name,
            address: existing.address,
            city: existing.city,
            state: existing.state,
            postalCode: existing.postalCode,
            contactPhone: existing.contactPhone,
            contactEmail: existing.contactEmail,
          },
          newValues: {
            name: prop.name,
            address: prop.address,
            city: prop.city,
            state: prop.state,
            postalCode: prop.postalCode,
            contactPhone: prop.contactPhone,
            contactEmail: prop.contactEmail,
          },
        },
        tx
      );

      return prop;
    });

    revalidatePath('/admin/property');
    return { success: true, data: updated };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function createBuildingAction(
  prevState: ActionResponse | null,
  formData: FormData
): Promise<ActionResponse> {
  try {
    const user = await requirePermission('property:manage');

    const raw = {
      propertyId: formData.get('propertyId')?.toString() || '',
      name: formData.get('name')?.toString() || '',
      code: formData.get('code')?.toString() || '',
    };

    const parsed = buildingSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const building = await prisma.$transaction(async (tx) => {
      // Verify Property exists
      const property = await tx.property.findUnique({
        where: { id: parsed.data.propertyId },
      });
      if (!property) {
        throw new Error('Target property not found.');
      }

      // Check duplicate code within property
      const existing = await tx.building.findUnique({
        where: {
          propertyId_code: {
            propertyId: parsed.data.propertyId,
            code: parsed.data.code,
          },
        },
      });
      if (existing) {
        throw new Error('A building with this code already exists in this property.');
      }

      const created = await tx.building.create({
        data: {
          propertyId: parsed.data.propertyId,
          name: parsed.data.name,
          code: parsed.data.code,
        },
      });

      await recordAuditEvent(
        {
          userId: user.id,
          action: 'BUILDING_CREATE',
          entity: 'Building',
          entityId: created.id,
          newValues: { name: created.name, code: created.code, propertyId: created.propertyId },
        },
        tx
      );

      return created;
    });

    revalidatePath('/admin/property');
    revalidatePath('/admin/property/buildings');
    return { success: true, data: building };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function createFloorAction(
  prevState: ActionResponse | null,
  formData: FormData
): Promise<ActionResponse> {
  try {
    const user = await requirePermission('property:manage');

    const raw = {
      buildingId: formData.get('buildingId')?.toString() || '',
      floorNumber: formData.get('floorNumber')?.toString() || '0',
      name: formData.get('name')?.toString() || '',
    };

    const parsed = floorSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const floor = await prisma.$transaction(async (tx) => {
      const building = await tx.building.findUnique({
        where: { id: parsed.data.buildingId },
      });
      if (!building) {
        throw new Error('Building not found.');
      }

      const existing = await tx.floor.findUnique({
        where: {
          buildingId_floorNumber: {
            buildingId: parsed.data.buildingId,
            floorNumber: parsed.data.floorNumber,
          },
        },
      });
      if (existing) {
        throw new Error('This floor number already exists in this building.');
      }

      const created = await tx.floor.create({
        data: {
          buildingId: parsed.data.buildingId,
          floorNumber: parsed.data.floorNumber,
          name: parsed.data.name,
        },
      });

      await recordAuditEvent(
        {
          userId: user.id,
          action: 'FLOOR_CREATE',
          entity: 'Floor',
          entityId: created.id,
          newValues: { name: created.name, floorNumber: created.floorNumber, buildingId: created.buildingId },
        },
        tx
      );

      return created;
    });

    revalidatePath('/admin/property');
    revalidatePath('/admin/property/floors');
    return { success: true, data: floor };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// ----------------------------------------------------
// 2. ROOM TYPE MANAGEMENT
// Permission: 'room:manage'
// ----------------------------------------------------

export async function createRoomTypeAction(
  prevState: ActionResponse | null,
  formData: FormData
): Promise<ActionResponse> {
  try {
    const user = await requirePermission('room:manage');

    const raw = {
      name: formData.get('name')?.toString() || '',
      code: formData.get('code')?.toString() || '',
      description: formData.get('description')?.toString() || '',
      basePrice: formData.get('basePrice')?.toString() || '0',
      maxOccupancy: formData.get('maxOccupancy')?.toString() || '2',
      maxAdults: formData.get('maxAdults')?.toString() || '2',
      maxChildren: formData.get('maxChildren')?.toString() || '0',
      totalInventory: formData.get('totalInventory')?.toString() || '0',
      displayOrder: formData.get('displayOrder')?.toString() || '0',
      isActive: formData.get('isActive') !== 'false',
    };

    const parsed = roomTypeSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const roomType = await prisma.$transaction(async (tx) => {
      const existing = await tx.roomType.findUnique({
        where: { code: parsed.data.code },
      });
      if (existing) {
        throw new Error('A room type with this code already exists.');
      }

      const created = await tx.roomType.create({
        data: {
          name: parsed.data.name,
          code: parsed.data.code,
          slug: await generateUniqueRoomTypeSlug(parsed.data.name),
          description: parsed.data.description,
          basePrice: parsed.data.basePrice,
          maxOccupancy: parsed.data.maxOccupancy,
          maxAdults: parsed.data.maxAdults,
          maxChildren: parsed.data.maxChildren,
          totalInventory: parsed.data.totalInventory,
          displayOrder: parsed.data.displayOrder,
          isActive: parsed.data.isActive,
        },
      });

      await recordAuditEvent(
        {
          userId: user.id,
          action: 'ROOM_TYPE_CREATE',
          entity: 'RoomType',
          entityId: created.id,
          newValues: {
            code: created.code,
            name: created.name,
            basePrice: created.basePrice.toString(),
            maxOccupancy: created.maxOccupancy,
            totalInventory: created.totalInventory,
          },
        },
        tx
      );

      return created;
    });

    revalidatePath('/admin/rooms/types');
    return { success: true, data: roomType };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function updateRoomTypeAction(
  prevState: ActionResponse | null,
  formData: FormData
): Promise<ActionResponse> {
  try {
    const user = await requirePermission('room:manage');

    const raw = {
      roomTypeId: formData.get('roomTypeId')?.toString() || '',
      name: formData.get('name')?.toString() || undefined,
      description: formData.get('description')?.toString() || undefined,
      basePrice: formData.get('basePrice')?.toString() || undefined,
      maxOccupancy: formData.get('maxOccupancy')?.toString() || undefined,
      maxAdults: formData.get('maxAdults')?.toString() || undefined,
      maxChildren: formData.get('maxChildren')?.toString() || undefined,
      totalInventory: formData.get('totalInventory')?.toString() || undefined,
      displayOrder: formData.get('displayOrder')?.toString() || undefined,
      isActive: formData.has('isActive') ? formData.get('isActive') === 'true' : undefined,
    };

    const parsed = roomTypeUpdateSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.roomType.findUnique({
        where: { id: parsed.data.roomTypeId },
      });
      if (!existing) {
        throw new Error('Room type not found.');
      }

      const roomType = await tx.roomType.update({
        where: { id: parsed.data.roomTypeId },
        data: {
          ...(parsed.data.name && { name: parsed.data.name }),
          ...(parsed.data.description && { description: parsed.data.description }),
          ...(parsed.data.basePrice !== undefined && { basePrice: parsed.data.basePrice }),
          ...(parsed.data.maxOccupancy !== undefined && { maxOccupancy: parsed.data.maxOccupancy }),
          ...(parsed.data.maxAdults !== undefined && { maxAdults: parsed.data.maxAdults }),
          ...(parsed.data.maxChildren !== undefined && { maxChildren: parsed.data.maxChildren }),
          ...(parsed.data.totalInventory !== undefined && { totalInventory: parsed.data.totalInventory }),
          ...(parsed.data.displayOrder !== undefined && { displayOrder: parsed.data.displayOrder }),
          ...(parsed.data.isActive !== undefined && { isActive: parsed.data.isActive }),
        },
      });

      await recordAuditEvent(
        {
          userId: user.id,
          action: 'ROOM_TYPE_UPDATE',
          entity: 'RoomType',
          entityId: roomType.id,
          oldValues: {
            name: existing.name,
            description: existing.description,
            basePrice: existing.basePrice.toString(),
            maxOccupancy: existing.maxOccupancy,
            maxAdults: existing.maxAdults,
            maxChildren: existing.maxChildren,
            totalInventory: existing.totalInventory,
            isActive: existing.isActive,
          },
          newValues: {
            name: roomType.name,
            description: roomType.description,
            basePrice: roomType.basePrice.toString(),
            maxOccupancy: roomType.maxOccupancy,
            maxAdults: roomType.maxAdults,
            maxChildren: roomType.maxChildren,
            totalInventory: roomType.totalInventory,
            isActive: roomType.isActive,
          },
        },
        tx
      );

      return roomType;
    });

    revalidatePath('/admin/rooms/types');
    revalidatePath(`/admin/rooms/types/${updated.id}`);
    return { success: true, data: updated };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// ----------------------------------------------------
// 3. PHYSICAL ROOM GENERATION & MANAGEMENT
// Permissions: 'room:manage'
// ----------------------------------------------------

export async function generateRoomsAction(
  prevState: ActionResponse | null,
  formData: FormData
): Promise<ActionResponse> {
  try {
    const user = await requirePermission('room:manage');

    const raw = {
      propertyId: formData.get('propertyId')?.toString() || '',
      floorId: formData.get('floorId')?.toString() || '',
      roomTypeId: formData.get('roomTypeId')?.toString() || '',
      prefix: formData.get('prefix')?.toString() || '',
      startingNumber: formData.get('startingNumber')?.toString() || '101',
      count: formData.get('count')?.toString() || '1',
      notes: formData.get('notes')?.toString() || undefined,
    };

    const parsed = roomGenerationSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const result = await prisma.$transaction(async (tx) => {
      const genResult = await executeBatchRoomGeneration(parsed.data, tx);

      await recordAuditEvent(
        {
          userId: user.id,
          action: 'ROOMS_BATCH_GENERATE',
          entity: 'Room',
          entityId: parsed.data.propertyId,
          newValues: {
            createdCount: genResult.createdCount,
            roomNumbers: genResult.roomNumbers,
            roomIds: genResult.roomIds,
            floorId: parsed.data.floorId,
            roomTypeId: parsed.data.roomTypeId,
          },
        },
        tx
      );

      return genResult;
    });

    revalidatePath('/admin/rooms');
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Server Action for manual administrative room status transitions.
 * Enforces:
 * 1. Permission: 'room:manage'
 * 2. Theoretical state machine validity
 * 3. Restriction against manual jumps into workflow-owned states (RESERVED, OCCUPIED, or check-out DIRTY)
 */
export async function updateRoomStatusAction(
  prevState: ActionResponse | null,
  formData: FormData
): Promise<ActionResponse> {
  try {
    const user = await requirePermission('room:manage');

    const raw = {
      roomId: formData.get('roomId')?.toString() || '',
      targetStatus: formData.get('targetStatus')?.toString() as PhysicalRoomStatus,
      notes: formData.get('notes')?.toString() || undefined,
    };

    const parsed = roomStatusTransitionSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const updated = await prisma.$transaction(async (tx) => {
      const room = await tx.room.findUnique({
        where: { id: parsed.data.roomId },
      });

      if (!room) {
        throw new Error('Room not found.');
      }

      // Validate manual operational transition
      const validation = validateManualStatusTransition(room.status, parsed.data.targetStatus);
      if (!validation.allowed) {
        throw new Error(validation.reason || 'INVALID_ROOM_STATUS_TRANSITION');
      }

      const roomUpdated = await tx.room.update({
        where: { id: parsed.data.roomId },
        data: {
          status: parsed.data.targetStatus,
          ...(parsed.data.notes && { notes: parsed.data.notes }),
        },
      });

      await recordAuditEvent(
        {
          userId: user.id,
          action: 'ROOM_STATUS_CHANGE',
          entity: 'Room',
          entityId: roomUpdated.id,
          oldValues: { status: room.status, notes: room.notes },
          newValues: { status: roomUpdated.status, notes: parsed.data.notes },
        },
        tx
      );

      return roomUpdated;
    });

    revalidatePath('/admin/rooms');
    revalidatePath(`/admin/rooms/${updated.id}`);
    return { success: true, data: updated };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// ----------------------------------------------------
// 4. AMENITY MANAGEMENT & ROOM OVERRIDES
// Permission: 'room:manage'
// ----------------------------------------------------

export async function createAmenityAction(
  prevState: ActionResponse | null,
  formData: FormData
): Promise<ActionResponse> {
  try {
    const user = await requirePermission('room:manage');

    const raw = {
      name: formData.get('name')?.toString() || '',
      code: formData.get('code')?.toString() || '',
      icon: formData.get('icon')?.toString() || undefined,
      description: formData.get('description')?.toString() || undefined,
      isActive: formData.get('isActive') !== 'false',
    };

    const parsed = amenitySchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const amenity = await prisma.$transaction(async (tx) => {
      const existing = await tx.amenity.findFirst({
        where: {
          OR: [{ code: parsed.data.code }, { name: parsed.data.name }],
        },
      });
      if (existing) {
        throw new Error('An amenity with this code or name already exists.');
      }

      const created = await tx.amenity.create({
        data: {
          name: parsed.data.name,
          code: parsed.data.code,
          icon: parsed.data.icon,
          description: parsed.data.description,
          isActive: parsed.data.isActive,
        },
      });

      await recordAuditEvent(
        {
          userId: user.id,
          action: 'AMENITY_CREATE',
          entity: 'Amenity',
          entityId: created.id,
          newValues: { name: created.name, code: created.code, isActive: created.isActive },
        },
        tx
      );

      return created;
    });

    revalidatePath('/admin/rooms/types');
    return { success: true, data: amenity };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function updateRoomTypeAmenitiesAction(
  prevState: ActionResponse | null,
  formData: FormData
): Promise<ActionResponse> {
  try {
    const user = await requirePermission('room:manage');

    const roomTypeId = formData.get('roomTypeId')?.toString() || '';
    const amenityIds = formData.getAll('amenityIds').map((v) => v.toString());

    const parsed = roomTypeAmenitiesSchema.safeParse({ roomTypeId, amenityIds });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    await prisma.$transaction(async (tx) => {
      // Find old amenity assignments for audit record
      const oldAssignments = await tx.roomTypeAmenity.findMany({
        where: { roomTypeId: parsed.data.roomTypeId },
        select: { amenityId: true },
      });
      const oldAmenityIds = oldAssignments.map((a) => a.amenityId);

      // Clear existing assignments
      await tx.roomTypeAmenity.deleteMany({
        where: { roomTypeId: parsed.data.roomTypeId },
      });

      // Insert new assignments
      for (const amenityId of parsed.data.amenityIds) {
        await tx.roomTypeAmenity.create({
          data: {
            roomTypeId: parsed.data.roomTypeId,
            amenityId,
            isDefault: true,
          },
        });
      }

      await recordAuditEvent(
        {
          userId: user.id,
          action: 'ROOM_TYPE_AMENITIES_UPDATE',
          entity: 'RoomType',
          entityId: parsed.data.roomTypeId,
          oldValues: { amenityCount: oldAmenityIds.length, amenityIds: oldAmenityIds },
          newValues: { amenityCount: parsed.data.amenityIds.length, amenityIds: parsed.data.amenityIds },
        },
        tx
      );
    });

    revalidatePath(`/admin/rooms/types/${parsed.data.roomTypeId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function setRoomAmenityOverrideAction(
  prevState: ActionResponse | null,
  formData: FormData
): Promise<ActionResponse> {
  try {
    const user = await requirePermission('room:manage');

    const raw = {
      roomId: formData.get('roomId')?.toString() || '',
      amenityId: formData.get('amenityId')?.toString() || '',
      hasAmenity: formData.get('hasAmenity') === 'true',
      notes: formData.get('notes')?.toString() || undefined,
    };

    const parsed = roomAmenityOverrideSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const override = await prisma.$transaction(async (tx) => {
      const existing = await tx.roomAmenityOverride.findUnique({
        where: {
          roomId_amenityId: {
            roomId: parsed.data.roomId,
            amenityId: parsed.data.amenityId,
          },
        },
      });

      const res = await tx.roomAmenityOverride.upsert({
        where: {
          roomId_amenityId: {
            roomId: parsed.data.roomId,
            amenityId: parsed.data.amenityId,
          },
        },
        update: {
          hasAmenity: parsed.data.hasAmenity,
          notes: parsed.data.notes || null,
        },
        create: {
          roomId: parsed.data.roomId,
          amenityId: parsed.data.amenityId,
          hasAmenity: parsed.data.hasAmenity,
          notes: parsed.data.notes || null,
        },
      });

      await recordAuditEvent(
        {
          userId: user.id,
          action: 'ROOM_AMENITY_OVERRIDE',
          entity: 'RoomAmenityOverride',
          entityId: `${parsed.data.roomId}:${parsed.data.amenityId}`,
          oldValues: existing ? { hasAmenity: existing.hasAmenity, notes: existing.notes } : null,
          newValues: { hasAmenity: res.hasAmenity, notes: res.notes },
        },
        tx
      );

      return res;
    });

    revalidatePath(`/admin/rooms/${parsed.data.roomId}`);
    return { success: true, data: override };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// ----------------------------------------------------
// 5. DELETION ACTIONS — Dependency-aware, transactional
// ----------------------------------------------------

export async function deleteBuildingAction(
  prevState: ActionResponse | null,
  formData: FormData
): Promise<ActionResponse> {
  try {
    const user = await requirePermission('building:delete');

    const raw = { entityId: formData.get('entityId')?.toString() || '' };
    const parsed = deleteEntitySchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const result = await prisma.$transaction(async (tx) => {
      const building = await tx.building.findUnique({
        where: { id: parsed.data.entityId },
        include: {
          floors: {
            include: {
              _count: { select: { rooms: true } },
            },
          },
        },
      });

      if (!building) {
        throw new Error('Building not found.');
      }

      const floorCount = building.floors.length;
      const roomCount = building.floors.reduce((sum, f) => sum + f._count.rooms, 0);

      if (floorCount > 0 || roomCount > 0) {
        throw new Error(
          `Cannot delete building "${building.name}" because it contains ${floorCount} floor(s) and ${roomCount} room(s). Remove all floors and rooms first.`
        );
      }

      await tx.building.delete({ where: { id: parsed.data.entityId } });

      await recordAuditEvent(
        {
          userId: user.id,
          action: 'BUILDING_DELETE',
          entity: 'Building',
          entityId: building.id,
          oldValues: { name: building.name, code: building.code, propertyId: building.propertyId },
        },
        tx
      );

      return building;
    });

    revalidatePath('/admin/property');
    revalidatePath('/admin/property/buildings');
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function deleteFloorAction(
  prevState: ActionResponse | null,
  formData: FormData
): Promise<ActionResponse> {
  try {
    const user = await requirePermission('floor:delete');

    const raw = { entityId: formData.get('entityId')?.toString() || '' };
    const parsed = deleteEntitySchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const result = await prisma.$transaction(async (tx) => {
      const floor = await tx.floor.findUnique({
        where: { id: parsed.data.entityId },
        include: {
          _count: { select: { rooms: true } },
          building: { select: { name: true } },
        },
      });

      if (!floor) {
        throw new Error('Floor not found.');
      }

      if (floor._count.rooms > 0) {
        throw new Error(
          `Cannot delete floor "${floor.name}" in ${floor.building.name} because it contains ${floor._count.rooms} room(s). Remove all rooms from this floor first.`
        );
      }

      await tx.floor.delete({ where: { id: parsed.data.entityId } });

      await recordAuditEvent(
        {
          userId: user.id,
          action: 'FLOOR_DELETE',
          entity: 'Floor',
          entityId: floor.id,
          oldValues: { name: floor.name, floorNumber: floor.floorNumber, buildingId: floor.buildingId },
        },
        tx
      );

      return floor;
    });

    revalidatePath('/admin/property');
    revalidatePath('/admin/property/floors');
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function deleteRoomTypeAction(
  prevState: ActionResponse | null,
  formData: FormData
): Promise<ActionResponse> {
  try {
    const user = await requirePermission('room:type:delete');

    const raw = { entityId: formData.get('entityId')?.toString() || '' };
    const parsed = deleteEntitySchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const result = await prisma.$transaction(async (tx) => {
      const roomType = await tx.roomType.findUnique({
        where: { id: parsed.data.entityId },
        include: {
          _count: {
            select: {
              rooms: true,
              amenities: true,
              ratePlans: true,
              reservationItems: true,
            },
          },
        },
      });

      if (!roomType) {
        throw new Error('Room type not found.');
      }

      const dependencies: string[] = [];
      if (roomType._count.rooms > 0) {
        dependencies.push(`${roomType._count.rooms} physical room(s)`);
      }
      if (roomType._count.reservationItems > 0) {
        dependencies.push(`${roomType._count.reservationItems} reservation(s)`);
      }

      if (dependencies.length > 0) {
        throw new Error(
          `Cannot delete room type "${roomType.name}" because it has: ${dependencies.join(', ')}. Remove or reassign them first.`
        );
      }

      await tx.roomTypeAmenity.deleteMany({ where: { roomTypeId: parsed.data.entityId } });
      await tx.roomRate.deleteMany({ where: { roomTypeId: parsed.data.entityId } });
      await tx.roomType.delete({ where: { id: parsed.data.entityId } });

      await recordAuditEvent(
        {
          userId: user.id,
          action: 'ROOM_TYPE_DELETE',
          entity: 'RoomType',
          entityId: roomType.id,
          oldValues: { name: roomType.name, code: roomType.code, basePrice: roomType.basePrice.toString() },
        },
        tx
      );

      return roomType;
    });

    revalidatePath('/admin/rooms/types');
    revalidatePath('/admin/rooms');
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function deleteRoomAction(
  prevState: ActionResponse | null,
  formData: FormData
): Promise<ActionResponse> {
  try {
    const user = await requirePermission('room:delete');

    const raw = { entityId: formData.get('entityId')?.toString() || '' };
    const parsed = deleteEntitySchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const result = await prisma.$transaction(async (tx) => {
      const room = await tx.room.findUnique({
        where: { id: parsed.data.entityId },
        include: {
          roomType: { select: { name: true } },
          floor: { select: { name: true } },
        },
      });

      if (!room) {
        throw new Error('Room not found.');
      }

      const activeStatuses = ['RESERVED', 'OCCUPIED', 'DIRTY', 'CLEANING', 'MAINTENANCE', 'OUT_OF_ORDER'];
      if (activeStatuses.includes(room.status)) {
        throw new Error(
          `Cannot delete room "${room.roomNumber}" because it is currently ${room.status.replace(/_/g, ' ').toLowerCase()}. Only AVAILABLE rooms can be deleted.`
        );
      }

      const assignmentCount = await tx.roomAssignment.count({
        where: { roomId: parsed.data.entityId },
      });

      const dependencies: string[] = [];
      if (assignmentCount > 0) {
        dependencies.push(`${assignmentCount} room assignment(s)`);
      }

      if (dependencies.length > 0) {
        throw new Error(
          `Cannot delete room "${room.roomNumber}" because it has: ${dependencies.join(', ')}. Historical records must be preserved.`
        );
      }

      await tx.roomAmenityOverride.deleteMany({ where: { roomId: parsed.data.entityId } });
      await tx.room.delete({ where: { id: parsed.data.entityId } });

      await recordAuditEvent(
        {
          userId: user.id,
          action: 'ROOM_DELETE',
          entity: 'Room',
          entityId: room.id,
          oldValues: {
            roomNumber: room.roomNumber,
            status: room.status,
            roomTypeId: room.roomTypeId,
            floorId: room.floorId,
          },
        },
        tx
      );

      return room;
    });

    revalidatePath('/admin/rooms');
    revalidatePath('/admin/property');
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}
