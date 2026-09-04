'use server';

import { bookingSearchSchema } from '@/validations';
import { ok, fail, ActionResult } from '@/lib/errors';

export interface RoomSearchResult {
  roomTypeId: string;
  name: string;
  description: string;
  basePrice: number;
  availableRoomsCount: number;
}

export async function searchRoomAvailabilityAction(
  formData: FormData
): Promise<ActionResult<RoomSearchResult[]>> {
  try {
    const rawData = {
      checkIn: formData.get('checkIn'),
      checkOut: formData.get('checkOut'),
      adults: formData.get('adults'),
      children: formData.get('children') || 0,
    };

    const parsed = bookingSearchSchema.safeParse(rawData);
    if (!parsed.success) {
      return fail('Validation error', 'VALIDATION_ERROR', parsed.error.flatten().fieldErrors);
    }

    // Phase 0.1 architectural placeholder - mock response demonstrating server action contract
    const mockResults: RoomSearchResult[] = [
      {
        roomTypeId: 'rt_deluxe_chalet',
        name: 'Deluxe Heritage Chalet',
        description: 'Private forest-view luxury suite with teak wood finishing and stone bath.',
        basePrice: 12500,
        availableRoomsCount: 4,
      },
      {
        roomTypeId: 'rt_premium_villa',
        name: 'Royal Lakefront Villa',
        description: 'Exclusive lakefront villa with private plunge pool and bespoke butler service.',
        basePrice: 24000,
        availableRoomsCount: 2,
      },
    ];

    return ok(mockResults);
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Failed to search availability', 'INTERNAL_ERROR');
  }
}