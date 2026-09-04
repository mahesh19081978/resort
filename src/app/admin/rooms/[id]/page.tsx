import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { requirePermission } from '@/lib/auth/auth';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  BedDouble,
  Building,
  Layers,
  Sparkles,
  ShieldCheck,
  Tag,
  CheckCircle2,
  Calendar,
  User,
  Save,
} from 'lucide-react';
import { updateRoomStatusAction, setRoomAmenityOverrideAction } from '@/actions/pms';
import { computeEffectiveRoomAmenities } from '@/lib/pms/amenities';
import { PhysicalRoomStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

interface RoomDetailsPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function RoomDetailsPage({ params }: RoomDetailsPageProps) {
  await requirePermission('room:read');
  const { id } = await params;

  let room: any = null;
  let allAmenities: any[] = [];

  try {
    [room, allAmenities] = await Promise.all([
      prisma.room.findUnique({
        where: { id },
        include: {
          property: true,
          floor: {
            include: {
              building: true,
            },
          },
          roomType: {
            include: {
              amenities: {
                include: {
                  amenity: true,
                },
              },
            },
          },
          amenityOverrides: {
            include: {
              amenity: true,
            },
          },
        },
      }),
      prisma.amenity.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      }),
    ]);
  } catch (error) {
    console.warn('[RoomDetailsPage] Database query error:', (error as Error).message);
  }

  if (!room) {
    notFound();
  }

  const effectiveAmenities = computeEffectiveRoomAmenities(
    room.roomType.amenities,
    room.amenityOverrides
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Breadcrumb Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/rooms">
            <Button variant="outline" size="sm" className="gap-1 text-xs">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Rooms
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-serif text-2xl font-bold text-resort-charcoal">
                Room {room.roomNumber}
              </h1>
              <span className="rounded bg-resort-forest text-resort-ivory text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider">
                {room.status}
              </span>
            </div>
            <p className="text-xs text-resort-stone mt-0.5">
              {room.property.name} &bull; {room.floor.building.name} &bull; {room.floor.name}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Room Specs & Effective Amenities */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Physical Room Specifications</CardTitle>
              <CardDescription className="text-xs">
                Structural location and room category assignment.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                <div className="p-3 rounded-md bg-resort-ivory/50 border border-resort-sand/60">
                  <div className="text-[10px] font-semibold text-resort-stone uppercase">Room Number</div>
                  <div className="text-base font-bold font-mono text-resort-forest mt-1">
                    {room.roomNumber}
                  </div>
                </div>

                <div className="p-3 rounded-md bg-resort-ivory/50 border border-resort-sand/60">
                  <div className="text-[10px] font-semibold text-resort-stone uppercase">Room Type</div>
                  <div className="font-semibold text-resort-charcoal mt-1">
                    {room.roomType.name}
                  </div>
                  <div className="text-[10px] text-resort-stone">Code: {room.roomType.code}</div>
                </div>

                <div className="p-3 rounded-md bg-resort-ivory/50 border border-resort-sand/60">
                  <div className="text-[10px] font-semibold text-resort-stone uppercase">Base Rate</div>
                  <div className="text-base font-bold font-mono text-resort-charcoal mt-1">
                    ₹{Number(room.roomType.basePrice).toLocaleString('en-IN')}
                  </div>
                  <div className="text-[10px] text-resort-stone">per night</div>
                </div>

                <div className="p-3 rounded-md bg-resort-ivory/50 border border-resort-sand/60">
                  <div className="text-[10px] font-semibold text-resort-stone uppercase">Building</div>
                  <div className="font-semibold text-resort-charcoal mt-1">
                    {room.floor.building.name}
                  </div>
                </div>

                <div className="p-3 rounded-md bg-resort-ivory/50 border border-resort-sand/60">
                  <div className="text-[10px] font-semibold text-resort-stone uppercase">Floor</div>
                  <div className="font-semibold text-resort-charcoal mt-1">
                    {room.floor.name} (Level {room.floor.floorNumber})
                  </div>
                </div>

                <div className="p-3 rounded-md bg-resort-ivory/50 border border-resort-sand/60">
                  <div className="text-[10px] font-semibold text-resort-stone uppercase">Capacity</div>
                  <div className="font-semibold text-resort-charcoal mt-1">
                    Up to {room.roomType.maxOccupancy} Guests
                  </div>
                  <div className="text-[10px] text-resort-stone">
                    {room.roomType.maxAdults} Adults, {room.roomType.maxChildren} Children
                  </div>
                </div>
              </div>

              {room.notes && (
                <div className="p-3 rounded border border-resort-sand bg-white text-xs">
                  <span className="font-semibold text-resort-charcoal">Operational Notes: </span>
                  <span className="text-resort-stone">{room.notes}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Effective Amenities (RoomType Defaults + Room Overrides) */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Effective Room Amenities</CardTitle>
                <CardDescription className="text-xs">
                  Calculated dynamically from RoomType defaults + Room-level overrides.
                </CardDescription>
              </div>
              <span className="rounded-full bg-resort-sand/40 px-2.5 py-0.5 text-xs font-semibold text-resort-forest">
                {effectiveAmenities.length} Active Amenities
              </span>
            </CardHeader>
            <CardContent>
              {effectiveAmenities.length === 0 ? (
                <p className="text-xs text-resort-stone">No amenities configured for this room.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {effectiveAmenities.map((am) => (
                    <div
                      key={am.id}
                      className="p-3 rounded border border-resort-sand bg-white flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-semibold text-xs text-resort-charcoal">{am.name}</span>
                        {am.isOverride ? (
                          <span className="rounded bg-amber-100 text-amber-800 text-[9px] font-bold px-1.5 py-0.2">
                            Override
                          </span>
                        ) : (
                          <span className="rounded bg-emerald-100 text-emerald-800 text-[9px] font-bold px-1.5 py-0.2">
                            Type Default
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-resort-stone font-mono mt-1">Code: {am.code}</div>
                      {am.overrideNote && (
                        <div className="text-[10px] text-amber-700 italic mt-1">
                          Note: {am.overrideNote}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Future PMS Extension Points (Unfaked Placeholders) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Operational Lifecycle Placeholders</CardTitle>
              <CardDescription className="text-xs">
                Reserved extension points for Phase 0.5 Check-In / Check-Out and Housekeeping lifecycles.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-resort-stone">
              <div className="p-3 rounded border border-dashed border-resort-sand flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-resort-stone" />
                  <span>Current Stay / Active Guest Assignment:</span>
                </div>
                <span className="text-[11px] font-medium text-resort-stone italic">
                  Available for Assignment (No active stay)
                </span>
              </div>
              <div className="p-3 rounded border border-dashed border-resort-sand flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-resort-stone" />
                  <span>Upcoming Room Reservations:</span>
                </div>
                <span className="text-[11px] font-medium text-resort-stone italic">
                  Commercial Engine Connected (Phase 0.6)
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right 1 Column: Manual Actions (Status & Override Form) */}
        <div className="space-y-6">
          {/* Change Operational Status Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Operational Status Transition</CardTitle>
              <CardDescription className="text-xs">
                Validated server-side against the room state machine.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                action={async (formData) => {
                  'use server';
                  await updateRoomStatusAction(null, formData);
                }}
                className="space-y-3"
              >
                <input type="hidden" name="roomId" value={room.id} />
                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                    New Operational Status *
                  </label>
                  <select
                    name="targetStatus"
                    defaultValue={room.status}
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                  >
                    <option value="AVAILABLE">Available (Inspection Passed)</option>
                    <option value="CLEANING">Cleaning (Housekeeping Active)</option>
                    <option value="DIRTY">Dirty (Vacated/Turn-down)</option>
                    <option value="MAINTENANCE">Maintenance (Engineering)</option>
                    <option value="OUT_OF_ORDER">Out of Order (Blocked)</option>
                  </select>
                  <p className="text-[10px] text-resort-stone mt-1">
                    Workflow states (RESERVED, OCCUPIED) are restricted to front desk check-in workflows.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                    Transition Reason / Notes
                  </label>
                  <textarea
                    name="notes"
                    rows={2}
                    placeholder="e.g. AC filter maintenance complete..."
                    className="w-full rounded border border-resort-sand bg-white p-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                  />
                </div>

                <Button type="submit" variant="primary" size="sm" className="w-full text-xs">
                  Apply Operational Transition
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Amenity Room Override Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Room Amenity Override</CardTitle>
              <CardDescription className="text-xs">
                Add special amenities or mark broken items for this room.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                action={async (formData) => {
                  'use server';
                  await setRoomAmenityOverrideAction(null, formData);
                }}
                className="space-y-3"
              >
                <input type="hidden" name="roomId" value={room.id} />

                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                    Amenity *
                  </label>
                  <select
                    name="amenityId"
                    required
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                  >
                    <option value="">Select Amenity</option>
                    {allAmenities.map((am) => (
                      <option key={am.id} value={am.id}>
                        {am.name} ({am.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                    Override Action *
                  </label>
                  <select
                    name="hasAmenity"
                    required
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                  >
                    <option value="true">Include / Force Active in Room</option>
                    <option value="false">Exclude / Mark Removed or Defective</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                    Override Reason (Optional)
                  </label>
                  <input
                    type="text"
                    name="notes"
                    placeholder="e.g. Upgraded extra refrigerator..."
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                  />
                </div>

                <Button type="submit" variant="secondary" size="sm" className="w-full text-xs">
                  Save Amenity Override
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
