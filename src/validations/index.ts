import { z } from 'zod';

export const bookingSearchSchema = z.object({
  checkIn: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid check-in date' }),
  checkOut: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid check-out date' }),
  adults: z.coerce.number().int().min(1, 'At least 1 adult is required').max(10),
  children: z.coerce.number().int().min(0).max(10).default(0),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export type BookingSearchInput = z.infer<typeof bookingSearchSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export * from './pms';
export * from './frontdesk';