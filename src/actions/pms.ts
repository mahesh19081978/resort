'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db/prisma';
import { requirePermission } from '@/lib/auth/auth';
import { recordAuditEvent } from '@/lib/auth/audit';
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

    const existing = await prisma.property.findUnique({
      where: { id: parsed.data.propertyId },
    });

    if (!existing) {
      return { success: false, error: 'Property not found.' };
    }

    const updated = await prisma.property.update({
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

    await recordAuditEvent({
      userId: user.id,
      action: 'PROPERTY_UPDATE',
      entity: 'Property',
      entityId: updated.id,
      oldValues: { name: existing.name, phone: existing.contactPhone, email: existing.contactEmail },
      newValues: { name: updated.name, phone: updated.contactPhone, email: updated.contactEmail },
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

    // Verify Property exists
    const property = await prisma.property.findUnique({
      where: { id: parsed.data.propertyId },
    });
    if (!property) {
      return { success: false, error: 'Target property not found.' };
    }

    // Check duplicate code within property
    const existing = await prisma.building.findUnique({
      where: {
        propertyId_code: {
          propertyId: parsed.data.propertyId,
          code: parsed.data.code,
        },
      },
    });
    if (existing) {
      return { success: false, error: 'A building with this code already exists in this property.' };
    }

    const building = await prisma.building.create({
      data: {
        propertyId: parsed.data.propertyId,
        name: parsed.data.name,
        code: parsed.data.code,
      },
    });

    await recordAuditEvent({
      userId: user.id,
      action: 'BUILDING_CREATE',
      entity: 'Building',
      entityId: building.id,
      newValues: { name: building.name, code: building.code, propertyId: building.propertyId },
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

    const building = await prisma.building.findUnique({
      where: { id: parsed.data.buildingId },
    });
    if (!building) {
      return { success: false, error: 'Building not found.' };
    }

    const existing = await prisma.floor.findUnique({
      where: {
        buildingId_floorNumber: {
          buildingId: parsed.data.buildingId,
          floorNumber: parsed.data.floorNumber,
        },
      },
    });
    if (existing) {
      return { success: false, error: 'This floor number already exists in this building.' };
    }

    const floor = await prisma.floor.create({
      data: {
        buildingId: parsed.data.buildingId,
        floorNumber: parsed.data.floorNumber,
        name: parsed.data.name,
      },
    });

    await recordAuditEvent({
      userId: user.id,
      action: 'FLOOR_CREATE',
      entity: 'Floor',
      entityId: floor.id,
      newValues: { name: floor.name, floorNumber: floor.floorNumber, buildingId: floor.buildingId },
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

    const existing = await prisma.roomType.findUnique({
      where: { code: parsed.data.code },
    });
    if (existing) {
      return { success: false, error: 'A room type with this code already exists.' };
    }

    const roomType = await prisma.roomType.create({
      data: {
        name: parsed.data.name,
        code: parsed.data.code,
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

    await recordAuditEvent({
      userId: user.id,
      action: 'ROOM_TYPE_CREATE',
      entity: 'RoomType',
      entityId: roomType.id,
      newValues: { code: roomType.code, name: roomType.name, basePrice: roomType.basePrice.toString() },
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

    const existing = await prisma.roomType.findUnique({
      where: { id: parsed.data.roomTypeId },
    });
    if (!existing) {
      return { success: false, error: 'Room type not found.' };
    }

    const updated = await prisma.roomType.update({
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

    await recordAuditEvent({
      userId: user.id,
      action: 'ROOM_TYPE_UPDATE',
      entity: 'RoomType',
      entityId: updated.id,
      oldValues: { name: existing.name, basePrice: existing.basePrice.toString() },
      newValues: { name: updated.name, basePrice: updated.basePrice.toString() },
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

    const result = await executeBatchRoomGeneration(parsed.data, prisma);

    await recordAuditEvent({
      userId: user.id,
      action: 'ROOMS_BATCH_GENERATE',
      entity: 'Room',
      entityId: parsed.data.propertyId,
      newValues: {
        createdCount: result.createdCount,
        roomNumbers: result.roomNumbers,
        floorId: parsed.data.floorId,
        roomTypeId: parsed.data.roomTypeId,
      },
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

    const room = await prisma.room.findUnique({
      where: { id: parsed.data.roomId },
    });

    if (!room) {
      return { success: false, error: 'Room not found.' };
    }

    // Validate manual operational transition
    const validation = validateManualStatusTransition(room.status, parsed.data.targetStatus);
    if (!validation.allowed) {
      return { success: false, error: validation.reason };
    }

    const updated = await prisma.room.update({
      where: { id: parsed.data.roomId },
      data: {
        status: parsed.data.targetStatus,
        ...(parsed.data.notes && { notes: parsed.data.notes }),
      },
    });

    await recordAuditEvent({
      userId: user.id,
      action: 'ROOM_STATUS_CHANGE',
      entity: 'Room',
      entityId: updated.id,
      oldValues: { status: room.status },
      newValues: { status: updated.status, notes: parsed.data.notes },
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

    const existing = await prisma.amenity.findFirst({
      where: {
        OR: [{ code: parsed.data.code }, { name: parsed.data.name }],
      },
    });
    if (existing) {
      return { success: false, error: 'An amenity with this code or name already exists.' };
    }

    const amenity = await prisma.amenity.create({
      data: {
        name: parsed.data.name,
        code: parsed.data.code,
        icon: parsed.data.icon,
        description: parsed.data.description,
        isActive: parsed.data.isActive,
      },
    });

    await recordAuditEvent({
      userId: user.id,
      action: 'AMENITY_CREATE',
      entity: 'Amenity',
      entityId: amenity.id,
      newValues: { name: amenity.name, code: amenity.code },
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
    });

    await recordAuditEvent({
      userId: user.id,
      action: 'ROOM_TYPE_AMENITIES_UPDATE',
      entity: 'RoomType',
      entityId: parsed.data.roomTypeId,
      newValues: { amenityCount: parsed.data.amenityIds.length, amenityIds: parsed.data.amenityIds },
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

    const override = await prisma.roomAmenityOverride.upsert({
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

    await recordAuditEvent({
      userId: user.id,
      action: 'ROOM_AMENITY_OVERRIDE',
      entity: 'RoomAmenityOverride',
      entityId: `${parsed.data.roomId}:${parsed.data.amenityId}`,
      newValues: { hasAmenity: override.hasAmenity, notes: override.notes },
    });

    revalidatePath(`/admin/rooms/${parsed.data.roomId}`);
    return { success: true, data: override };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}
