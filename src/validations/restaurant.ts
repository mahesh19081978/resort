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
