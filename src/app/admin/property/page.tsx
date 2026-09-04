import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import type { Prisma } from '@prisma/client';
import { requirePermission } from '@/lib/auth/auth';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building, Layers, MapPin, Phone, Mail, Save, Plus } from 'lucide-react';
import { updatePropertyAction, createBuildingAction } from '@/actions/pms';

export const dynamic = 'force-dynamic';

type PropertyWithHierarchy = Prisma.PropertyGetPayload<{
  include: {
    buildings: {
      include: {
        floors: {
          include: {
            _count: {
              select: { rooms: true };
            };
          };
        };
      };
    };
    _count: {
      select: { rooms: true };
    };
  };
}>;

type BuildingItem = PropertyWithHierarchy['buildings'][number];

export default async function PropertyPage() {
  await requirePermission('room:read');

  let property: PropertyWithHierarchy | null = null;
  let buildings: BuildingItem[] = [];

  try {
    property = await prisma.property.findFirst({
      include: {
        buildings: {
          include: {
            floors: {
              include: {
                _count: {
                  select: { rooms: true },
                },
              },
            },
          },
          orderBy: { name: 'asc' },
        },
        _count: {
          select: { rooms: true },
        },
      },
    });

    if (property) {
      buildings = property.buildings;
    }
  } catch (error) {
    console.warn('[PropertyPage] Database fetch error:', (error as Error).message);
  }

  if (!property) {
    return (
      <div className="p-8 text-center text-resort-stone">
        Property entity not initialized. Please ensure baseline seed is executed.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-resort-charcoal">
            Property & Structural Hierarchy
          </h1>
          <p className="text-xs text-resort-stone">
            Configure resort property details, manage building wings, and define floor layouts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/property/buildings">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Building className="h-3.5 w-3.5" /> All Buildings
            </Button>
          </Link>
          <Link href="/admin/property/floors">
            <Button variant="secondary" size="sm" className="gap-1.5 text-xs">
              <Layers className="h-3.5 w-3.5" /> All Floors
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Property Configuration Form */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Resort Property Configuration</CardTitle>
            <CardDescription className="text-xs">
              Enterprise resort address, contact numbers, and public details.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={async (formData) => {
                'use server';
                await updatePropertyAction(null, formData);
              }}
              className="space-y-3"
            >
              <input type="hidden" name="propertyId" value={property.id} />

              <div>
                <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                  Property Name *
                </label>
                <input
                  type="text"
                  name="name"
                  defaultValue={property.name}
                  required
                  className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                  Property Code (Unique)
                </label>
                <input
                  type="text"
                  disabled
                  defaultValue={property.code}
                  className="w-full rounded border border-resort-sand bg-stone-50 px-3 py-2 text-xs font-mono text-resort-stone cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                  Address Line *
                </label>
                <input
                  type="text"
                  name="address"
                  defaultValue={property.address}
                  required
                  className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                    City *
                  </label>
                  <input
                    type="text"
                    name="city"
                    defaultValue={property.city}
                    required
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                    State *
                  </label>
                  <input
                    type="text"
                    name="state"
                    defaultValue={property.state}
                    required
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                    Postal Code *
                  </label>
                  <input
                    type="text"
                    name="postalCode"
                    defaultValue={property.postalCode}
                    required
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                    Country
                  </label>
                  <input
                    type="text"
                    name="country"
                    defaultValue={property.country}
                    required
                    className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                  Contact Phone *
                </label>
                <input
                  type="text"
                  name="contactPhone"
                  defaultValue={property.contactPhone}
                  required
                  className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-resort-charcoal mb-1">
                  Contact Email *
                </label>
                <input
                  type="email"
                  name="contactEmail"
                  defaultValue={property.contactEmail}
                  required
                  className="w-full rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal"
                />
              </div>

              <Button type="submit" variant="primary" size="sm" className="w-full gap-1.5 text-xs">
                <Save className="h-3.5 w-3.5" /> Save Property Details
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Right 2 Columns: Hierarchy Overview & Buildings */}
        <div className="lg:col-span-2 space-y-6">
          {/* Summary metrics */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-resort-sand bg-white p-3 text-center">
              <div className="text-[10px] font-semibold text-resort-stone uppercase">Buildings</div>
              <div className="text-xl font-bold font-serif text-resort-forest mt-1">
                {buildings.length}
              </div>
            </div>
            <div className="rounded-lg border border-resort-sand bg-white p-3 text-center">
              <div className="text-[10px] font-semibold text-resort-stone uppercase">Total Floors</div>
              <div className="text-xl font-bold font-serif text-resort-gold mt-1">
                {buildings.reduce((acc, b) => acc + b.floors.length, 0)}
              </div>
            </div>
            <div className="rounded-lg border border-resort-sand bg-white p-3 text-center">
              <div className="text-[10px] font-semibold text-resort-stone uppercase">Physical Rooms</div>
              <div className="text-xl font-bold font-serif text-resort-charcoal mt-1">
                {property._count.rooms}
              </div>
            </div>
          </div>

          {/* Building Wings Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base">Resort Building Wings</CardTitle>
                <CardDescription className="text-xs">
                  Physical buildings belonging to {property.name}.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="divide-y divide-resort-sand/60">
                {buildings.map((b) => (
                  <div key={b.id} className="py-3 first:pt-0 last:pb-0 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-sm text-resort-forest">{b.name}</span>
                        <span className="text-xs text-resort-stone font-mono ml-2">Code: {b.code}</span>
                      </div>
                      <span className="text-xs text-resort-stone">
                        {b.floors.length} Floors &bull;{' '}
                        {b.floors.reduce((sum, f) => sum + f._count.rooms, 0)} Rooms
                      </span>
                    </div>

                    {/* Floor chips */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {b.floors.map((f) => (
                        <span
                          key={f.id}
                          className="rounded-md bg-resort-ivory px-2 py-1 text-[11px] border border-resort-sand text-resort-charcoal"
                        >
                          Level {f.floorNumber}: <strong>{f.name}</strong> ({f._count.rooms} rooms)
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick Add Building Form */}
              <div className="pt-4 border-t border-resort-sand">
                <h4 className="text-xs font-semibold text-resort-charcoal mb-2">Register New Building</h4>
                <form
                  action={async (formData) => {
                    'use server';
                    await createBuildingAction(null, formData);
                  }}
                  className="flex flex-wrap gap-2"
                >
                  <input type="hidden" name="propertyId" value={property.id} />
                  <input
                    type="text"
                    name="name"
                    required
                    placeholder="Building Name (e.g. Sunset Chalet Wing)"
                    className="flex-1 min-w-[200px] rounded border border-resort-sand bg-white px-3 py-1.5 text-xs text-resort-charcoal"
                  />
                  <input
                    type="text"
                    name="code"
                    required
                    placeholder="Code (e.g. SUNSET-CHALET)"
                    className="w-36 rounded border border-resort-sand bg-white px-3 py-1.5 text-xs text-resort-charcoal font-mono uppercase"
                  />
                  <Button type="submit" variant="secondary" size="sm" className="gap-1 text-xs">
                    <Plus className="h-3.5 w-3.5" /> Add Building
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
