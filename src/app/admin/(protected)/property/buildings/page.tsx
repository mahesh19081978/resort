import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import type { Prisma } from '@prisma/client';
import { requirePermission } from '@/lib/auth/auth';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Building, Plus, Layers } from 'lucide-react';
import { createBuildingAction } from '@/actions/pms';

export const dynamic = 'force-dynamic';

type BuildingWithRelations = Prisma.BuildingGetPayload<{
  include: {
    property: { select: { name: true; code: true } };
    floors: {
      include: {
        _count: { select: { rooms: true } };
      };
    };
  };
}>;

type PropertySelectItem = Prisma.PropertyGetPayload<{
  select: { id: true; name: true; code: true };
}>;

export default async function BuildingsPage() {
  await requirePermission('room:read');

  let buildings: BuildingWithRelations[] = [];
  let properties: PropertySelectItem[] = [];

  try {
    [buildings, properties] = await Promise.all([
      prisma.building.findMany({
        include: {
          property: { select: { name: true, code: true } },
          floors: {
            include: {
              _count: { select: { rooms: true } },
            },
            orderBy: { floorNumber: 'asc' },
          },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.property.findMany({
        select: { id: true, name: true, code: true },
      }),
    ]);
  } catch (error) {
    console.warn('[BuildingsPage] Database fetch error:', (error as Error).message);
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
          <h1 className="font-serif text-2xl font-bold text-resort-charcoal">Resort Buildings & Wings</h1>
          <p className="text-xs text-resort-stone">
            Manage architectural blocks, chalets, and heritage wings.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Registered Buildings ({buildings.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-left text-xs text-resort-charcoal">
                <thead className="border-b border-resort-sand bg-resort-ivory/50 text-[11px] font-semibold text-resort-stone uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Building Name</th>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Property</th>
                    <th className="px-4 py-3">Floors & Rooms</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-resort-sand/60">
                  {buildings.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-resort-stone">
                        No buildings found. Register one below.
                      </td>
                    </tr>
                  ) : (
                    buildings.map((b) => (
                      <tr key={b.id} className="hover:bg-resort-sand/20 transition-colors">
                        <td className="px-4 py-3 font-semibold text-resort-forest">
                          {b.name}
                        </td>
                        <td className="px-4 py-3 font-mono text-resort-stone">
                          {b.code}
                        </td>
                        <td className="px-4 py-3 text-resort-stone">
                          {b.property.name}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-semibold text-resort-charcoal">{b.floors.length}</span> floors &bull;{' '}
                          <span className="font-semibold text-resort-charcoal">
                            {b.floors.reduce((sum, f) => sum + f._count.rooms, 0)}
                          </span>{' '}
                          rooms
                        </td>
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
              <CardTitle className="text-base">Register Building</CardTitle>
              <CardDescription className="text-xs">
                Code must be unique within the selected property.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                action={async (formData) => {
                  'use server';
                  await createBuildingAction(null, formData);
                }}
                className="space-y-3"
              >
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
                    Building Name *
                  </label>
                  <input
                    type="text"
                    name="name"
                    required
                    placeholder="e.g. Forest Villa Annex"
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                    Building Code *
                  </label>
                  <input
                    type="text"
                    name="code"
                    required
                    placeholder="e.g. VILLA-ANNEX"
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal font-mono uppercase focus:outline-none focus:ring-1 focus:ring-resort-gold"
                  />
                </div>

                <Button type="submit" variant="primary" size="sm" className="w-full gap-1 text-xs">
                  <Plus className="h-3.5 w-3.5" /> Create Building
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
