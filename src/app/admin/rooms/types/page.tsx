import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { requirePermission } from '@/lib/auth/auth';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Plus, Layers, BedDouble, Users, Sparkles } from 'lucide-react';
import { createRoomTypeAction, createAmenityAction } from '@/actions/pms';

export const dynamic = 'force-dynamic';

export default async function RoomTypesPage() {
  await requirePermission('room:read');

  let roomTypes: any[] = [];
  let amenities: any[] = [];

  try {
    [roomTypes, amenities] = await Promise.all([
      prisma.roomType.findMany({
        include: {
          _count: {
            select: { rooms: true },
          },
          amenities: {
            include: {
              amenity: true,
            },
          },
        },
        orderBy: { displayOrder: 'asc' },
      }),
      prisma.amenity.findMany({
        orderBy: { name: 'asc' },
      }),
    ]);
  } catch (error) {
    console.warn('[RoomTypesPage] Database fetch error:', (error as Error).message);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/admin/rooms">
            <Button variant="outline" size="sm" className="gap-1 text-xs">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Rooms
            </Button>
          </Link>
          <div>
            <h1 className="font-serif text-2xl font-bold text-resort-charcoal">Room Types & Amenities</h1>
            <p className="text-xs text-resort-stone">
              Commercial room categories, capacity, total inventory caps, and default amenity packages.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Room Types Table */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Configured Room Types ({roomTypes.length})</CardTitle>
              <CardDescription className="text-xs">
                Note: Commercial inventory quota is distinct from physically generated rooms.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-resort-charcoal">
                  <thead className="border-b border-resort-sand bg-resort-ivory/50 text-[11px] font-semibold text-resort-stone uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Type & Code</th>
                      <th className="px-4 py-3">Base Price</th>
                      <th className="px-4 py-3">Occupancy</th>
                      <th className="px-4 py-3">Inventory vs Rooms</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-resort-sand/60">
                    {roomTypes.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-resort-stone">
                          No room types found. Create one below.
                        </td>
                      </tr>
                    ) : (
                      roomTypes.map((rt) => (
                        <tr key={rt.id} className="hover:bg-resort-sand/20 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-resort-forest">{rt.name}</div>
                            <div className="text-[10px] text-resort-stone font-mono">Code: {rt.code}</div>
                          </td>
                          <td className="px-4 py-3 font-mono font-medium">
                            ₹{Number(rt.basePrice).toLocaleString('en-IN')}
                            <span className="text-[10px] text-resort-stone block">/night</span>
                          </td>
                          <td className="px-4 py-3">
                            <div>Max {rt.maxOccupancy} guests</div>
                            <div className="text-[10px] text-resort-stone">
                              {rt.maxAdults}A / {rt.maxChildren}C
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-mono">
                              Cap: <span className="font-semibold">{rt.totalInventory}</span>
                            </div>
                            <div className="text-[10px] text-resort-stone">
                              Physical: <span className="font-semibold">{rt._count.rooms}</span> rooms
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {rt.isActive ? (
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                Active
                              </span>
                            ) : (
                              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-600">
                                Inactive
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link href={`/admin/rooms/types/${rt.id}`}>
                              <Button variant="outline" size="sm" className="h-7 text-xs px-2.5">
                                Configure
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Master Amenities Catalog */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-lg">Resort Amenities Catalog</CardTitle>
                <CardDescription className="text-xs">
                  Global database-driven amenities assigned to room types and available for room overrides.
                </CardDescription>
              </div>
              <span className="text-xs font-semibold text-resort-forest">
                {amenities.length} Registered
              </span>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {amenities.map((am) => (
                  <div
                    key={am.id}
                    className="p-2.5 rounded border border-resort-sand bg-white text-xs flex flex-col justify-between"
                  >
                    <div className="font-semibold text-resort-charcoal">{am.name}</div>
                    <div className="text-[10px] text-resort-stone font-mono mt-1">Code: {am.code}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right 1 Column: Create Room Type & Create Amenity */}
        <div className="space-y-6">
          {/* Create Room Type Form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Create Room Type</CardTitle>
              <CardDescription className="text-xs">
                Add a new commercial accommodation tier.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                action={async (formData) => {
                  'use server';
                  await createRoomTypeAction(null, formData);
                }}
                className="space-y-3"
              >
                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                    Room Type Name *
                  </label>
                  <input
                    type="text"
                    name="name"
                    required
                    placeholder="e.g. Royal Lakeview Suite"
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                    Unique Code *
                  </label>
                  <input
                    type="text"
                    name="code"
                    required
                    placeholder="e.g. RL-STE"
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                    Description *
                  </label>
                  <textarea
                    name="description"
                    required
                    rows={2}
                    placeholder="Detailed room features, layout, and views..."
                    className="w-full rounded border border-resort-sand bg-white p-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
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
                      required
                      min={1}
                      defaultValue={6500}
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
                      required
                      min={0}
                      defaultValue={10}
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
                      required
                      min={1}
                      defaultValue={3}
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
                      required
                      min={1}
                      defaultValue={2}
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
                      min={0}
                      defaultValue={1}
                      className="w-full rounded border border-resort-sand bg-white px-2 py-1.5 text-xs text-resort-charcoal"
                    />
                  </div>
                </div>

                <Button type="submit" variant="primary" size="sm" className="w-full text-xs">
                  Create Room Type
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Quick Create Amenity Form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Register Amenity</CardTitle>
              <CardDescription className="text-xs">
                Add an amenity item to the master database.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                action={async (formData) => {
                  'use server';
                  await createAmenityAction(null, formData);
                }}
                className="space-y-3"
              >
                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                    Amenity Name *
                  </label>
                  <input
                    type="text"
                    name="name"
                    required
                    placeholder="e.g. Espresso Coffee Maker"
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                    Unique Code *
                  </label>
                  <input
                    type="text"
                    name="code"
                    required
                    placeholder="e.g. ESPRESSO"
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                    Icon Identifier (Lucide)
                  </label>
                  <input
                    type="text"
                    name="icon"
                    placeholder="coffee"
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                  />
                </div>

                <Button type="submit" variant="secondary" size="sm" className="w-full text-xs">
                  Register Amenity
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
