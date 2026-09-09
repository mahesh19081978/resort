import { z } from 'zod';
import { TaxScope, ServiceChargeScope, ServiceChargeRateType, CancellationFeeType } from '@prisma/client';
import { isValidTimezone } from '@/lib/util/business-time';

export const propertySettingsSchema = z.object({
  name: z.string().trim().min(2, 'Property name is required').max(100),
  address: z.string().trim().min(3, 'Address is required').max(255),
  city: z.string().trim().min(2, 'City is required').max(100),
  state: z.string().trim().min(2, 'State is required').max(100),
  postalCode: z.string().trim().min(3, 'Postal code is required').max(20),
  country: z.string().trim().min(2).max(50).default('India'),
  contactPhone: z.string().trim().min(7, 'Valid phone required').max(20),
  contactEmail: z.string().trim().email('Valid email is required'),
  website: z
    .string()
    .trim()
    .url('Website must be a valid URL')
    .refine((url) => url.startsWith('https://'), {
      message: 'Website URL must be secure (https://)',
    })
    .optional()
    .or(z.literal('')),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, {
      message: 'Invalid Indian GSTIN format (e.g. 29AAAAA0000A1Z5)',
    })
    .optional()
    .or(z.literal('')),
  logoUrl: z
    .string()
    .trim()
    .refine((val) => !val || val.startsWith('vault://'), {
      message: 'Logo must be an approved internal storage reference (vault://...)',
    })
    .optional()
    .or(z.literal('')),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .length(3, 'Currency must be 3-letter ISO code')
    .regex(/^[A-Z]{3}$/, 'Invalid currency code format')
    .default('INR'),
  timezone: z
    .string()
    .trim()
    .refine(isValidTimezone, {
      message: 'Invalid IANA timezone identifier (e.g. Asia/Kolkata)',
    })
    .default('Asia/Kolkata'),
  checkInTime: z
    .string()
    .trim()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Check-in time must be HH:MM in 24-hour format')
    .default('14:00'),
  checkOutTime: z
    .string()
    .trim()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Check-out time must be HH:MM in 24-hour format')
    .default('12:00'),
});

export const taxSchema = z
  .object({
    id: z.string().cuid().optional(),
    name: z.string().trim().min(2, 'Tax name is required').max(100),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .min(2, 'Code must be at least 2 characters')
      .max(50)
      .regex(/^[A-Z0-9_]+$/, 'Code can only contain letters, numbers, and underscores'),
    rate: z.coerce.number().min(0, 'Rate cannot be negative').max(100, 'Rate cannot exceed 100%'),
    scope: z.nativeEnum(TaxScope),
    description: z.string().trim().max(255).optional().or(z.literal('')),
    effectiveFrom: z
      .string()
      .optional()
      .nullable()
      .or(z.literal(''))
      .refine((val) => !val || !isNaN(Date.parse(val)), 'Invalid effective-from date'),
    effectiveTo: z
      .string()
      .optional()
      .nullable()
      .or(z.literal(''))
      .refine((val) => !val || !isNaN(Date.parse(val)), 'Invalid effective-to date'),
    isActive: z.boolean().default(true),
  })
  .refine(
    (data) => {
      if (data.effectiveFrom && data.effectiveTo) {
        return new Date(data.effectiveFrom) < new Date(data.effectiveTo);
      }
      return true;
    },
    {
      message: 'effectiveFrom must be strictly before effectiveTo',
      path: ['effectiveTo'],
    }
  );

export const serviceChargeSchema = z
  .object({
    id: z.string().cuid().optional(),
    name: z.string().trim().min(2, 'Name is required').max(100),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .min(2)
      .max(50)
      .regex(/^[A-Z0-9_]+$/, 'Code can only contain letters, numbers, and underscores'),
    description: z.string().trim().max(255).optional().or(z.literal('')),
    scope: z.nativeEnum(ServiceChargeScope),
    rateType: z.nativeEnum(ServiceChargeRateType).default(ServiceChargeRateType.PERCENTAGE),
    rateValue: z.coerce.number().min(0, 'Rate value cannot be negative'),
    taxable: z.boolean().default(false),
    taxId: z.string().cuid().optional().nullable().or(z.literal('')),
    effectiveFrom: z
      .string()
      .optional()
      .nullable()
      .or(z.literal(''))
      .refine((val) => !val || !isNaN(Date.parse(val)), 'Invalid effective-from date'),
    effectiveTo: z
      .string()
      .optional()
      .nullable()
      .or(z.literal(''))
      .refine((val) => !val || !isNaN(Date.parse(val)), 'Invalid effective-to date'),
    isActive: z.boolean().default(true),
  })
  .refine(
    (data) => {
      if (data.effectiveFrom && data.effectiveTo) {
        return new Date(data.effectiveFrom) < new Date(data.effectiveTo);
      }
      return true;
    },
    {
      message: 'effectiveFrom must be strictly before effectiveTo',
      path: ['effectiveTo'],
    }
  );

export const cancellationPolicySchema = z
  .object({
    id: z.string().cuid().optional(),
    name: z.string().trim().min(2, 'Name is required').max(100),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .min(2)
      .max(50)
      .regex(/^[A-Z0-9_]+$/, 'Code can only contain letters, numbers, and underscores'),
    description: z.string().trim().max(255).optional().or(z.literal('')),
    feeType: z.nativeEnum(CancellationFeeType),
    feeValue: z.coerce.number().min(0, 'Fee value cannot be negative'),
    maxFeeAmount: z.coerce.number().min(0).optional().nullable(),
    minFeeAmount: z.coerce.number().min(0).optional().nullable(),
    hoursBeforeCheckIn: z.coerce.number().int().min(0).optional().nullable(),
    ratePlanId: z.string().cuid().optional().nullable().or(z.literal('')),
    isDefault: z.boolean().default(false),
    effectiveFrom: z
      .string()
      .optional()
      .nullable()
      .or(z.literal(''))
      .refine((val) => !val || !isNaN(Date.parse(val)), 'Invalid effective-from date'),
    effectiveTo: z
      .string()
      .optional()
      .nullable()
      .or(z.literal(''))
      .refine((val) => !val || !isNaN(Date.parse(val)), 'Invalid effective-to date'),
    isActive: z.boolean().default(true),
  })
  .refine(
    (data) => {
      if (data.effectiveFrom && data.effectiveTo) {
        return new Date(data.effectiveFrom) < new Date(data.effectiveTo);
      }
      return true;
    },
    {
      message: 'effectiveFrom must be strictly before effectiveTo',
      path: ['effectiveTo'],
    }
  );

export const invoiceConfigSchema = z.object({
  prefix: z.string().trim().min(1).max(10).toUpperCase().default('INV'),
  termsAndConditions: z.string().trim().max(2000).optional().or(z.literal('')),
  footerNote: z.string().trim().max(500).optional().or(z.literal('')),
  showTaxBreakdown: z.boolean().default(true),
  showPaymentHistory: z.boolean().default(true),
});

export const restaurantSettingsSchema = z.object({
  id: z.string().cuid({ message: 'Invalid restaurant ID' }),
  name: z.string().trim().min(2, 'Name is required').max(100),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  phone: z.string().trim().max(20).optional().or(z.literal('')),
  email: z.string().trim().email('Invalid email').optional().or(z.literal('')),
  openingTime: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:MM in 24h format').optional().or(z.literal('')),
  closingTime: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:MM in 24h format').optional().or(z.literal('')),
  isActive: z.boolean().default(true),
});
