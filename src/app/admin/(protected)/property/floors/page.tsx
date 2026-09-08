import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import type { Prisma } from '@prisma/client';
import { requirePermission, hasPermission } from '@/lib/auth/auth';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Layers, Plus } from 'lucide-react';
import { createFloorAction, deleteFloorAction } from '@/actions/pms';
import { DeleteEntityButton, SubmitButton } from '@/components/admin';

export const dynamic = 'force-dynamic';

type FloorWithRelations = Prisma.FloorGetPayload<{
  include: {
    building: { select: { id: true; name: true; code: true } };
    _count: { select: { rooms: true } };
  };
}>;

type BuildingSelectItem = Prisma.BuildingGetPayload<{
  select: { id: true; name: true; code: true };
}>;

export default async function FloorsPage() {
  const user = await requirePermission('room:read');
  const canDelete = hasPermission(user, 'floor:delete');

  let floors: FloorWithRelations[] = [];
  let buildings: BuildingSelectItem[] = [];

  try {
    [floors, buildings] = await Promise.all([
      prisma.floor.findMany({
        include: {
          building: { select: { id: true, name: true, code: true } },
          _count: { select: { rooms: true } },
        },
        orderBy: [{ building: { name: 'asc' } }, { floorNumber: 'asc' }],
      }),
      prisma.building.findMany({
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
      }),
    ]);
  } catch (error) {
    console.warn('[FloorsPage] Database fetch error:', (error as Error).message);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/property">
          <Button variant="outline" size="sm" className="gap-1 text-xs">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Property
          </Button>
        </Link>
        <div>
          <h1 className="font-serif text-2xl font-bold text-resort-charcoal">Resort Floors & Levels</h1>
          <p className="text-xs text-resort-stone">
            Define architectural levels mapped to building blocks.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Registered Floors ({floors.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-left text-xs text-resort-charcoal">
                <thead className="border-b border-resort-sand bg-resort-ivory/50 text-[11px] font-semibold text-resort-stone uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Floor / Level</th>
                    <th className="px-4 py-3">Building</th>
                    <th className="px-4 py-3">Level Number</th>
                    <th className="px-4 py-3">Assigned Rooms</th>
                    {canDelete && <th className="px-4 py-3 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-resort-sand/60">
                  {floors.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-resort-stone">
                        No floors registered. Add one using the form.
                      </td>
                    </tr>
                  ) : (
                    floors.map((f) => (
                      <tr key={f.id} className="hover:bg-resort-sand/20 transition-colors">
                        <td className="px-4 py-3 font-semibold text-resort-forest">
                          {f.name}
                        </td>
                        <td className="px-4 py-3 text-resort-charcoal">
                          {f.building.name} ({f.building.code})
                        </td>
                        <td className="px-4 py-3 font-mono">
                          Level {f.floorNumber}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-semibold">{f._count.rooms}</span> rooms
                        </td>
                        {canDelete && (
                          <td className="px-4 py-3 text-right">
                            <DeleteEntityButton
                              entityId={f.id}
                              entityName={`${f.name} (${f.building.name})`}
                              entityType="Floor"
                              dependencies={
                                f._count.rooms > 0
                                  ? [`${f._count.rooms} room(s)`]
                                  : []
                              }
                              deleteAction={deleteFloorAction}
                              hasPermission={canDelete}
                            />
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add Floor</CardTitle>
              <CardDescription className="text-xs">
                Floor number must be unique within the selected building.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                action={async (formData) => {
                  'use server';
                  await createFloorAction(null, formData);
                }}
                className="space-y-3"
              >
                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                    Building *
                  </label>
                  <select
                    name="buildingId"
                    required
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                  >
                    <option value="">Select Building</option>
                    {buildings.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                    Floor Number *
                  </label>
                  <input
                    type="number"
                    name="floorNumber"
                    required
                    defaultValue={0}
                    min={-5}
                    max={150}
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                  />
                  <span className="text-[10px] text-resort-stone mt-1 block">
                    Use 0 for Ground Floor, 1 for 1st Floor, etc.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                    Descriptive Name *
                  </label>
                  <input
                    type="text"
                    name="name"
                    required
                    placeholder="e.g. Ground Floor, Upper Deck, Level 2"
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                  />
                </div>

                <SubmitButton type="submit" variant="secondary" size="sm" className="w-full gap-1 text-xs" pendingLabel="Registering Floor...">
                  <Plus className="h-3.5 w-3.5" /> Register Floor
                </SubmitButton>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
