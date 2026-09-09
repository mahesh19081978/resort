'use client';

import { useState, useTransition, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { searchGuestsAction } from '@/actions/guest-db';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Search, User, Calendar, Bed, CreditCard, ChevronDown, ChevronUp,
  Filter, X, Star, AlertTriangle, Users, TrendingUp, Clock, MapPin,
  FileText, Camera, ChevronLeft, ChevronRight,
} from 'lucide-react';

interface GuestDatabaseRow {
  guestId: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  city: string | null;
  country: string | null;
  vip: boolean;
  blacklisted: boolean;
  createdAt: string;
  totalStays: number;
  totalReservations: number;
  totalBilled: string;
  totalPaid: string;
  outstandingBalance: string;
  latestStay: {
    stayId: string;
    stayNumber: string;
    roomNumber: string;
    roomTypeName: string;
    actualCheckIn: string;
    expectedCheckOut: string;
    actualCheckOut: string | null;
    status: string;
    folioBalance: string;
  } | null;
  currentStay: {
    stayId: string;
    stayNumber: string;
    roomNumber: string;
    roomTypeName: string;
    actualCheckIn: string;
    expectedCheckOut: string;
    folioBalance: string;
  } | null;
  upcomingReservation: {
    reservationId: string;
    reservationNumber: string;
    checkInDate: string;
    checkOutDate: string;
    roomTypeName: string;
    status: string;
    totalAmount: string;
    advancePaid: string;
  } | null;
  currentStatus: string;
  hasPhoto: boolean;
  hasDocuments: boolean;
}

interface GuestDatabaseSummary {
  totalGuests: number;
  currentlyStaying: number;
  upcomingBookings: number;
  completedStays: number;
  totalBilled: string;
  totalPaid: string;
}

interface GuestDatabasePagination {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface Filters {
  status: string;
  dateFrom: string;
  dateTo: string;
  dateSemantic: string;
  roomNumber: string;
  roomType: string;
  city: string;
  bookingSource: string;
  hasPhoto: boolean;
  hasDocuments: boolean;
}

function formatINR(amount: string): string {
  const num = parseFloat(amount);
  if (num >= 10000000) return '\u20B9' + (num / 10000000).toFixed(1) + 'Cr';
  if (num >= 100000) return '\u20B9' + (num / 100000).toFixed(1) + 'L';
  return '\u20B9' + num.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function formatINRAmount(amount: string): string {
  const num = parseFloat(amount);
  return '\u20B9' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    CURRENTLY_STAYING: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'In House' },
    UPCOMING_BOOKING: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Upcoming' },
    COMPLETED: { bg: 'bg-neutral-100', text: 'text-neutral-600', label: 'Completed' },
    CANCELLED: { bg: 'bg-red-50', text: 'text-red-700', label: 'Cancelled' },
    NO_SHOW: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'No Show' },
    NEVER_STAYED: { bg: 'bg-purple-50', text: 'text-purple-700', label: 'New Guest' },
  };
  const s = map[status] || { bg: 'bg-neutral-50', text: 'text-neutral-600', label: status };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

function StayStatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    ACTIVE: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
    CHECKED_OUT: { bg: 'bg-neutral-100', text: 'text-neutral-600' },
    EARLY_CHECKOUT: { bg: 'bg-amber-50', text: 'text-amber-700' },
    RESERVED: { bg: 'bg-blue-50', text: 'text-blue-700' },
    CANCELLED: { bg: 'bg-red-50', text: 'text-red-700' },
  };
  const s = map[status] || { bg: 'bg-neutral-50', text: 'text-neutral-600' };
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium ring-1 ring-inset ${s.bg} ${s.text}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function FilterPanel({
  filters,
  onChange,
  onApply,
  onClear,
  isPending,
}: {
  filters: Filters;
  onChange: (f: Partial<Filters>) => void;
  onApply: () => void;
  onClear: () => void;
  isPending: boolean;
}) {
  const hasActiveFilters = filters.status !== 'all' || filters.dateFrom || filters.dateTo ||
    filters.roomNumber || filters.roomType || filters.city || filters.bookingSource !== 'all' ||
    filters.hasPhoto || filters.hasDocuments;

  return (
    <div className="bg-neutral-50 border border-resort-sand/60 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-resort-forest" />
          <span className="text-xs font-semibold text-resort-charcoal">Advanced Filters</span>
          {hasActiveFilters && (
            <span className="bg-resort-forest text-white text-[9px] px-1.5 py-0.5 rounded-full">
              Active
            </span>
          )}
        </div>
        <button onClick={onClear} className="text-[10px] text-neutral-500 hover:text-red-600 flex items-center gap-1">
          <X className="h-3 w-3" /> Clear All
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-[10px] font-medium text-neutral-600 mb-1">Guest Status</label>
          <select
            value={filters.status}
            onChange={(e) => onChange({ status: e.target.value })}
            className="w-full rounded border border-neutral-300 px-2 py-1.5 text-xs bg-white"
          >
            <option value="all">All Guests</option>
            <option value="currently_staying">Currently Staying</option>
            <option value="upcoming">Upcoming Bookings</option>
            <option value="completed">Completed Stays</option>
            <option value="cancelled">Cancelled</option>
            <option value="no_show">No Show</option>
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-medium text-neutral-600 mb-1">Date Semantic</label>
          <select
            value={filters.dateSemantic}
            onChange={(e) => onChange({ dateSemantic: e.target.value })}
            className="w-full rounded border border-neutral-300 px-2 py-1.5 text-xs bg-white"
          >
            <option value="stay">Stay Activity</option>
            <option value="checkin">Check-in Date</option>
            <option value="checkout">Check-out Date</option>
            <option value="booking">Booking Date</option>
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-medium text-neutral-600 mb-1">Date From</label>
          <Input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => onChange({ dateFrom: e.target.value })}
            className="text-xs"
          />
        </div>

        <div>
          <label className="block text-[10px] font-medium text-neutral-600 mb-1">Date To</label>
          <Input
            type="date"
            value={filters.dateTo}
            onChange={(e) => onChange({ dateTo: e.target.value })}
            className="text-xs"
          />
        </div>

        <div>
          <label className="block text-[10px] font-medium text-neutral-600 mb-1">Room Number</label>
          <Input
            placeholder="e.g. A-101"
            value={filters.roomNumber}
            onChange={(e) => onChange({ roomNumber: e.target.value })}
            className="text-xs"
          />
        </div>

        <div>
          <label className="block text-[10px] font-medium text-neutral-600 mb-1">Room Type</label>
          <Input
            placeholder="e.g. Deluxe Suite"
            value={filters.roomType}
            onChange={(e) => onChange({ roomType: e.target.value })}
            className="text-xs"
          />
        </div>

        <div>
          <label className="block text-[10px] font-medium text-neutral-600 mb-1">City</label>
          <Input
            placeholder="e.g. Mumbai"
            value={filters.city}
            onChange={(e) => onChange({ city: e.target.value })}
            className="text-xs"
          />
        </div>

        <div>
          <label className="block text-[10px] font-medium text-neutral-600 mb-1">Booking Source</label>
          <select
            value={filters.bookingSource}
            onChange={(e) => onChange({ bookingSource: e.target.value })}
            className="w-full rounded border border-neutral-300 px-2 py-1.5 text-xs bg-white"
          >
            <option value="all">All Sources</option>
            <option value="direct">Direct</option>
            <option value="website">Website</option>
            <option value="phone">Phone</option>
            <option value="walk_in">Walk-in</option>
            <option value="ota">OTA</option>
            <option value="agent">Agent</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-4 mt-3">
        <label className="flex items-center gap-1.5 text-[10px] text-neutral-600">
          <input
            type="checkbox"
            checked={filters.hasPhoto}
            onChange={(e) => onChange({ hasPhoto: e.target.checked })}
            className="rounded border-neutral-300"
          />
          Has Photo
        </label>
        <label className="flex items-center gap-1.5 text-[10px] text-neutral-600">
          <input
            type="checkbox"
            checked={filters.hasDocuments}
            onChange={(e) => onChange({ hasDocuments: e.target.checked })}
            className="rounded border-neutral-300"
          />
          Has Documents
        </label>
        <div className="ml-auto">
          <Button
            onClick={onApply}
            disabled={isPending}
            className="bg-resort-forest text-white hover:bg-resort-forest/90 text-xs px-4 py-1.5"
          >
            Apply Filters
          </Button>
        </div>
      </div>
    </div>
  );
}

export function GuestDatabaseClient() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState('');
  const [guests, setGuests] = useState<GuestDatabaseRow[]>([]);
  const [pagination, setPagination] = useState<GuestDatabasePagination | null>(null);
  const [summary, setSummary] = useState<GuestDatabaseSummary | null>(null);
  const [searched, setSearched] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    status: 'all',
    dateFrom: '',
    dateTo: '',
    dateSemantic: 'stay',
    roomNumber: '',
    roomType: '',
    city: '',
    bookingSource: 'all',
    hasPhoto: false,
    hasDocuments: false,
  });

  const loadData = useCallback(async (page: number = 1, searchQuery?: string, activeFilters?: Filters) => {
    startTransition(async () => {
      const f = activeFilters ?? filters;
      const result = await searchGuestsAction({
        query: searchQuery || undefined,
        page,
        pageSize: 25,
        filters: {
          status: f.status,
          dateFrom: f.dateFrom || undefined,
          dateTo: f.dateTo || undefined,
          dateSemantic: f.dateSemantic,
          roomNumber: f.roomNumber || undefined,
          roomType: f.roomType || undefined,
          city: f.city || undefined,
          bookingSource: f.bookingSource,
          hasPhoto: f.hasPhoto || undefined,
          hasDocuments: f.hasDocuments || undefined,
        },
      });

      setGuests(result.guests);
      setPagination(result.pagination);
      setSummary(result.summary);
      setSearched(true);
    });
  }, [filters]);

  useEffect(() => {
    loadData(1);
  }, []);

  const handleSearch = () => {
    loadData(1, query);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleApplyFilters = () => {
    loadData(1, query, filters);
  };

  const handleClearFilters = () => {
    const cleared: Filters = {
      status: 'all', dateFrom: '', dateTo: '', dateSemantic: 'stay',
      roomNumber: '', roomType: '', city: '', bookingSource: 'all',
      hasPhoto: false, hasDocuments: false,
    };
    setFilters(cleared);
    loadData(1, query, cleared);
  };

  const handlePageChange = (page: number) => {
    loadData(page, query);
  };

  return (
    <div>
      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <div className="bg-white border border-resort-sand/60 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-3.5 w-3.5 text-resort-forest" />
              <span className="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">Total Guests</span>
            </div>
            <div className="text-xl font-bold text-resort-charcoal">{summary.totalGuests.toLocaleString()}</div>
          </div>
          <div className="bg-white border border-emerald-200 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Bed className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-[10px] font-medium text-emerald-600 uppercase tracking-wider">In House</span>
            </div>
            <div className="text-xl font-bold text-emerald-700">{summary.currentlyStaying}</div>
          </div>
          <div className="bg-white border border-blue-200 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="h-3.5 w-3.5 text-blue-600" />
              <span className="text-[10px] font-medium text-blue-600 uppercase tracking-wider">Upcoming</span>
            </div>
            <div className="text-xl font-bold text-blue-700">{summary.upcomingBookings}</div>
          </div>
          <div className="bg-white border border-resort-sand/60 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-3.5 w-3.5 text-resort-gold" />
              <span className="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">Total Billed</span>
            </div>
            <div className="text-lg font-bold text-resort-charcoal">{formatINR(summary.totalBilled)}</div>
          </div>
          <div className="bg-white border border-resort-sand/60 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <CreditCard className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">Total Paid</span>
            </div>
            <div className="text-lg font-bold text-emerald-700">{formatINR(summary.totalPaid)}</div>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-2xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <Input
            placeholder="Search by guest name, phone, email, reservation #, stay #, room #..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="pl-10"
          />
        </div>
        <Button
          onClick={handleSearch}
          disabled={isPending || !query.trim()}
          className="bg-resort-forest text-white hover:bg-resort-forest/90"
        >
          {isPending ? 'Searching...' : 'Search'}
        </Button>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            showFilters ? 'bg-resort-forest text-white' : 'bg-resort-sand/50 text-resort-charcoal hover:bg-resort-sand'
          }`}
        >
          <Filter className="h-3.5 w-3.5" />
          Filters
          {showFilters ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <FilterPanel
          filters={filters}
          onChange={(f) => setFilters((prev) => ({ ...prev, ...f }))}
          onApply={handleApplyFilters}
          onClear={handleClearFilters}
          isPending={isPending}
        />
      )}

      {/* Results */}
      {isPending && !guests.length && (
        <div className="text-center py-12 text-neutral-500 text-sm">Loading...</div>
      )}

      {!isPending && searched && guests.length === 0 && (
        <div className="text-center py-12">
          <Users className="h-10 w-10 text-neutral-300 mx-auto mb-3" />
          <p className="text-sm text-neutral-500">No guests found</p>
          <p className="text-xs text-neutral-400 mt-1">Try adjusting your search or filters</p>
        </div>
      )}

      {!isPending && guests.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-neutral-500">
              {pagination?.total ?? 0} guest{(pagination?.total ?? 0) !== 1 ? 's' : ''} found
              {pagination && pagination.totalPages > 1 && ` (page ${pagination.page} of ${pagination.totalPages})`}
            </span>
          </div>

          <div className="bg-white border border-resort-sand/60 rounded-lg overflow-hidden overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200">
                  <th className="px-4 py-2.5 font-semibold text-neutral-700 uppercase text-[10px] tracking-wider">Guest</th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-700 uppercase text-[10px] tracking-wider">Status</th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-700 uppercase text-[10px] tracking-wider">Latest Stay</th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-700 uppercase text-[10px] tracking-wider">Current/Upcoming</th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-700 uppercase text-[10px] tracking-wider text-right">Total Billed</th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-700 uppercase text-[10px] tracking-wider text-right">Outstanding</th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-700 uppercase text-[10px] tracking-wider text-center">Stays</th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-700 uppercase text-[10px] tracking-wider"></th>
                </tr>
              </thead>
              <tbody>
                {guests.map((g) => (
                  <tr key={g.guestId} className="border-b border-neutral-100 hover:bg-neutral-50/50">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-resort-sand/50 flex items-center justify-center text-[10px] font-bold text-resort-forest">
                          {g.firstName[0]}{g.lastName[0]}
                        </div>
                        <div>
                          <button
                            onClick={() => router.push(`/admin/guests/${g.guestId}`)}
                            className="font-medium text-resort-charcoal hover:text-resort-forest hover:underline flex items-center gap-1 text-left"
                          >
                            {g.firstName} {g.lastName}
                            {g.vip && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}
                            {g.blacklisted && <AlertTriangle className="h-3 w-3 text-red-500" />}
                          </button>
                          <div className="text-neutral-500 text-[10px]">{g.phone}</div>
                          {g.city && (
                            <div className="text-neutral-400 text-[9px] flex items-center gap-0.5">
                              <MapPin className="h-2.5 w-2.5" /> {g.city}{g.country ? `, ${g.country}` : ''}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1 ml-1">
                          {g.hasPhoto && <Camera className="h-3 w-3 text-neutral-400" />}
                          {g.hasDocuments && <FileText className="h-3 w-3 text-neutral-400" />}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={g.currentStatus} />
                    </td>
                    <td className="px-4 py-2.5">
                      {g.latestStay ? (
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-semibold text-resort-forest">{g.latestStay.roomNumber}</span>
                            <StayStatusBadge status={g.latestStay.status} />
                          </div>
                          <div className="text-neutral-500 text-[10px] mt-0.5">{g.latestStay.roomTypeName}</div>
                          <div className="text-neutral-400 text-[9px]">
                            {formatDate(g.latestStay.actualCheckIn)}
                            {g.latestStay.actualCheckOut
                              ? ` - ${formatDate(g.latestStay.actualCheckOut)}`
                              : ` - Expected ${formatDate(g.latestStay.expectedCheckOut)}`
                            }
                          </div>
                        </div>
                      ) : (
                        <span className="text-neutral-400 text-[10px]">No stays yet</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {g.currentStay ? (
                        <div>
                          <div className="font-mono font-semibold text-emerald-700">{g.currentStay.roomNumber}</div>
                          <div className="text-[10px] text-neutral-500">Expected: {formatDate(g.currentStay.expectedCheckOut)}</div>
                          <div className="text-[10px] font-medium text-resort-charcoal">{formatINRAmount(g.currentStay.folioBalance)}</div>
                        </div>
                      ) : g.upcomingReservation ? (
                        <div>
                          <div className="text-blue-700 font-medium text-[10px]">{g.upcomingReservation.reservationNumber}</div>
                          <div className="text-[10px] text-neutral-500">
                            {formatDate(g.upcomingReservation.checkInDate)} - {formatDate(g.upcomingReservation.checkOutDate)}
                          </div>
                          <div className="text-[10px] text-neutral-500">{g.upcomingReservation.roomTypeName}</div>
                        </div>
                      ) : (
                        <span className="text-neutral-400 text-[10px]">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium">{formatINRAmount(g.totalBilled)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {parseFloat(g.outstandingBalance) > 0 ? (
                        <span className="text-red-600 font-medium">{formatINRAmount(g.outstandingBalance)}</span>
                      ) : (
                        <span className="text-emerald-600">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center text-neutral-600">{g.totalStays}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => router.push(`/admin/guests/${g.guestId}`)}
                          className="text-[10px] text-resort-forest hover:underline font-medium px-1.5 py-0.5 rounded hover:bg-resort-sand/30"
                        >
                          Profile
                        </button>
                        {g.currentStay && (
                          <button
                            onClick={() => router.push(`/admin/guests/${g.guestId}/stays/${g.currentStay!.stayId}`)}
                            className="text-[10px] text-resort-gold hover:underline font-medium px-1.5 py-0.5 rounded hover:bg-resort-sand/30"
                          >
                            Stay
                          </button>
                        )}
                        {g.latestStay && !g.currentStay && (
                          <button
                            onClick={() => router.push(`/admin/guests/${g.guestId}/stays/${g.latestStay!.stayId}`)}
                            className="text-[10px] text-resort-gold hover:underline font-medium px-1.5 py-0.5 rounded hover:bg-resort-sand/30"
                          >
                            Stay
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-1 mt-4">
              <button
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="p-1.5 rounded text-neutral-500 hover:bg-neutral-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: Math.min(pagination.totalPages, 7) }, (_, i) => {
                let pageNum: number;
                if (pagination.totalPages <= 7) {
                  pageNum = i + 1;
                } else if (pagination.page <= 4) {
                  pageNum = i + 1;
                } else if (pagination.page >= pagination.totalPages - 3) {
                  pageNum = pagination.totalPages - 6 + i;
                } else {
                  pageNum = pagination.page - 3 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => handlePageChange(pageNum)}
                    className={`px-2.5 py-1 rounded text-xs font-medium ${
                      pageNum === pagination.page
                        ? 'bg-resort-forest text-white'
                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="p-1.5 rounded text-neutral-500 hover:bg-neutral-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
