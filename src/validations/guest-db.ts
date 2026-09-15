import { z } from 'zod';

export const GuestSearchInputSchema = z.object({
  query: z.string().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
  filters: z
    .object({
      status: z.enum(['all', 'currently_staying', 'upcoming', 'completed', 'cancelled', 'no_show']).default('all'),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      dateSemantic: z.enum(['stay', 'checkin', 'checkout', 'booking']).default('stay'),
      roomNumber: z.string().optional(),
      roomType: z.string().optional(),
      building: z.string().optional(),
      floor: z.string().optional(),
      reservationStatus: z.string().default('all'),
      bookingSource: z.string().default('all'),
      paymentStatus: z.string().default('all'),
      city: z.string().optional(),
      hasPhoto: z.boolean().optional(),
      hasDocuments: z.boolean().optional(),
    })
    .default({}),
});

export const GuestProfileInputSchema = z.object({
  guestId: z.string().cuid({ message: 'Invalid guest ID' }),
});

export const StayDetailInputSchema = z.object({
  stayId: z.string().cuid({ message: 'Invalid stay ID' }),
});

export const StayInvestigationInputSchema = z.object({
  dateFrom: z.string(),
  dateTo: z.string().optional(),
  roomNumber: z.string().optional(),
  floor: z.string().optional(),
  building: z.string().optional(),
  status: z.enum(['all', 'active', 'checked_out', 'cancelled']).default('all'),
});

export const CurrentlyStayingInputSchema = z.object({
  roomNumber: z.string().optional(),
  floor: z.string().optional(),
  building: z.string().optional(),
  status: z.enum(['all', 'arrivals_today', 'departures_today', 'in_house', 'long_stay']).default('all'),
});

export const GuestDeduplicateInputSchema = z.object({
  primaryGuestId: z.string().cuid({ message: 'Invalid primary guest ID' }),
  duplicateGuestId: z.string().cuid({ message: 'Invalid duplicate guest ID' }),
});

export const PostStayChargeInputSchema = z.object({
  stayId: z.string().cuid({ message: 'Invalid stay ID' }),
  description: z.string().min(1),
  amount: z.number().positive(),
  isTaxInclusive: z.boolean().default(false),
  categoryId: z.string().cuid({ message: 'Invalid category ID' }).optional(),
});
