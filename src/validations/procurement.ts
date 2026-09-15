import { z } from 'zod';
import { PaymentMethod } from '@prisma/client';

export const createVendorSchema = z.object({
  name: z.string().trim().min(2, 'Vendor name is required').max(100),
  companyName: z.string().trim().min(2, 'Company name is required').max(100),
  contactPerson: z.string().trim().max(100).optional().or(z.literal('')),
  phone: z.string().trim().min(8, 'Phone number must be at least 8 digits').max(20),
  email: z.string().trim().email('Invalid email address').optional().or(z.literal('')),
  address: z.string().trim().max(255).optional().or(z.literal('')),
  gstin: z.string().trim().max(20).optional().or(z.literal('')),
  pan: z.string().trim().max(20).optional().or(z.literal('')),
  paymentTermsDays: z.coerce.number().int().min(0).max(365).default(30),
  bankName: z.string().trim().max(100).optional().or(z.literal('')),
  bankAccountNumber: z.string().trim().max(50).optional().or(z.literal('')),
  bankIfsc: z.string().trim().max(20).optional().or(z.literal('')),
});

export const updateVendorSchema = createVendorSchema.partial().extend({
  vendorId: z.string().cuid('Invalid vendor ID'),
  isActive: z.boolean().optional(),
});

export const purchaseRequestItemSchema = z.object({
  itemId: z.string().cuid('Invalid item ID'),
  quantity: z.coerce.number().positive('Quantity must be strictly positive (> 0)'),
  estimatedCost: z.coerce.number().min(0, 'Estimated cost cannot be negative').optional(),
  notes: z.string().trim().max(255).optional().or(z.literal('')),
});

export const createPurchaseRequestSchema = z.object({
  department: z.string().trim().min(2, 'Department is required').max(100),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
  items: z.array(purchaseRequestItemSchema).min(1, 'At least one item is required'),
});

export const purchaseOrderItemSchema = z.object({
  itemId: z.string().cuid('Invalid item ID'),
  orderedQuantity: z.coerce.number().positive('Ordered quantity must be positive'),
  unitPrice: z.coerce.number().min(0, 'Unit price cannot be negative'),
  taxRate: z.coerce.number().min(0).max(100).default(0),
});

export const createPurchaseOrderSchema = z.object({
  vendorId: z.string().cuid('Invalid vendor ID'),
  requestId: z.string().cuid('Invalid request ID').optional().or(z.literal('')),
  expectedDate: z.string().optional().or(z.literal('')),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
  items: z.array(purchaseOrderItemSchema).min(1, 'At least one PO line item is required'),
});

export const grnItemInputSchema = z.object({
  itemId: z.string().cuid('Invalid item ID'),
  receivedQuantity: z.coerce.number().min(0, 'Received quantity cannot be negative'),
  acceptedQuantity: z.coerce.number().min(0, 'Accepted quantity cannot be negative'),
  rejectedQuantity: z.coerce.number().min(0, 'Rejected quantity cannot be negative').default(0),
  damagedQuantity: z.coerce.number().min(0, 'Damaged quantity cannot be negative').default(0),
  rejectionReason: z.string().trim().max(255).optional().or(z.literal('')),
  unitPrice: z.coerce.number().min(0, 'Unit price cannot be negative'),
});

export const createGrnSchema = z.object({
  poId: z.string().cuid('Invalid PO ID'),
  storeId: z.string().cuid('Receiving store is required'),
  challanNumber: z.string().trim().max(100).optional().or(z.literal('')),
  challanDate: z.string().optional().or(z.literal('')),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
  items: z.array(grnItemInputSchema).min(1, 'At least one GRN item is required'),
});

export const createPurchaseBillSchema = z.object({
  vendorId: z.string().cuid('Invalid vendor ID'),
  vendorBillNo: z.string().trim().min(1, 'Vendor bill/invoice number is required').max(100),
  poId: z.string().cuid('Invalid PO ID').optional().or(z.literal('')),
  grnId: z.string().cuid('Invalid GRN ID').optional().or(z.literal('')),
  billDate: z.string().min(1, 'Bill date is required'),
  dueDate: z.string().min(1, 'Due date is required'),
  subtotal: z.coerce.number().min(0, 'Subtotal cannot be negative'),
  taxAmount: z.coerce.number().min(0, 'Tax amount cannot be negative').default(0),
  totalAmount: z.coerce.number().positive('Total amount must be positive'),
});

export const paymentAllocationSchema = z.object({
  purchaseBillId: z.string().cuid('Invalid purchase bill ID'),
  amountAllocated: z.coerce.number().positive('Allocation must be positive'),
});

export const createVendorPaymentSchema = z.object({
  vendorId: z.string().cuid('Invalid vendor ID'),
  amount: z.coerce.number().positive('Payment amount must be positive'),
  paymentMethod: z.nativeEnum(PaymentMethod, { message: 'Valid payment method required' }),
  transactionReference: z.string().trim().max(100).optional().or(z.literal('')),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
  allocations: z.array(paymentAllocationSchema).min(1, 'At least one bill allocation is required'),
});
