import React from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { AdminReservationKpis } from '@/lib/booking/admin-reservation-service';
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  LogIn,
  LogOut,
  IndianRupee,
  Wallet,
  ArrowRight,
} from 'lucide-react';

interface ReservationKpiCardsProps {
  kpis: AdminReservationKpis;
}

export function ReservationKpiCards({ kpis }: ReservationKpiCardsProps) {
  const formatCurrency = (val: string) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(Number(val));
  };

  return (
    <div className="space-y-4">
      {/* Top Operational KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Total Reservations */}
        <Link href="/admin/bookings" className="block group">
          <Card className="hover:border-resort-forest transition-colors shadow-xs h-full">
            <CardHeader className="p-3.5 pb-1">
              <CardDescription className="text-[10px] uppercase tracking-wider font-semibold text-neutral-500 flex items-center justify-between">
                <span>Total Bookings</span>
                <CalendarDays className="w-3.5 h-3.5 text-neutral-400 group-hover:text-resort-forest transition-colors" />
              </CardDescription>
              <CardTitle className="text-xl font-bold font-mono text-neutral-900 mt-1">
                {kpis.totalReservations}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3.5 pt-1 text-[11px] text-neutral-400 group-hover:text-resort-forest">
              All reservations in DB
            </CardContent>
          </Card>
        </Link>

        {/* Confirmed */}
        <Link href="/admin/bookings?status=CONFIRMED" className="block group">
          <Card className="hover:border-emerald-500 transition-colors shadow-xs border-l-4 border-l-emerald-500 h-full">
            <CardHeader className="p-3.5 pb-1">
              <CardDescription className="text-[10px] uppercase tracking-wider font-semibold text-emerald-800 flex items-center justify-between">
                <span>Confirmed</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              </CardDescription>
              <CardTitle className="text-xl font-bold font-mono text-emerald-950 mt-1">
                {kpis.confirmedCount}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3.5 pt-1 text-[11px] text-neutral-500 group-hover:text-emerald-700">
              Active confirmed bookings
            </CardContent>
          </Card>
        </Link>

        {/* Pending */}
        <Link href="/admin/bookings?status=PENDING" className="block group">
          <Card className="hover:border-amber-500 transition-colors shadow-xs border-l-4 border-l-amber-500 h-full">
            <CardHeader className="p-3.5 pb-1">
              <CardDescription className="text-[10px] uppercase tracking-wider font-semibold text-amber-800 flex items-center justify-between">
                <span>Pending Hold</span>
                <Clock className="w-3.5 h-3.5 text-amber-600" />
              </CardDescription>
              <CardTitle className="text-xl font-bold font-mono text-amber-950 mt-1">
                {kpis.pendingCount}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3.5 pt-1 text-[11px] text-neutral-500 group-hover:text-amber-700">
              Awaiting advance payment
            </CardContent>
          </Card>
        </Link>

        {/* Today's Arrivals (links to /admin/frontdesk/arrivals) */}
        <Link href="/admin/frontdesk/arrivals" className="block group">
          <Card className="hover:border-resort-gold transition-colors shadow-xs border-l-4 border-l-resort-gold h-full">
            <CardHeader className="p-3.5 pb-1">
              <CardDescription className="text-[10px] uppercase tracking-wider font-semibold text-neutral-700 flex items-center justify-between">
                <span>Today's Arrivals</span>
                <LogIn className="w-3.5 h-3.5 text-resort-gold" />
              </CardDescription>
              <CardTitle className="text-xl font-bold font-mono text-neutral-900 mt-1">
                {kpis.todayArrivalsCount}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3.5 pt-1 text-[11px] text-resort-gold hover:underline flex items-center gap-1">
              <span>Arrivals console</span>
              <ArrowRight className="w-3 h-3" />
            </CardContent>
          </Card>
        </Link>

        {/* Today's Departures (links to /admin/frontdesk/departures) */}
        <Link href="/admin/frontdesk/departures" className="block group">
          <Card className="hover:border-blue-500 transition-colors shadow-xs border-l-4 border-l-blue-500 h-full">
            <CardHeader className="p-3.5 pb-1">
              <CardDescription className="text-[10px] uppercase tracking-wider font-semibold text-neutral-700 flex items-center justify-between">
                <span>Today's Departures</span>
                <LogOut className="w-3.5 h-3.5 text-blue-500" />
              </CardDescription>
              <CardTitle className="text-xl font-bold font-mono text-neutral-900 mt-1">
                {kpis.todayDeparturesCount}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3.5 pt-1 text-[11px] text-blue-600 hover:underline flex items-center gap-1">
              <span>Departures console</span>
              <ArrowRight className="w-3 h-3" />
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Financial Summary Bar (Rendered only if authorized) */}
      {kpis.financialSummary.canViewFinancials && (
        <div className="bg-gradient-to-r from-resort-forest to-resort-forest-deep text-white rounded-xl p-4 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-resort-gold text-xs font-semibold uppercase tracking-wider">
              <Wallet className="w-4 h-4" />
              <span>Reservation Financial Summary</span>
            </div>
            <p className="text-[11px] text-resort-ivory/80 mt-0.5">
              Live financial snapshot for all non-cancelled reservations.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-6 divide-x divide-white/10 text-xs">
            <div className="pr-4">
              <div className="text-[10px] uppercase tracking-wider text-resort-ivory/70 font-medium">
                Booked Value
              </div>
              <div className="text-base font-bold font-mono text-white mt-0.5">
                {formatCurrency(kpis.financialSummary.bookedValue)}
              </div>
            </div>

            <div className="px-4">
              <div className="text-[10px] uppercase tracking-wider text-emerald-300 font-medium">
                Advances Received
              </div>
              <div className="text-base font-bold font-mono text-emerald-300 mt-0.5">
                {formatCurrency(kpis.financialSummary.advancesReceived)}
              </div>
            </div>

            <div className="pl-4">
              <div className="text-[10px] uppercase tracking-wider text-amber-300 font-medium">
                Outstanding Balance
              </div>
              <div className="text-base font-bold font-mono text-amber-300 mt-0.5">
                {formatCurrency(kpis.financialSummary.outstandingBalance)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
