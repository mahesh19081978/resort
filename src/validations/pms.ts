import { z } from 'zod';
import { PhysicalRoomStatus } from '@prisma/client';

export const propertyUpdateSchema = z.object({
  propertyId: z.string().cuid({ message: 'Invalid property ID' }),
  name: z.string().trim().min(3, 'Property name must be at least 3 characters').max(100),
  address: z.string().trim().min(5, 'Address must be at least 5 characters').max(255),
  city: z.string().trim().min(2, 'City is required').max(100),
  state: z.string().trim().min(2, 'State is required').max(100),
  postalCode: z.string().trim().min(3, 'Postal code is required').max(20),
  country: z.string().trim().min(2, 'Country is required').max(50).default('India'),
  contactPhone: z.string().trim().min(8, 'Contact phone is required').max(25),
  contactEmail: z.string().trim().email('Valid email is required').max(100),
});

export const buildingSchema = z.object({
  propertyId: z.string().cuid({ message: 'Invalid property ID' }),
  name: z.string().trim().min(2, 'Building name must be at least 2 characters').max(100),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, 'Building code must be at least 2 characters')
    .max(20)
    .regex(/^[A-Z0-9_-]+$/, 'Building code must be alphanumeric with underscores or hyphens'),
});

export const floorSchema = z.object({
  buildingId: z.string().cuid({ message: 'Invalid building ID' }),
  floorNumber: z.coerce.number().int({ message: 'Floor number must be an integer' }).min(-5).max(150),
  name: z.string().trim().min(1, 'Floor name is required').max(50),
});

export const roomTypeSchema = z.object({
  name: z.string().trim().min(3, 'Room type name must be at least 3 characters').max(100),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, 'Room type code must be at least 2 characters')
    .max(20)
    .regex(/^[A-Z0-9_-]+$/, 'Room type code must be alphanumeric with underscores or hyphens'),
  description: z.string().trim().min(5, 'Description must be at least 5 characters').max(1000),
  basePrice: z.coerce.number().positive('Base price must be greater than zero').max(1000000),
  maxOccupancy: z.coerce.number().int().min(1, 'Max occupancy must be at least 1').max(20),
  maxAdults: z.coerce.number().int().min(1, 'Max adults must be at least 1').max(20),
  maxChildren: z.coerce.number().int().min(0, 'Max children cannot be negative').max(10).default(0),
  totalInventory: z.coerce.number().int().min(0, 'Total inventory cannot be negative').max(1000).default(0),
  displayOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const roomTypeUpdateSchema = roomTypeSchema.partial().extend({
  roomTypeId: z.string().cuid({ message: 'Invalid room type ID' }),
});

export const roomGenerationSchema = z.object({
  propertyId: z.string().cuid({ message: 'Invalid property ID' }),
  floorId: z.string().cuid({ message: 'Invalid floor ID' }),
  roomTypeId: z.string().cuid({ message: 'Invalid room type ID' }),
  prefix: z
    .string()
    .trim()
    .min(1, 'Prefix is required')
    .max(10)
    .regex(/^[A-Za-z0-9-]+$/, 'Prefix must be alphanumeric and may include hyphens'),
  startingNumber: z.coerce.number().int().positive('Starting number must be positive').max(99999),
  count: z.coerce.number().int().min(1, 'Count must be at least 1').max(100, 'Batch maximum is 100 rooms'),
  notes: z.string().trim().max(255).optional(),
});

export const roomStatusTransitionSchema = z.object({
  roomId: z.string().cuid({ message: 'Invalid room ID' }),
  targetStatus: z.nativeEnum(PhysicalRoomStatus, { message: 'Invalid room status' }),
  notes: z.string().trim().max(500).optional(),
});

export const amenitySchema = z.object({
  name: z.string().trim().min(2, 'Amenity name must be at least 2 characters').max(100),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, 'Amenity code must be at least 2 characters')
    .max(30)
    .regex(/^[A-Z0-9_-]+$/, 'Amenity code must be uppercase alphanumeric'),
  icon: z.string().trim().max(50).optional(),
  description: z.string().trim().max(255).optional(),
  isActive: z.boolean().default(true),
});

export const roomTypeAmenitiesSchema = z.object({
  roomTypeId: z.string().cuid({ message: 'Invalid room type ID' }),
  amenityIds: z.array(z.string().cuid()).min(0),
});

export const roomAmenityOverrideSchema = z.object({
  roomId: z.string().cuid({ message: 'Invalid room ID' }),
  amenityId: z.string().cuid({ message: 'Invalid amenity ID' }),
  hasAmenity: z.boolean(),
  notes: z.string().trim().max(255).optional(),
});

export type PropertyUpdateInput = z.infer<typeof propertyUpdateSchema>;
export type BuildingInput = z.infer<typeof buildingSchema>;
export type FloorInput = z.infer<typeof floorSchema>;
export type RoomTypeInput = z.infer<typeof roomTypeSchema>;
export type RoomTypeUpdateInput = z.infer<typeof roomTypeUpdateSchema>;
export type RoomGenerationInput = z.infer<typeof roomGenerationSchema>;
export type RoomStatusTransitionInput = z.infer<typeof roomStatusTransitionSchema>;
export type AmenityInput = z.infer<typeof amenitySchema>;
export type RoomTypeAmenitiesInput = z.infer<typeof roomTypeAmenitiesSchema>;
export type RoomAmenityOverrideInput = z.infer<typeof roomAmenityOverrideSchema>;
