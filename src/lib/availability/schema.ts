import { z } from 'zod';

const PROPERTY_TIMEZONE = 'Asia/Kolkata';

function getTodayDateString(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PROPERTY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

export const availabilitySearchSchema = z
  .object({
    checkIn: z.string().min(1, 'Check-in date is required'),
    checkOut: z.string().min(1, 'Check-out date is required'),
    guests: z.coerce
      .number()
      .int()
      .min(1, 'At least 1 guest is required')
      .max(20, 'Maximum 20 guests allowed'),
  })
  .refine(
    (data) => {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      return dateRegex.test(data.checkIn) && dateRegex.test(data.checkOut);
    },
    { message: 'Invalid date format. Use YYYY-MM-DD.', path: ['dates'] }
  )
  .refine(
    (data) => {
      if (data.checkOut <= data.checkIn) {
        return false;
      }
      return true;
    },
    { message: 'Check-out date must be after check-in date.', path: ['checkOut'] }
  )
  .refine(
    (data) => {
      const today = getTodayDateString();
      return data.checkIn >= today;
    },
    { message: 'Check-in date cannot be in the past.', path: ['checkIn'] }
  );

export type AvailabilitySearchParams = z.infer<typeof availabilitySearchSchema>;
