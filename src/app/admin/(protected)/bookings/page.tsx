import React from 'react';
import Link from 'next/link';
import { getCurrentUser, requirePermission } from '@/lib/auth/auth';
import { hasPermission } from '@/lib/permissions/rbac';
import { prisma } from '@/lib/db/prisma';
import { ReservationStatus, BookingSource } from '@prisma/client';
import {
  getAdminReservations,
  getAdminReservationKpis,
  serializeAdminReservations,
  AdminReservationFilters as FilterParams,
  DerivedPaymentStatus,
} from '@/lib/booking/admin-reservation-service';
import { ReservationKpiCards } from '@/components/booking/admin/ReservationKpiCards';
import { AdminReservationFilters } from '@/components/booking/admin/AdminReservationFilters';
import { ReservationTable } from '@/components/booking/admin/ReservationTable';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface BookingsPageProps {
  searchParams: Promise<{
    search?: string;
    status?: string;
    paymentStatus?: string;
    roomTypeId?: string;
    source?: string;
    dateType?: string;
    startDate?: string;
    endDate?: string;
    tab?: string;
    sort?: string;
    order?: string;
    page?: string;
    limit?: string;
  }>;
}

export default async function AdminBookingsPage({ searchParams }: BookingsPageProps) {
  const user = await requirePermission('booking:read');
  const params = await searchParams;

  const canCreate = hasPermission(user, 'booking:create');
  const canCancel = hasPermission(user, 'booking:cancel');
  const canCheckIn = hasPermission(user, 'checkin:perform');

  const filterParams: FilterParams = {
    search: params.search,
    status: (params.status as ReservationStatus | 'ALL') || 'ALL',
    paymentStatus: (params.paymentStatus as DerivedPaymentStatus | 'ALL') || 'ALL',
    roomTypeId: params.roomTypeId || 'ALL',
    source: (params.source as BookingSource | 'ALL') || 'ALL',
    dateType: (params.dateType as 'checkIn' | 'checkOut' | 'createdAt') || 'checkIn',
    startDate: params.startDate,
    endDate: params.endDate,
    quickTab: (params.tab as 'all' | 'today' | 'upcoming' | 'pending' | 'confirmed' | 'cancelled') || 'all',
    sort: (params.sort as 'checkInDate' | 'checkOutDate' | 'createdAt' | 'totalAmount') || 'checkInDate',
    order: (params.order as 'asc' | 'desc') || undefined,
    page: params.page ? parseInt(params.page, 10) : 1,
    limit: params.limit ? parseInt(params.limit, 10) : 25,
  };

  const [kpis, rawReservationsData, roomTypes] = await Promise.all([
    getAdminReservationKpis(user),
    getAdminReservations(filterParams, user),
    prisma.roomType.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { displayOrder: 'asc' },
    }),
  ]);

  const reservationsData = serializeAdminReservations(rawReservationsData);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200/80 pb-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-resort-charcoal">
            Reservations & Booking Engine
          </h1>
          <p className="text-xs text-resort-stone mt-1">
            Manage reservations, booking dates, guests, payments and reservation status.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canCreate && (
            <Link href="/admin/bookings/new">
              <Button
                size="sm"
                className="bg-resort-forest hover:bg-resort-forest-deep text-white text-xs font-semibold shadow-xs"
              >
                <Plus className="w-4 h-4 mr-1.5" /> New Reservation
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <ReservationKpiCards kpis={kpis} />

      {/* Filters */}
      <AdminReservationFilters roomTypes={roomTypes} />

      {/* Table */}
      <ReservationTable
        data={reservationsData}
        canCancel={canCancel}
        canCheckIn={canCheckIn}
      />
    </div>
  );
}