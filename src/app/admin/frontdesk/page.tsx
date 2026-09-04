import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { requirePermission } from '@/lib/auth/auth';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PhysicalRoomStatus, StayStatus, ReservationStatus } from '@prisma/client';
import {
  LogIn,
  LogOut,
  BedDouble,
  Users,
  Building2,
  ArrowRight,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function FrontDeskDashboardPage() {
  await requirePermission('booking:read');

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [
    arrivalsToday,
    departuresToday,
    inHouseStays,
    availableRooms,
    occupiedRooms,
    dirtyRooms,
    cleaningRooms,
    maintenanceRooms,
  ] = await Promise.all([
    prisma.reservation.count({
      where: {
        checkInDate: { gte: today, lt: tomorrow },
        status: { in: [ReservationStatus.CONFIRMED, ReservationStatus.PENDING] },
      },
    }),
    prisma.stay.count({
      where: {
        status: StayStatus.ACTIVE,
        expectedCheckOut: { gte: today, lt: tomorrow },
      },
    }),
    prisma.stay.count({
      where: { status: StayStatus.ACTIVE },
    }),
    prisma.room.count({ where: { status: PhysicalRoomStatus.AVAILABLE, isActive: true } }),
    prisma.room.count({ where: { status: PhysicalRoomStatus.OCCUPIED, isActive: true } }),
    prisma.room.count({ where: { status: PhysicalRoomStatus.DIRTY, isActive: true } }),
    prisma.room.count({ where: { status: PhysicalRoomStatus.CLEANING, isActive: true } }),
    prisma.room.count({ where: { status: PhysicalRoomStatus.MAINTENANCE, isActive: true } }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200 pb-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-resort-charcoal">Front Desk Operations</h1>
          <p className="text-xs text-resort-stone mt-1">
            Live guest arrivals, stay lifecycle, in-house folios, and departures console.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/frontdesk/arrivals">
            <Button size="sm" className="bg-resort-gold hover:bg-resort-sand text-white font-medium">
              <LogIn className="w-4 h-4 mr-2" /> Arrivals Console
            </Button>
          </Link>
          <Link href="/admin/frontdesk/inhouse">
            <Button size="sm" variant="outline" className="border-neutral-300">
              <Users className="w-4 h-4 mr-2" /> In-House Stays
            </Button>
          </Link>
          <Link href="/admin/frontdesk/departures">
            <Button size="sm" variant="outline" className="border-neutral-300">
              <LogOut className="w-4 h-4 mr-2" /> Departures
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="p-4 pb-1">
            <CardDescription className="text-xs uppercase tracking-wider font-semibold text-neutral-500">
              Expected Arrivals Today
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-neutral-800 flex items-center justify-between">
              {arrivalsToday}
              <LogIn className="w-5 h-5 text-amber-500" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <Link href="/admin/frontdesk/arrivals" className="text-xs text-amber-600 hover:underline flex items-center mt-1">
              View arrivals <ArrowRight className="w-3 h-3 ml-1" />
            </Link>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="p-4 pb-1">
            <CardDescription className="text-xs uppercase tracking-wider font-semibold text-neutral-500">
              In-House Guests / Stays
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-neutral-800 flex items-center justify-between">
              {inHouseStays}
              <Users className="w-5 h-5 text-blue-500" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <Link href="/admin/frontdesk/inhouse" className="text-xs text-blue-600 hover:underline flex items-center mt-1">
              View active stays <ArrowRight className="w-3 h-3 ml-1" />
            </Link>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-rose-500">
          <CardHeader className="p-4 pb-1">
            <CardDescription className="text-xs uppercase tracking-wider font-semibold text-neutral-500">
              Departures Today
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-neutral-800 flex items-center justify-between">
              {departuresToday}
              <LogOut className="w-5 h-5 text-rose-500" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <Link href="/admin/frontdesk/departures" className="text-xs text-rose-600 hover:underline flex items-center mt-1">
              View departures <ArrowRight className="w-3 h-3 ml-1" />
            </Link>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="p-4 pb-1">
            <CardDescription className="text-xs uppercase tracking-wider font-semibold text-neutral-500">
              Rooms Ready for Check-In
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-neutral-800 flex items-center justify-between">
              {availableRooms}
              <BedDouble className="w-5 h-5 text-emerald-500" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <Link href="/admin/rooms?status=AVAILABLE" className="text-xs text-emerald-600 hover:underline flex items-center mt-1">
              View available rooms <ArrowRight className="w-3 h-3 ml-1" />
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="p-4 pb-2 border-b border-neutral-100">
          <CardTitle className="text-sm font-semibold flex items-center text-neutral-800">
            <Building2 className="w-4 h-4 mr-2 text-resort-gold" /> Live Physical Room Inventory Status
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
            <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
              <div className="text-xs font-semibold text-emerald-800">AVAILABLE</div>
              <div className="text-xl font-bold text-emerald-900 mt-1">{availableRooms}</div>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="text-xs font-semibold text-blue-800">OCCUPIED</div>
              <div className="text-xl font-bold text-blue-900 mt-1">{occupiedRooms}</div>
            </div>
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
              <div className="text-xs font-semibold text-amber-800">DIRTY</div>
              <div className="text-xl font-bold text-amber-900 mt-1">{dirtyRooms}</div>
            </div>
            <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200">
              <div className="text-xs font-semibold text-indigo-800">CLEANING</div>
              <div className="text-xl font-bold text-indigo-900 mt-1">{cleaningRooms}</div>
            </div>
            <div className="p-3 bg-rose-50 rounded-lg border border-rose-200">
              <div className="text-xs font-semibold text-rose-800">MAINTENANCE / OOO</div>
              <div className="text-xl font-bold text-rose-900 mt-1">{maintenanceRooms}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold flex items-center text-resort-charcoal">
              <LogIn className="w-5 h-5 mr-2 text-resort-gold" /> Guest Check-In Wizard
            </CardTitle>
            <CardDescription className="text-xs">
              Select pending reservations, pick eligible clean rooms, upload ID proof, capture webcam photo, and activate stay.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <Link href="/admin/frontdesk/arrivals">
              <Button className="w-full bg-resort-charcoal text-white hover:bg-neutral-800 text-xs">
                Launch Check-In <ArrowRight className="w-3 h-3 ml-2" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold flex items-center text-resort-charcoal">
              <Users className="w-5 h-5 mr-2 text-blue-600" /> In-House Guest Ledgers
            </CardTitle>
            <CardDescription className="text-xs">
              Inspect running folios, accommodation charges, restaurant orders, room assignments, and post manual charges.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <Link href="/admin/frontdesk/inhouse">
              <Button variant="outline" className="w-full text-xs">
                View In-House Stays <ArrowRight className="w-3 h-3 ml-2" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold flex items-center text-resort-charcoal">
              <LogOut className="w-5 h-5 mr-2 text-rose-600" /> Guest Departure & Settlement
            </CardTitle>
            <CardDescription className="text-xs">
              Review stay itemization, calculate zero balance, collect folio settlements, release rooms to DIRTY status.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <Link href="/admin/frontdesk/departures">
              <Button variant="outline" className="w-full text-xs">
                Process Departures <ArrowRight className="w-3 h-3 ml-2" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}