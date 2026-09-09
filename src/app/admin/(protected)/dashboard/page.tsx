import Link from 'next/link';
import { requireAuth } from '@/lib/auth/auth';
import { getExecutiveDashboardOverview, MetricResult } from '@/lib/dashboard';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PeriodSelector } from './period-selector';
import {
  RevenuePerformanceChart,
  BookingTrendChart,
  BookingStatusBar,
  TopDishesChart,
  RevenueMixBar,
} from './dashboard-charts';
import {
  Building2,
  Calendar,
  CreditCard,
  BedDouble,
  UtensilsCrossed,
  TrendingUp,
  Percent,
  Clock,
  ArrowRight,
  AlertCircle,
  Users,
  LogIn,
  LogOut,
  Boxes,
  ChefHat,
  AlertTriangle,
  RotateCw,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{
    period?: string;
    start?: string;
    end?: string;
  }>;
}

export default async function AdminDashboardPage({ searchParams }: PageProps) {
  const user = await requireAuth();
  const resolvedSearchParams = await searchParams;

  const overview = await getExecutiveDashboardOverview(
    user,
    resolvedSearchParams.period,
    resolvedSearchParams.start,
    resolvedSearchParams.end
  );

  const businessDateStr = overview.businessDate;
  const propertyName = overview.property?.name || 'Infinity Resort and Restaurant';
  const propertyCode = overview.property?.code || 'TRR-MAIN';
  const propertyCity = overview.property?.city || 'Mhow';
  const periodRange = overview.periodRange;

  const businessDateFormatted = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(`${businessDateStr}T12:00:00.000Z`));

  // Helper for rendering metric or error badge
  const renderMetric = <T,>(
    result: MetricResult<T> | null,
    extractor: (data: T) => React.ReactNode,
    fallbackLabel: string = '—'
  ) => {
    if (!result) return <span className="text-neutral-400 text-sm">{fallbackLabel}</span>;
    if (result.status === 'error') {
      return (
        <span
          className="inline-flex items-center text-xs font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200"
          title={result.message}
        >
          <AlertCircle className="w-3 h-3 mr-1" /> Unable to load
        </span>
      );
    }
    return extractor(result.data);
  };

  const financial = overview.financialKpis?.status === 'success' ? overview.financialKpis.data : null;
  const revenueTrend = overview.revenuePerformance?.status === 'success' ? overview.revenuePerformance.data : null;
  const booking = overview.bookingPerformance?.status === 'success' ? overview.bookingPerformance.data : null;
  const restaurant = overview.restaurantPerformance?.status === 'success' ? overview.restaurantPerformance.data : null;
  const roomTypes = overview.roomTypePerformance?.status === 'success' ? overview.roomTypePerformance.data : null;
  const alerts = overview.operationalAttention?.status === 'success' ? overview.operationalAttention.data : null;

  return (
    <div className="space-y-8 pb-12">
      {/* 1. TOP HEADER & PERIOD SELECTOR */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-neutral-200 pb-5">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-resort-charcoal">
              Executive Resort Performance
            </h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-resort-sand/60 text-resort-charcoal border border-resort-sand">
              <Building2 className="w-3 h-3 mr-1 text-resort-gold" />
              {propertyName} ({propertyCode})
            </span>
          </div>
          <p className="text-xs text-resort-stone mt-1.5 flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center text-neutral-700 font-medium">
              <Calendar className="w-3.5 h-3.5 mr-1 text-resort-gold" />
              Business Date: {businessDateFormatted}
            </span>
            <span>•</span>
            <span>Timezone: Asia/Kolkata</span>
            <span>•</span>
            <span>{propertyCity}, India</span>
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <PeriodSelector
            currentPeriod={periodRange.period}
            startDateStr={resolvedSearchParams.start}
            endDateStr={resolvedSearchParams.end}
          />
          <Link href={`/admin/dashboard?period=${periodRange.period}`}>
            <Button size="sm" variant="outline" className="text-xs h-9 border-neutral-300">
              <RotateCw className="w-3.5 h-3.5 mr-1 text-neutral-500" /> Refresh
            </Button>
          </Link>
        </div>
      </div>

      {/* 2. EXECUTIVE KPI ROW (6 CORE MANAGEMENT CARDS) */}
      {overview.financialKpis !== null && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs uppercase font-bold tracking-wider text-neutral-500">
              Executive Performance Summary ({periodRange.label})
            </h2>
            <span className="text-[11px] text-neutral-400">
              {periodRange.current.startDateStr} to {periodRange.current.endDateStr} ({periodRange.current.daysCount} days)
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {/* KPI 1: TOTAL RESORT REVENUE */}
            <Card className="border-l-4 border-l-resort-forest hover:shadow-md transition-shadow">
              <CardHeader className="p-4 pb-1">
                <CardDescription className="text-[11px] uppercase tracking-wider font-semibold text-neutral-500 flex items-center justify-between">
                  <span>Total Revenue</span>
                  <CreditCard className="w-4 h-4 text-resort-forest" />
                </CardDescription>
                <CardTitle className="text-xl font-bold text-neutral-900 mt-1 font-mono">
                  {renderMetric(overview.financialKpis, (d) => `₹${d.totalRevenue.toString()}`)}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-1">
                {financial?.totalRevenueGrowth !== null && financial?.totalRevenueGrowth !== undefined ? (
                  <span className={`text-[11px] font-semibold ${financial.totalRevenueGrowth >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {financial.totalRevenueGrowth >= 0 ? `+${financial.totalRevenueGrowth}%` : `${financial.totalRevenueGrowth}%`} vs prior
                  </span>
                ) : (
                  <span className="text-[11px] text-neutral-400">{periodRange.label}</span>
                )}
                <p className="text-[10px] text-neutral-400 mt-0.5">Rooms + Restaurant</p>
              </CardContent>
            </Card>

            {/* KPI 2: ROOM REVENUE */}
            <Card className="border-l-4 border-l-resort-gold hover:shadow-md transition-shadow">
              <CardHeader className="p-4 pb-1">
                <CardDescription className="text-[11px] uppercase tracking-wider font-semibold text-neutral-500 flex items-center justify-between">
                  <span>Room Revenue</span>
                  <BedDouble className="w-4 h-4 text-resort-gold" />
                </CardDescription>
                <CardTitle className="text-xl font-bold text-neutral-900 mt-1 font-mono">
                  {renderMetric(overview.financialKpis, (d) => `₹${d.roomRevenue.toString()}`)}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-1">
                {financial?.roomRevenueGrowth !== null && financial?.roomRevenueGrowth !== undefined ? (
                  <span className={`text-[11px] font-semibold ${financial.roomRevenueGrowth >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {financial.roomRevenueGrowth >= 0 ? `+${financial.roomRevenueGrowth}%` : `${financial.roomRevenueGrowth}%`} vs prior
                  </span>
                ) : (
                  <span className="text-[11px] text-neutral-400">{periodRange.label}</span>
                )}
                <p className="text-[10px] text-neutral-400 mt-0.5">Folio Room Charges</p>
              </CardContent>
            </Card>

            {/* KPI 3: RESTAURANT REVENUE */}
            <Card className="border-l-4 border-l-resort-olive hover:shadow-md transition-shadow">
              <CardHeader className="p-4 pb-1">
                <CardDescription className="text-[11px] uppercase tracking-wider font-semibold text-neutral-500 flex items-center justify-between">
                  <span>Restaurant Revenue</span>
                  <UtensilsCrossed className="w-4 h-4 text-resort-olive" />
                </CardDescription>
                <CardTitle className="text-xl font-bold text-neutral-900 mt-1 font-mono">
                  {renderMetric(overview.financialKpis, (d) => `₹${d.restaurantRevenue.toString()}`)}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-1">
                {financial?.restaurantRevenueGrowth !== null && financial?.restaurantRevenueGrowth !== undefined ? (
                  <span className={`text-[11px] font-semibold ${financial.restaurantRevenueGrowth >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {financial.restaurantRevenueGrowth >= 0 ? `+${financial.restaurantRevenueGrowth}%` : `${financial.restaurantRevenueGrowth}%`} vs prior
                  </span>
                ) : (
                  <span className="text-[11px] text-neutral-400">{periodRange.label}</span>
                )}
                <p className="text-[10px] text-neutral-400 mt-0.5">Settled POS & Room Bills</p>
              </CardContent>
            </Card>

            {/* KPI 4: ACTUAL OCCUPANCY RATE */}
            <Card className="border-l-4 border-l-blue-600 hover:shadow-md transition-shadow">
              <CardHeader className="p-4 pb-1">
                <CardDescription className="text-[11px] uppercase tracking-wider font-semibold text-neutral-500 flex items-center justify-between">
                  <span>Actual Occupancy</span>
                  <Percent className="w-4 h-4 text-blue-600" />
                </CardDescription>
                <CardTitle className="text-xl font-bold text-neutral-900 mt-1 font-mono">
                  {renderMetric(overview.financialKpis, (d) => `${d.occupancyRate}%`)}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-1">
                <p className="text-xs text-neutral-600 font-medium">
                  {financial ? `${financial.occupiedRoomNights} / ${financial.availableRoomNights} nights` : '—'}
                </p>
                <p className="text-[10px] text-neutral-400 mt-0.5">Actual stays ÷ available nights</p>
              </CardContent>
            </Card>

            {/* KPI 5: ADR (Average Daily Rate) */}
            <Card className="border-l-4 border-l-indigo-600 hover:shadow-md transition-shadow">
              <CardHeader className="p-4 pb-1">
                <CardDescription className="text-[11px] uppercase tracking-wider font-semibold text-neutral-500 flex items-center justify-between">
                  <span>ADR</span>
                  <TrendingUp className="w-4 h-4 text-indigo-600" />
                </CardDescription>
                <CardTitle className="text-xl font-bold text-neutral-900 mt-1 font-mono">
                  {renderMetric(
                    overview.financialKpis,
                    (d) => (d.adr ? `₹${d.adr.toFixed(0)}` : '—'),
                    '—'
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-1">
                <p className="text-xs text-neutral-600 font-medium">Average Daily Rate</p>
                <p className="text-[10px] text-neutral-400 mt-0.5">Room Rev ÷ Occupied Nights</p>
              </CardContent>
            </Card>

            {/* KPI 6: RevPAR */}
            <Card className="border-l-4 border-l-purple-600 hover:shadow-md transition-shadow">
              <CardHeader className="p-4 pb-1">
                <CardDescription className="text-[11px] uppercase tracking-wider font-semibold text-neutral-500 flex items-center justify-between">
                  <span>RevPAR</span>
                  <TrendingUp className="w-4 h-4 text-purple-600" />
                </CardDescription>
                <CardTitle className="text-xl font-bold text-neutral-900 mt-1 font-mono">
                  {renderMetric(
                    overview.financialKpis,
                    (d) => (d.revpar ? `₹${d.revpar.toFixed(0)}` : '—'),
                    '—'
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-1">
                <p className="text-xs text-neutral-600 font-medium">Rev Per Available Room</p>
                <p className="text-[10px] text-neutral-400 mt-0.5">Room Rev ÷ Available Nights</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* 3. REVENUE PERFORMANCE GRAPH & MIX */}
      {overview.revenuePerformance !== null && (
        <Card className="border-resort-sand">
          <CardHeader className="p-5 pb-3 border-b border-neutral-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-semibold text-resort-charcoal flex items-center">
                <TrendingUp className="w-4 h-4 mr-2 text-resort-gold" />
                Revenue Performance Trend ({periodRange.granularity.toUpperCase()})
              </CardTitle>
              <CardDescription className="text-xs text-resort-stone mt-0.5">
                Authoritative financial transactions: Room charges vs restaurant sales
              </CardDescription>
            </div>
            {revenueTrend && revenueTrend.hasData && (
              <div className="flex items-center gap-3 text-xs bg-neutral-50 px-3 py-1.5 rounded border border-neutral-200">
                <span className="text-neutral-500">Revenue Mix:</span>
                <span className="font-semibold text-neutral-800">
                  Rooms: <strong>{revenueTrend.roomRevenueSharePct}%</strong>
                </span>
                <span className="text-neutral-300">|</span>
                <span className="font-semibold text-neutral-800">
                  F&B: <strong>{revenueTrend.restaurantRevenueSharePct}%</strong>
                </span>
              </div>
            )}
          </CardHeader>
          <CardContent className="p-5 space-y-5">
            {overview.revenuePerformance.status === 'error' ? (
              <div className="p-4 bg-rose-50 text-rose-700 text-xs rounded border border-rose-200">
                {overview.revenuePerformance.message}
              </div>
            ) : revenueTrend ? (
              <>
                <RevenuePerformanceChart
                  trend={revenueTrend.trend}
                  hasData={revenueTrend.hasData}
                />
                <RevenueMixBar
                  totalRevenue={revenueTrend.totalRevenueTotal.toString()}
                  roomRevenue={revenueTrend.roomRevenueTotal.toString()}
                  roomRevenuePct={revenueTrend.roomRevenueSharePct}
                  restaurantRevenue={revenueTrend.restaurantRevenueTotal.toString()}
                  restaurantRevenuePct={revenueTrend.restaurantRevenueSharePct}
                />
              </>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* 4. COMMERCIAL RESERVATIONS & BOOKING VOLUME */}
      {overview.bookingPerformance !== null && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Commercial Booking Metrics */}
          <Card className="border-resort-sand lg:col-span-1">
            <CardHeader className="p-4 border-b border-neutral-100 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center text-resort-charcoal">
                  <Calendar className="w-4 h-4 mr-2 text-resort-gold" />
                  Booking Performance — Created
                </CardTitle>
                <CardDescription className="text-xs text-resort-stone">
                  Commercial booking demand created during period
                </CardDescription>
              </div>
              <Link href="/admin/bookings" className="text-xs text-resort-gold hover:underline font-medium">
                Console →
              </Link>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {overview.bookingPerformance.status === 'error' ? (
                <div className="p-4 bg-rose-50 text-rose-700 text-xs rounded border border-rose-200">
                  {overview.bookingPerformance.message}
                </div>
              ) : booking ? (
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-1 border-b border-neutral-100 text-xs">
                    <span className="text-neutral-600">Total Bookings Created</span>
                    <span className="font-bold text-neutral-900 font-mono text-sm">
                      {booking.totalBookings}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-neutral-100 text-xs">
                    <span className="text-neutral-600">Room Nights Booked</span>
                    <span className="font-semibold text-neutral-800 font-mono">
                      {booking.roomNightsBooked} nights
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-neutral-100 text-xs">
                    <span className="text-neutral-600">Total Booked Value</span>
                    <span className="font-semibold text-emerald-700 font-mono">
                      ₹{booking.totalBookedValue.toString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-neutral-100 text-xs">
                    <span className="text-neutral-600">Average Booking Value</span>
                    <span className="font-mono text-neutral-800">
                      {booking.averageBookingValue ? `₹${booking.averageBookingValue.toFixed(0)}` : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 text-xs bg-neutral-50 px-2.5 rounded">
                    <div>
                      <span className="text-neutral-700 font-medium block">Cancellation Rate</span>
                      <span className="text-[10px] text-neutral-400">Of bookings created in period</span>
                    </div>
                    <span className="font-bold font-mono text-neutral-900">
                      {booking.cancellationRate !== null ? `${booking.cancellationRate}%` : '—'}
                    </span>
                  </div>

                  <div className="pt-2">
                    <div className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
                      Booking Status Distribution
                    </div>
                    <BookingStatusBar
                      statusBreakdown={booking.statusBreakdown}
                      total={booking.totalBookings}
                    />
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Booking Creation Trend Chart */}
          <Card className="border-resort-sand lg:col-span-2">
            <CardHeader className="p-4 border-b border-neutral-100">
              <CardTitle className="text-sm font-semibold flex items-center text-resort-charcoal">
                <TrendingUp className="w-4 h-4 mr-2 text-blue-600" />
                Booking Volume Trend (Reservation.createdAt)
              </CardTitle>
              <CardDescription className="text-xs text-resort-stone">
                Reservations created per date bucket during {periodRange.label}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              {booking && <BookingTrendChart trend={booking.trend} />}
            </CardContent>
          </Card>
        </div>
      )}

      {/* 5. RESTAURANT PERFORMANCE & TOP SELLING DISHES */}
      {overview.restaurantPerformance !== null && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Restaurant Sales & Order Type Distribution */}
          <Card className="border-resort-sand">
            <CardHeader className="p-4 border-b border-neutral-100 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center text-resort-charcoal">
                  <UtensilsCrossed className="w-4 h-4 mr-2 text-resort-gold" />
                  Restaurant POS & Sales Performance
                </CardTitle>
                <CardDescription className="text-xs text-resort-stone">
                  Authoritative restaurant bills and order volume
                </CardDescription>
              </div>
              <Link href="/admin/restaurant" className="text-xs text-resort-gold hover:underline font-medium">
                Console →
              </Link>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {overview.restaurantPerformance.status === 'error' ? (
                <div className="p-4 bg-rose-50 text-rose-700 text-xs rounded border border-rose-200">
                  {overview.restaurantPerformance.message}
                </div>
              ) : restaurant ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2.5 bg-neutral-50 rounded border border-neutral-200">
                      <div className="text-[10px] uppercase font-bold text-neutral-500">Sales</div>
                      <div className="text-base font-bold font-mono text-neutral-900 mt-0.5">
                        ₹{restaurant.totalSales.toString()}
                      </div>
                    </div>
                    <div className="p-2.5 bg-neutral-50 rounded border border-neutral-200">
                      <div className="text-[10px] uppercase font-bold text-neutral-500">Orders</div>
                      <div className="text-base font-bold font-mono text-neutral-900 mt-0.5">
                        {restaurant.totalOrders}
                      </div>
                    </div>
                    <div className="p-2.5 bg-neutral-50 rounded border border-neutral-200">
                      <div className="text-[10px] uppercase font-bold text-neutral-500">Avg Order</div>
                      <div className="text-base font-bold font-mono text-neutral-900 mt-0.5">
                        {restaurant.averageOrderValue ? `₹${restaurant.averageOrderValue.toFixed(0)}` : '—'}
                      </div>
                    </div>
                  </div>

                  <div className="pt-2">
                    <div className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
                      Order Type Breakdown
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between items-center py-1 border-b border-neutral-100">
                        <span className="text-neutral-700 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-600" /> Dine-In
                        </span>
                        <span className="font-mono text-neutral-800">
                          {restaurant.orderTypeBreakdown.dineInCount} orders (₹{restaurant.orderTypeBreakdown.dineInSales.toString()})
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-neutral-100">
                        <span className="text-neutral-700 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-blue-600" /> Take-Away
                        </span>
                        <span className="font-mono text-neutral-800">
                          {restaurant.orderTypeBreakdown.takeAwayCount} orders (₹{restaurant.orderTypeBreakdown.takeAwaySales.toString()})
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-neutral-100">
                        <span className="text-neutral-700 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-purple-600" /> Room Service
                        </span>
                        <span className="font-mono text-neutral-800">
                          {restaurant.orderTypeBreakdown.roomServiceCount} orders (₹{restaurant.orderTypeBreakdown.roomServiceSales.toString()})
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Top Selling Dishes */}
          <Card className="border-resort-sand">
            <CardHeader className="p-4 border-b border-neutral-100">
              <CardTitle className="text-sm font-semibold flex items-center text-resort-charcoal">
                <ChefHat className="w-4 h-4 mr-2 text-resort-gold" />
                Top-Selling Dishes (Ranked by Quantity Sold)
              </CardTitle>
              <CardDescription className="text-xs text-resort-stone">
                Database aggregation excluding cancelled orders
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              {restaurant && <TopDishesChart items={restaurant.topDishes} />}
            </CardContent>
          </Card>
        </div>
      )}

      {/* 6. ROOM PERFORMANCE BY ROOM TYPE */}
      {overview.roomTypePerformance !== null && (
        <Card className="border-resort-sand">
          <CardHeader className="p-4 border-b border-neutral-100 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center text-resort-charcoal">
                <BedDouble className="w-4 h-4 mr-2 text-resort-gold" />
                Room Performance & Categories
              </CardTitle>
              <CardDescription className="text-xs text-resort-stone">
                Authoritative room types loaded dynamically from database
              </CardDescription>
            </div>
            <Link href="/admin/rooms" className="text-xs text-resort-gold hover:underline font-medium">
              Rooms & PMS →
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {overview.roomTypePerformance.status === 'error' ? (
              <div className="p-4 bg-rose-50 text-rose-700 text-xs rounded border border-rose-200 m-4">
                {overview.roomTypePerformance.message}
              </div>
            ) : roomTypes && roomTypes.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-neutral-50/80 border-b border-neutral-200 text-[11px] uppercase tracking-wider text-neutral-500 font-semibold">
                    <tr>
                      <th className="py-3 px-4">Room Type</th>
                      <th className="py-3 px-4 text-center">Current Inventory</th>
                      <th className="py-3 px-4 text-center">Occupied Nights</th>
                      <th className="py-3 px-4 text-center">Occupancy Rate</th>
                      <th className="py-3 px-4 text-right">Revenue Posted</th>
                      <th className="py-3 px-4 text-right">ADR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 font-medium text-neutral-700">
                    {roomTypes.map((rt) => (
                      <tr key={rt.roomTypeId} className="hover:bg-neutral-50/50 transition-colors">
                        <td className="py-3 px-4 font-semibold text-neutral-900">{rt.name}</td>
                        <td className="py-3 px-4 text-center font-mono">{rt.totalRooms} rooms</td>
                        <td className="py-3 px-4 text-center font-mono">{rt.occupiedNights}</td>
                        <td className="py-3 px-4 text-center font-mono">{rt.occupancyRate}%</td>
                        <td className="py-3 px-4 text-right font-mono text-emerald-800">
                          ₹{rt.revenue.toString()}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-neutral-600">
                          {rt.adr ? `₹${rt.adr.toFixed(0)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="p-3 bg-neutral-50/50 border-t border-neutral-100 text-[11px] text-neutral-400 italic">
                  *Current Inventory reflects live active physical rooms. Occupied Nights and Posted Revenue are calculated from actual physical stay and room charge intervals.
                </div>
              </div>
            ) : (
              <p className="p-4 text-xs text-neutral-500 italic">No room types configured.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* 7. OPERATIONAL ATTENTION (COMPACT BOTTOM ALERTS) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs uppercase font-bold tracking-wider text-neutral-500 flex items-center">
            <AlertTriangle className="w-3.5 h-3.5 mr-1.5 text-amber-600" />
            Operational Attention (Today's Real-Time Status)
          </h2>
          <span className="text-[11px] text-neutral-400">Click any card to launch operational console</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Alert 1: Today Arrivals */}
          <Link href="/admin/frontdesk/arrivals" className="group">
            <div className="p-3 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-200 transition-colors">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-amber-800">
                <span>Arrivals</span>
                <LogIn className="w-3.5 h-3.5 text-amber-600" />
              </div>
              <div className="text-xl font-bold text-amber-950 mt-1 font-mono">
                {renderMetric(overview.operationalAttention, (d) => d.arrivalsToday)}
              </div>
              <div className="text-[10px] text-amber-700 mt-1 group-hover:underline flex items-center">
                Launch console <ArrowRight className="w-2.5 h-2.5 ml-0.5" />
              </div>
            </div>
          </Link>

          {/* Alert 2: Today Departures */}
          <Link href="/admin/frontdesk/departures?filter=today" className="group">
            <div className="p-3 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition-colors">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-rose-800">
                <span>Departures</span>
                <LogOut className="w-3.5 h-3.5 text-rose-600" />
              </div>
              <div className="text-xl font-bold text-rose-950 mt-1 font-mono">
                {renderMetric(overview.operationalAttention, (d) => d.departuresToday)}
              </div>
              <div className="text-[10px] text-rose-700 mt-1 group-hover:underline flex items-center">
                Checkouts <ArrowRight className="w-2.5 h-2.5 ml-0.5" />
              </div>
            </div>
          </Link>

          {/* Alert 3: In-House Stays */}
          <Link href="/admin/frontdesk/inhouse" className="group">
            <div className="p-3 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-blue-800">
                <span>In-House</span>
                <Users className="w-3.5 h-3.5 text-blue-600" />
              </div>
              <div className="text-xl font-bold text-blue-950 mt-1 font-mono">
                {renderMetric(overview.operationalAttention, (d) => d.inHouseStays)}
              </div>
              <div className="text-[10px] text-blue-700 mt-1 group-hover:underline flex items-center">
                Running folios <ArrowRight className="w-2.5 h-2.5 ml-0.5" />
              </div>
            </div>
          </Link>

          {/* Alert 4: Low Stock Items */}
          <Link href="/admin/inventory" className="group">
            <div className="p-3 bg-amber-50/70 hover:bg-amber-100 rounded-lg border border-amber-200 transition-colors">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-amber-800">
                <span>Low Stock</span>
                <Boxes className="w-3.5 h-3.5 text-amber-600" />
              </div>
              <div className="text-xl font-bold text-amber-950 mt-1 font-mono">
                {renderMetric(overview.operationalAttention, (d) => d.lowStockCount)}
              </div>
              <div className="text-[10px] text-amber-700 mt-1 group-hover:underline flex items-center">
                Store ledger <ArrowRight className="w-2.5 h-2.5 ml-0.5" />
              </div>
            </div>
          </Link>

          {/* Alert 5: Pending KOTs */}
          <Link href="/admin/restaurant" className="group">
            <div className="p-3 bg-orange-50 hover:bg-orange-100 rounded-lg border border-orange-200 transition-colors">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-orange-800">
                <span>Pending KOT</span>
                <ChefHat className="w-3.5 h-3.5 text-orange-600" />
              </div>
              <div className="text-xl font-bold text-orange-950 mt-1 font-mono">
                {renderMetric(overview.operationalAttention, (d) => d.pendingKOTs)}
              </div>
              <div className="text-[10px] text-orange-700 mt-1 group-hover:underline flex items-center">
                Kitchen display <ArrowRight className="w-2.5 h-2.5 ml-0.5" />
              </div>
            </div>
          </Link>

          {/* Alert 6: Room Issues */}
          <Link href="/admin/rooms" className="group">
            <div className="p-3 bg-neutral-100 hover:bg-neutral-200 rounded-lg border border-neutral-300 transition-colors">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-neutral-800">
                <span>Room Issues</span>
                <BedDouble className="w-3.5 h-3.5 text-neutral-600" />
              </div>
              <div className="text-xl font-bold text-neutral-900 mt-1 font-mono">
                {renderMetric(overview.operationalAttention, (d) => d.roomIssues)}
              </div>
              <div className="text-[10px] text-neutral-700 mt-1 group-hover:underline flex items-center">
                Housekeeping <ArrowRight className="w-2.5 h-2.5 ml-0.5" />
              </div>
            </div>
          </Link>
        </div>
      </div>

      {/* 8. PROCUREMENT (PHASE 1.X ARCHITECTURAL MILESTONE) */}
      <Card className="border-dashed border-neutral-300 bg-neutral-50/50">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-semibold flex items-center text-neutral-600">
            <Clock className="w-4 h-4 mr-2 text-neutral-400" />
            Procurement & Vendor Payables
          </CardTitle>
          <CardDescription className="text-xs text-neutral-500">
            Purchase requests, PO issuance, GRN, and vendor invoice reconciliation
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-1">
          <div className="py-2 text-center">
            <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-medium bg-neutral-200/80 text-neutral-700">
              Planned — Phase 1.x Architecture Milestone
            </span>
            <p className="text-[11px] text-neutral-500 mt-1.5 max-w-sm mx-auto">
              Direct vendor purchasing workflows and Goods Receipt Notes (GRN) are scheduled in subsequent implementation phases. Metrics omitted to maintain zero data fabrication.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}