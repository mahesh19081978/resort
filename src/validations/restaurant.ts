import { z } from 'zod';
import { OrderType, PaymentMethod, SplitType } from '@prisma/client';

export const openTableSessionSchema = z.object({
  restaurantId: z.string().min(1, 'Restaurant is required'),
  tableIds: z.array(z.string().min(1)).min(1, 'At least one table must be selected'),
  paxCount: z.coerce.number().int().min(1, 'Pax count must be at least 1').max(50),
  guestName: z.string().optional().nullable(),
});

export const closeTableSessionSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
  force: z.boolean().optional().default(false),
});

export const addTablesToSessionSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
  tableIds: z.array(z.string().min(1)).min(1, 'At least one table must be provided'),
});

export const createOrderSchema = z.object({
  restaurantId: z.string().min(1, 'Restaurant is required'),
  orderType: z.nativeEnum(OrderType),
  tableSessionId: z.string().optional().nullable(),
  stayId: z.string().optional().nullable(),
  roomId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(
    z.object({
      menuItemId: z.string().min(1, 'Menu item is required'),
      quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1').max(99),
      notes: z.string().optional().nullable(),
    })
  ).min(1, 'At least one item is required'),
  fireKOTImmediately: z.boolean().optional().default(true),
  kitchenNote: z.string().optional().nullable(),
});

export const fireKOTSchema = z.object({
  orderId: z.string().min(1, 'Order ID is required'),
  kitchenNote: z.string().optional().nullable(),
  items: z.array(
    z.object({
      orderItemId: z.string().min(1, 'Order item ID is required'),
      quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1'),
      notes: z.string().optional().nullable(),
    })
  ).min(1, 'At least one item must be fired'),
});

export const updateKOTStatusSchema = z.object({
  kotId: z.string().min(1, 'KOT ID is required'),
  status: z.enum(['PREPARING', 'READY', 'SERVED', 'CANCELLED']),
  cancellationReason: z.string().optional().nullable(),
});

export const generateBillSchema = z.object({
  orderId: z.string().min(1, 'Order ID is required'),
  discountAmount: z.coerce.number().min(0).default(0),
  discountReason: z.string().optional().nullable(),
});

export const recordBillPaymentSchema = z.object({
  billId: z.string().min(1, 'Bill ID is required'),
  amount: z.coerce.number().positive('Payment amount must be greater than zero'),
  method: z.nativeEnum(PaymentMethod),
  transactionReference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  idempotencyKey: z.string().optional().nullable(),
});

export const roomChargeBillSchema = z.object({
  billId: z.string().min(1, 'Bill ID is required'),
  stayId: z.string().min(1, 'Stay ID is required'),
  roomId: z.string().min(1, 'Room ID is required'),
  notes: z.string().optional().nullable(),
});

export const splitBillSchema = z.object({
  parentBillId: z.string().min(1, 'Parent Bill ID is required'),
  splitType: z.nativeEnum(SplitType),
  // For EQUAL split: number of parts
  equalParts: z.coerce.number().int().min(2).max(20).optional(),
  // For CUSTOM_AMOUNT split: exact amounts per child bill
  customAmounts: z.array(z.coerce.number().positive()).min(2).optional(),
  // For BY_ITEM split: allocation of order items
  itemAllocations: z.array(
    z.object({
      orderItemId: z.string().min(1),
      quantity: z.coerce.number().int().min(1),
      childBillIndex: z.coerce.number().int().min(0),
    })
  ).optional(),
});

export type OpenTableSessionInput = z.infer<typeof openTableSessionSchema>;
export type CloseTableSessionInput = z.infer<typeof closeTableSessionSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type FireKOTInput = z.infer<typeof fireKOTSchema>;
export type UpdateKOTStatusInput = z.infer<typeof updateKOTStatusSchema>;
export type GenerateBillInput = z.infer<typeof generateBillSchema>;
export type RecordBillPaymentInput = z.infer<typeof recordBillPaymentSchema>;
export type RoomChargeBillInput = z.infer<typeof roomChargeBillSchema>;
export type SplitBillInput = z.infer<typeof splitBillSchema>;

// ====================================================
// 12. MENU & CATEGORY MANAGEMENT SCHEMAS
// ====================================================

export const menuCategorySchema = z.object({
  id: z.string().optional(),
  restaurantId: z.string().min(1, 'Restaurant ID is required'),
  name: z.string().trim().min(2, 'Category name must be at least 2 characters').max(100),
  displayOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const menuItemAvailabilityEnum = z.enum([
  'AVAILABLE',
  'TEMPORARILY_UNAVAILABLE',
  'SEASONAL_UNAVAILABLE',
]);

export const menuItemSchema = z.object({
  id: z.string().optional(),
  categoryId: z.string().min(1, 'Category is required'),
  name: z.string().trim().min(2, 'Item name must be at least 2 characters').max(120),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, 'Item code must be at least 2 characters')
    .max(30)
    .regex(/^[A-Z0-9_-]+$/, 'Code can only contain letters, numbers, hyphens, and underscores'),
  description: z.string().trim().max(1000).optional().nullable(),
  price: z.coerce.number().positive('Price must be greater than zero'),
  taxRate: z.coerce.number().min(0).max(100).default(5.0),
  taxCode: z.string().trim().optional().nullable(),
  isVegetarian: z.boolean().default(true),
  isAvailable: z.boolean().default(true),
  availabilityStatus: menuItemAvailabilityEnum.default('AVAILABLE'),
  prepTimeMinutes: z.coerce.number().int().positive().max(240).optional().nullable(),
  isArchived: z.boolean().default(false),
  kitchenStation: z.string().trim().max(50).default('MAIN_KITCHEN'),
  imageUrl: z.string().trim().url().optional().nullable().or(z.literal('')),
});

export const updateMenuItemPriceSchema = z.object({
  menuItemId: z.string().min(1, 'Menu item ID is required'),
  price: z.coerce.number().positive('Price must be greater than zero'),
});

export const setMenuItemAvailabilitySchema = z.object({
  menuItemId: z.string().min(1, 'Menu item ID is required'),
  availabilityStatus: menuItemAvailabilityEnum,
  isAvailable: z.boolean().optional(),
});

// ====================================================
// 13. RECIPE / BOM MANAGEMENT SCHEMAS
// ====================================================

export const recipeIngredientInputSchema = z.object({
  inventoryItemId: z.string().min(1, 'Inventory item is required'),
  quantity: z.coerce.number().positive('Quantity must be greater than zero'),
  notes: z.string().trim().max(200).optional().nullable(),
});

export const saveRecipeSchema = z.object({
  menuItemId: z.string().min(1, 'Menu item is required'),
  yieldCount: z.coerce.number().int().positive('Yield count must be at least 1').default(1),
  instructions: z.string().trim().max(2000).optional().nullable(),
  ingredients: z.array(recipeIngredientInputSchema).min(1, 'Recipe must have at least one ingredient'),
});

// ====================================================
// 14. SITTING AREA MANAGEMENT SCHEMAS
// ====================================================

export const sittingAreaSchema = z.object({
  id: z.string().optional(),
  restaurantId: z.string().min(1, 'Restaurant ID is required'),
  name: z.string().trim().min(2, 'Sitting area name must be at least 2 characters').max(100),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, 'Code must be at least 2 characters')
    .max(30)
    .regex(/^[A-Z0-9_-]+$/, 'Code can only contain letters, numbers, hyphens, and underscores'),
  description: z.string().trim().max(500).optional().nullable(),
  displayOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

// ====================================================
// 15. TABLE MANAGEMENT SCHEMAS
// ====================================================

export const tableSchema = z.object({
  id: z.string().optional(),
  restaurantId: z.string().min(1, 'Restaurant ID is required'),
  sittingAreaId: z.string().min(1, 'Sitting area is required'),
  tableNumber: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, 'Table number is required')
    .max(20)
    .regex(/^[A-Z0-9_-]+$/, 'Table number can only contain uppercase alphanumeric, hyphens, and underscores'),
  capacity: z.coerce.number().int().positive('Capacity must be at least 1').max(50),
  isActive: z.boolean().default(true),
});

export const bulkTableSchema = z.object({
  restaurantId: z.string().min(1, 'Restaurant ID is required'),
  sittingAreaId: z.string().min(1, 'Sitting area is required'),
  prefix: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, 'Prefix is required')
    .max(10)
    .regex(/^[A-Z0-9_]+$/, 'Prefix must be uppercase alphanumeric'),
  startNumber: z.coerce.number().int().min(1, 'Starting number must be at least 1').max(999),
  count: z.coerce.number().int().min(1, 'Number of tables must be at least 1').max(50, 'Max 50 tables per bulk batch'),
  capacity: z.coerce.number().int().positive('Capacity must be at least 1').max(50),
});

