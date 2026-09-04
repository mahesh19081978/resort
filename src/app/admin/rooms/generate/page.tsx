import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import type { Prisma } from '@prisma/client';
import { requirePermission } from '@/lib/auth/auth';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, PlusCircle, ShieldAlert } from 'lucide-react';
import { generateRoomsAction } from '@/actions/pms';

export const dynamic = 'force-dynamic';

type PropertyItem = Prisma.PropertyGetPayload<{
  select: { id: true; name: true; code: true };
}>;

type RoomTypeItem = Prisma.RoomTypeGetPayload<{
  select: { id: true; name: true; code: true; basePrice: true };
}>;

type FloorWithBuilding = Prisma.FloorGetPayload<{
  include: {
    building: {
      select: { name: true; code: true; propertyId: true };
    };
  };
}>;

export default async function GenerateRoomsPage() {
  await requirePermission('room:manage');

  let properties: PropertyItem[] = [];
  let roomTypes: RoomTypeItem[] = [];
  let floors: FloorWithBuilding[] = [];

  try {
    [properties, roomTypes, floors] = await Promise.all([
      prisma.property.findMany({
        select: { id: true, name: true, code: true },
      }),
      prisma.roomType.findMany({
        where: { isActive: true },
        select: { id: true, name: true, code: true, basePrice: true },
        orderBy: { displayOrder: 'asc' },
      }),
      prisma.floor.findMany({
        include: {
          building: {
            select: { name: true, code: true, propertyId: true },
          },
        },
        orderBy: [{ building: { name: 'asc' } }, { floorNumber: 'asc' }],
      }),
    ]);
  } catch (error) {
    console.warn('[GenerateRoomsPage] Failed to fetch database records:', (error as Error).message);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/rooms">
          <Button variant="outline" size="sm" className="gap-1 text-xs">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Rooms
          </Button>
        </Link>
        <div>
          <h1 className="font-serif text-2xl font-bold text-resort-charcoal">Batch Physical Room Generator</h1>
          <p className="text-xs text-resort-stone">
            Deterministically generate physical room records with collision detection and atomic rollback.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Room Generation Configuration</CardTitle>
          <CardDescription className="text-xs">
            Physical room numbers are constructed deterministically as Prefix + (StartingNumber + i).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={async (formData) => {
              'use server';
              await generateRoomsAction(null, formData);
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                  Target Property *
                </label>
                <select
                  name="propertyId"
                  required
                  className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                >
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                  Room Type *
                </label>
                <select
                  name="roomTypeId"
                  required
                  className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                >
                  <option value="">Select Room Type</option>
                  {roomTypes.map((rt) => (
                    <option key={rt.id} value={rt.id}>
                      {rt.name} ({rt.code}) - ₹{Number(rt.basePrice).toLocaleString('en-IN')}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                  Target Building & Floor *
                </label>
                <select
                  name="floorId"
                  required
                  className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                >
                  <option value="">Select Building & Floor</option>
                  {floors.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.building.name} - {f.name} (Floor {f.floorNumber})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-resort-stone mt-1">
                  Cross-property validation is verified on the server.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                  Room Number Prefix *
                </label>
                <input
                  type="text"
                  name="prefix"
                  required
                  placeholder="Example: S-, D-, V-, 1-"
                  className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal placeholder:text-resort-stone focus:outline-none focus:ring-1 focus:ring-resort-gold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                  Starting Room Number *
                </label>
                <input
                  type="number"
                  name="startingNumber"
                  required
                  defaultValue={101}
                  min={1}
                  max={99999}
                  className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                  Room Count (Batch Size) *
                </label>
                <input
                  type="number"
                  name="count"
                  required
                  defaultValue={10}
                  min={1}
                  max={100}
                  className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                Operational Notes (Optional)
              </label>
              <textarea
                name="notes"
                rows={2}
                placeholder="Initial generation batch notes..."
                className="w-full rounded border border-resort-sand bg-white p-3 text-xs text-resort-charcoal placeholder:text-resort-stone focus:outline-none focus:ring-1 focus:ring-resort-gold"
              />
            </div>

            <div className="rounded-md bg-amber-50 p-3 border border-amber-200 text-xs text-amber-800 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold">
                <ShieldAlert className="h-4 w-4 text-amber-600" />
                Atomic Generation Rules & Collision Policy:
              </div>
              <ul className="list-disc list-inside text-[11px] text-amber-700 space-y-0.5 ml-1">
                <li>Pre-checks every generated room number against the target property.</li>
                <li>If any room already exists, the entire batch is rolled back transactionally.</li>
                <li>Rooms are created with initial status <strong>AVAILABLE</strong>.</li>
              </ul>
            </div>

            <div className="pt-2 flex justify-end">
              <Button type="submit" variant="primary" size="md" className="gap-2">
                <PlusCircle className="h-4 w-4" /> Execute Batch Generation
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
