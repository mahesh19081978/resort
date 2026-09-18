import { NextRequest, NextResponse } from 'next/server';
import { getAvailableRoomTypes } from '@/lib/availability/service';
import { availabilitySearchSchema } from '@/lib/availability/schema';
import { PUBLIC_DEFAULT_RATE_PLAN_CODE, resolveRatePlanByCode } from '@/lib/booking/rate-resolver';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const checkIn = searchParams.get('checkIn');
    const checkOut = searchParams.get('checkOut');
    const guests = searchParams.get('guests');
    const adults = searchParams.get('adults');
    const children = searchParams.get('children');
    const ratePlanCode = searchParams.get('ratePlanCode') || PUBLIC_DEFAULT_RATE_PLAN_CODE;

    const parsed = availabilitySearchSchema.safeParse({
      checkIn: checkIn || undefined,
      checkOut: checkOut || undefined,
      guests: guests ? Number(guests) : 1,
      adults: adults ? Number(adults) : undefined,
      children: children ? Number(children) : undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid search parameters', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const ratePlan = await resolveRatePlanByCode(ratePlanCode);
    const result = await getAvailableRoomTypes(parsed.data, undefined, ratePlan.id);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API_AVAILABILITY_ERROR]', error);
    return NextResponse.json(
      { error: 'Failed to query room availability' },
      { status: 500 }
    );
  }
}
