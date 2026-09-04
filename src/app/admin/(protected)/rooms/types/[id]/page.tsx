import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import type { Prisma } from '@prisma/client';
import { requirePermission } from '@/lib/auth/auth';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Save, Sparkles, Layers } from 'lucide-react';
import { updateRoomTypeAction, updateRoomTypeAmenitiesAction } from '@/actions/pms';

export const dynamic = 'force-dynamic';

type RoomTypeDetail = Prisma.RoomTypeGetPayload<{
  include: {
    amenities: {
      include: {
        amenity: true;
      };
    };
    _count: {
      select: { rooms: true };
    };
  };
}>;

type AmenityItem = Prisma.AmenityGetPayload<{}>;

interface RoomTypeDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function RoomTypeDetailPage({ params }: RoomTypeDetailPageProps) {
  await requirePermission('room:read');
  const { id } = await params;

  let roomType: RoomTypeDetail | null = null;
  let allAmenities: AmenityItem[] = [];

  try {
    [roomType, allAmenities] = await Promise.all([
      prisma.roomType.findUnique({
        where: { id },
        include: {
          amenities: {
            include: {
              amenity: true,
            },
          },
          _count: {
            select: { rooms: true },
          },
        },
      }),
      prisma.amenity.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      }),
    ]);
  } catch (error) {
    console.warn('[RoomTypeDetailPage] Database query error:', (error as Error).message);
  }

  if (!roomType) {
    notFound();
  }

  const assignedAmenityIds = new Set(roomType.amenities.map((rta) => rta.amenityId));

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/rooms/types">
          <Button variant="outline" size="sm" className="gap-1 text-xs">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Room Types
          </Button>
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-serif text-2xl font-bold text-resort-charcoal">
              {roomType.name} ({roomType.code})
            </h1>
            <span
              className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                roomType.isActive
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'bg-stone-100 text-stone-700'
              }`}
            >
              {roomType.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
          <p className="text-xs text-resort-stone mt-0.5">
            Modify commercial room parameters and default amenity package.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column: Room Type Details Form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Commercial Room Parameters</CardTitle>
            <CardDescription className="text-xs">
              Changes take effect for future reservations and inventory checks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={async (formData) => {
                'use server';
                await updateRoomTypeAction(null, formData);
              }}
              className="space-y-3"
            >
              <input type="hidden" name="roomTypeId" value={roomType.id} />

              <div>
                <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                  Room Type Name *
                </label>
                <input
                  type="text"
                  name="name"
                  defaultValue={roomType.name}
                  required
                  className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                  Description *
                </label>
                <textarea
                  name="description"
                  defaultValue={roomType.description}
                  required
                  rows={3}
                  className="w-full rounded border border-resort-sand bg-white p-2.5 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                    Base Price (₹) *
                  </label>
                  <input
                    type="number"
                    name="basePrice"
                    defaultValue={Number(roomType.basePrice)}
                    required
                    min={1}
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                    Inventory Quota *
                  </label>
                  <input
                    type="number"
                    name="totalInventory"
                    defaultValue={roomType.totalInventory}
                    required
                    min={0}
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-resort-charcoal mb-1">
                    Max Total *
                  </label>
                  <input
                    type="number"
                    name="maxOccupancy"
                    defaultValue={roomType.maxOccupancy}
                    required
                    min={1}
                    className="w-full rounded border border-resort-sand bg-white px-2 py-1.5 text-xs text-resort-charcoal"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-resort-charcoal mb-1">
                    Max Adults *
                  </label>
                  <input
                    type="number"
                    name="maxAdults"
                    defaultValue={roomType.maxAdults}
                    required
                    min={1}
                    className="w-full rounded border border-resort-sand bg-white px-2 py-1.5 text-xs text-resort-charcoal"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-resort-charcoal mb-1">
                    Max Children
                  </label>
                  <input
                    type="number"
                    name="maxChildren"
                    defaultValue={roomType.maxChildren}
                    min={0}
                    className="w-full rounded border border-resort-sand bg-white px-2 py-1.5 text-xs text-resort-charcoal"
                  />
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 text-xs text-resort-charcoal mt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    name="isActive"
                    value="true"
                    defaultChecked={roomType.isActive}
                    className="rounded border-resort-sand text-resort-forest focus:ring-resort-gold"
                  />
                  <span>Room Type is Active & Available for Booking</span>
                </label>
              </div>

              <div className="pt-2">
                <Button type="submit" variant="primary" size="sm" className="w-full gap-1.5 text-xs">
                  <Save className="h-3.5 w-3.5" /> Save Parameters
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Right Column: Default Amenities Package */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Default Amenities Package</CardTitle>
            <CardDescription className="text-xs">
              Assigned automatically to all physical rooms of this room type (unless overridden).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={async (formData) => {
                'use server';
                await updateRoomTypeAmenitiesAction(null, formData);
              }}
              className="space-y-4"
            >
              <input type="hidden" name="roomTypeId" value={roomType.id} />

              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {allAmenities.map((am) => {
                  const isChecked = assignedAmenityIds.has(am.id);
                  return (
                    <label
                      key={am.id}
                      className="flex items-center justify-between p-2 rounded border border-resort-sand/80 hover:bg-resort-sand/20 transition-colors cursor-pointer text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          name="amenityIds"
                          value={am.id}
                          defaultChecked={isChecked}
                          className="rounded border-resort-sand text-resort-forest focus:ring-resort-gold"
                        />
                        <span className="font-medium text-resort-charcoal">{am.name}</span>
                      </div>
                      <span className="text-[10px] text-resort-stone font-mono">{am.code}</span>
                    </label>
                  );
                })}
              </div>

              <Button type="submit" variant="secondary" size="sm" className="w-full gap-1.5 text-xs">
                <Sparkles className="h-3.5 w-3.5" /> Update Amenity Package
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
