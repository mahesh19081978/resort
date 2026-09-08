import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import type { Prisma } from '@prisma/client';
import { requirePermission, hasPermission } from '@/lib/auth/auth';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PhysicalRoomStatus } from '@prisma/client';
import { updateRoomStatusAction, deleteRoomAction } from '@/actions/pms';
import { DeleteEntityButton } from '@/components/admin';
import {
  BedDouble,
  Plus,
  Layers,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Wrench,
  Ban,
  Clock,
  RefreshCw,
} from 'lucide-react';

interface RoomsPageProps {
  searchParams: Promise<{
    status?: string;
    roomTypeId?: string;
    buildingId?: string;
    floorId?: string;
    q?: string;
  }>;
}

export const dynamic = 'force-dynamic';

type RoomTypeSelectItem = Prisma.RoomTypeGetPayload<{
  select: { id: true; name: true; code: true };
}>;

type BuildingSelectItem = Prisma.BuildingGetPayload<{
  select: { id: true; name: true; code: true };
}>;

type FloorSelectItem = Prisma.FloorGetPayload<{
  select: { id: true; name: true; floorNumber: true; buildingId: true };
}>;

type RoomWithRelations = Prisma.RoomGetPayload<{
  include: {
    roomType: { select: { name: true; code: true; basePrice: true } };
    floor: {
      include: {
        building: { select: { name: true; code: true } };
      };
    };
    amenityOverrides: { select: { amenityId: true } };
  };
}>;

export default async function RoomsPage({ searchParams }: RoomsPageProps) {
  const user = await requirePermission('room:read');
  const canDelete = hasPermission(user, 'room:delete');
  const params = await searchParams;

  // Strict server-side filter validation: only allow legitimate PhysicalRoomStatus enum values
  const validStatuses = Object.values(PhysicalRoomStatus);
  const statusFilter = params.status && validStatuses.includes(params.status as PhysicalRoomStatus)
    ? (params.status as PhysicalRoomStatus)
    : undefined;

  const roomTypeId = params.roomTypeId;
  const buildingId = params.buildingId;
  const floorId = params.floorId;
  const query = params.q?.trim();

  let rooms: RoomWithRelations[] = [];
  let roomTypes: RoomTypeSelectItem[] = [];
  let buildings: BuildingSelectItem[] = [];
  let floors: FloorSelectItem[] = [];
  const statusCounts: Record<string, number> = {};

  try {
    [roomTypes, buildings, floors] = await Promise.all([
      prisma.roomType.findMany({
        where: { isActive: true },
        select: { id: true, name: true, code: true },
        orderBy: { displayOrder: 'asc' },
      }),
      prisma.building.findMany({
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
      }),
      prisma.floor.findMany({
        select: { id: true, name: true, floorNumber: true, buildingId: true },
        orderBy: { floorNumber: 'asc' },
      }),
    ]);

    const whereClause: Prisma.RoomWhereInput = {
      isActive: true,
      ...(statusFilter && { status: statusFilter }),
      ...(roomTypeId && { roomTypeId }),
      ...(floorId && { floorId }),
      ...(buildingId && {
        floor: {
          buildingId,
        },
      }),
      ...(query && {
        roomNumber: {
          contains: query,
          mode: 'insensitive',
        },
      }),
    };

    rooms = await prisma.room.findMany({
      where: whereClause,
      include: {
        roomType: { select: { name: true, code: true, basePrice: true } },
        floor: {
          include: {
            building: { select: { name: true, code: true } },
          },
        },
        amenityOverrides: { select: { amenityId: true } },
      },
      orderBy: { roomNumber: 'asc' },
    });

    const allRoomsForCount = await prisma.room.findMany({
      where: { isActive: true },
      select: { status: true },
    });

    for (const r of allRoomsForCount) {
      statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    }
  } catch (error) {
    console.warn('[RoomsPage] Database fetch failed (offline/mock):', (error as Error).message);
  }

  const getStatusBadge = (status: PhysicalRoomStatus) => {
    switch (status) {
      case 'AVAILABLE':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
            <CheckCircle2 className="h-3 w-3" /> Available
          </span>
        );
      case 'RESERVED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-600/20">
            <Clock className="h-3 w-3" /> Reserved
          </span>
        );
      case 'OCCUPIED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-semibold text-purple-700 ring-1 ring-inset ring-purple-600/20">
            <BedDouble className="h-3 w-3" /> Occupied
          </span>
        );
      case 'DIRTY':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
            <AlertTriangle className="h-3 w-3" /> Dirty
          </span>
        );
      case 'CLEANING':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2.5 py-0.5 text-xs font-semibold text-cyan-700 ring-1 ring-inset ring-cyan-600/20">
            <Sparkles className="h-3 w-3" /> Cleaning
          </span>
        );
      case 'MAINTENANCE':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/20">
            <Wrench className="h-3 w-3" /> Maintenance
          </span>
        );
      case 'OUT_OF_ORDER':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-semibold text-stone-700 ring-1 ring-inset ring-stone-600/20">
            <Ban className="h-3 w-3" /> Out of Order
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-resort-charcoal">Physical Rooms & Inventory</h1>
          <p className="text-xs text-resort-stone mt-1">
            Operational room registry, deterministic batch generator, and physical room status management.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/rooms/types">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Layers className="h-3.5 w-3.5" /> Room Types
            </Button>
          </Link>
          <Link href="/admin/rooms/generate">
            <Button variant="primary" size="sm" className="gap-1.5 text-xs">
              <Plus className="h-3.5 w-3.5" /> Generate Rooms
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: 'Total Rooms', count: rooms.length, color: 'text-resort-charcoal' },
          { label: 'Available', count: statusCounts['AVAILABLE'] || 0, color: 'text-emerald-700' },
          { label: 'Reserved', count: statusCounts['RESERVED'] || 0, color: 'text-blue-700' },
          { label: 'Occupied', count: statusCounts['OCCUPIED'] || 0, color: 'text-purple-700' },
          { label: 'Dirty', count: statusCounts['DIRTY'] || 0, color: 'text-amber-700' },
          { label: 'Cleaning', count: statusCounts['CLEANING'] || 0, color: 'text-cyan-700' },
          { label: 'Maintenance', count: statusCounts['MAINTENANCE'] || 0, color: 'text-rose-700' },
        ].map((m, idx) => (
          <div key={idx} className="rounded-lg border border-resort-sand bg-white p-3 text-center shadow-sm">
            <div className="text-[11px] font-medium text-resort-stone uppercase tracking-wider">{m.label}</div>
            <div className={`text-xl font-bold font-serif mt-1 ${m.color}`}>{m.count}</div>
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="p-4">
          <form method="GET" className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-resort-stone" />
              <input
                type="text"
                name="q"
                defaultValue={query || ''}
                placeholder="Search by room number..."
                className="w-full rounded border border-resort-sand bg-resort-ivory/40 pl-9 pr-3 py-2 text-xs text-resort-charcoal placeholder:text-resort-stone focus:outline-none focus:ring-1 focus:ring-resort-gold"
              />
            </div>

            <select
              name="status"
              defaultValue={statusFilter || ''}
              className="rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
            >
              <option value="">All Statuses</option>
              <option value="AVAILABLE">Available</option>
              <option value="RESERVED">Reserved</option>
              <option value="OCCUPIED">Occupied</option>
              <option value="DIRTY">Dirty</option>
              <option value="CLEANING">Cleaning</option>
              <option value="MAINTENANCE">Maintenance</option>
              <option value="OUT_OF_ORDER">Out of Order</option>
            </select>

            <select
              name="roomTypeId"
              defaultValue={roomTypeId || ''}
              className="rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
            >
              <option value="">All Room Types</option>
              {roomTypes.map((rt) => (
                <option key={rt.id} value={rt.id}>
                  {rt.name} ({rt.code})
                </option>
              ))}
            </select>

            <select
              name="buildingId"
              defaultValue={buildingId || ''}
              className="rounded border border-resort-sand bg-white px-3 py-2 text-xs text-resort-charcoal focus:outline-none focus:ring-1 focus:ring-resort-gold"
            >
              <option value="">All Buildings</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>

            <Button type="submit" variant="secondary" size="sm" className="gap-1.5 text-xs">
              <Filter className="h-3.5 w-3.5" /> Apply Filters
            </Button>
            {(query || statusFilter || roomTypeId || buildingId) && (
              <Link href="/admin/rooms">
                <Button type="button" variant="ghost" size="sm" className="text-xs text-resort-stone">
                  Reset
                </Button>
              </Link>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Physical Room Inventory ({rooms.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-resort-charcoal">
              <thead className="border-b border-resort-sand bg-resort-ivory/50 text-[11px] font-semibold text-resort-stone uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Room No.</th>
                  <th className="px-4 py-3">Room Type</th>
                  <th className="px-4 py-3">Building & Floor</th>
                  <th className="px-4 py-3">Base Rate</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Quick Transition</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-resort-sand/60">
                {rooms.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-resort-stone">
                      No physical rooms found matching the selected criteria.
                    </td>
                  </tr>
                ) : (
                  rooms.map((room) => (
                    <tr key={room.id} className="hover:bg-resort-sand/20 transition-colors">
                      <td className="px-4 py-3 font-semibold text-resort-forest font-mono text-sm">
                        {room.roomNumber}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{room.roomType.name}</div>
                        <div className="text-[10px] text-resort-stone">Code: {room.roomType.code}</div>
                      </td>
                      <td className="px-4 py-3 text-resort-stone">
                        <div>{room.floor.building.name}</div>
                        <div className="text-[10px]">{room.floor.name}</div>
                      </td>
                      <td className="px-4 py-3 font-mono font-medium">
                        ₹{Number(room.roomType.basePrice).toLocaleString('en-IN')}/night
                      </td>
                      <td className="px-4 py-3">{getStatusBadge(room.status)}</td>
                      <td className="px-4 py-3">
                        {room.status === 'DIRTY' && (
                          <form action={async (formData) => {
                            'use server';
                            await updateRoomStatusAction(null, formData);
                          }}>
                            <input type="hidden" name="roomId" value={room.id} />
                            <input type="hidden" name="targetStatus" value="CLEANING" />
                            <button
                              type="submit"
                              className="rounded bg-cyan-50 px-2 py-1 text-[10px] font-semibold text-cyan-800 hover:bg-cyan-100 border border-cyan-200 transition-colors"
                            >
                              Start Cleaning
                            </button>
                          </form>
                        )}
                        {room.status === 'CLEANING' && (
                          <form action={async (formData) => {
                            'use server';
                            await updateRoomStatusAction(null, formData);
                          }}>
                            <input type="hidden" name="roomId" value={room.id} />
                            <input type="hidden" name="targetStatus" value="AVAILABLE" />
                            <button
                              type="submit"
                              className="rounded bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-800 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                            >
                              Mark Ready (Available)
                            </button>
                          </form>
                        )}
                        {room.status === 'AVAILABLE' && (
                          <form action={async (formData) => {
                            'use server';
                            await updateRoomStatusAction(null, formData);
                          }}>
                            <input type="hidden" name="roomId" value={room.id} />
                            <input type="hidden" name="targetStatus" value="MAINTENANCE" />
                            <button
                              type="submit"
                              className="rounded bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-800 hover:bg-rose-100 border border-rose-200 transition-colors"
                            >
                              Flag Maintenance
                            </button>
                          </form>
                        )}
                        {room.status === 'MAINTENANCE' && (
                          <form action={async (formData) => {
                            'use server';
                            await updateRoomStatusAction(null, formData);
                          }}>
                            <input type="hidden" name="roomId" value={room.id} />
                            <input type="hidden" name="targetStatus" value="CLEANING" />
                            <button
                              type="submit"
                              className="rounded bg-cyan-50 px-2 py-1 text-[10px] font-semibold text-cyan-800 hover:bg-cyan-100 border border-cyan-200 transition-colors"
                            >
                              Send for Cleaning
                            </button>
                          </form>
                        )}
                        {['RESERVED', 'OCCUPIED'].includes(room.status) && (
                          <span className="text-[10px] text-resort-stone italic">
                            Workflow Controlled
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {canDelete && room.status === 'AVAILABLE' && (
                            <DeleteEntityButton
                              entityId={room.id}
                              entityName={`Room ${room.roomNumber}`}
                              entityType="Room"
                              deleteAction={deleteRoomAction}
                              hasPermission={canDelete}
                            />
                          )}
                          <Link href={`/admin/rooms/${room.id}`}>
                            <Button variant="outline" size="sm" className="h-7 text-xs px-2.5">
                              View Details
                            </Button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
