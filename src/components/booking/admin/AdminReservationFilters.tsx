'use client';

import React, { useState, useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Search,
  RotateCw,
  Filter,
  X,
  Calendar,
  Layers,
  CreditCard,
  Tag,
  Loader2,
} from 'lucide-react';

interface RoomTypeOption {
  id: string;
  name: string;
  code: string;
}

interface AdminReservationFiltersProps {
  roomTypes: RoomTypeOption[];
}

export function AdminReservationFilters({ roomTypes }: AdminReservationFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentTab = searchParams.get('tab') || 'all';
  const currentSearch = searchParams.get('search') || '';
  const currentStatus = searchParams.get('status') || 'ALL';
  const currentPaymentStatus = searchParams.get('paymentStatus') || 'ALL';
  const currentRoomTypeId = searchParams.get('roomTypeId') || 'ALL';
  const currentSource = searchParams.get('source') || 'ALL';
  const currentDateType = searchParams.get('dateType') || 'checkInDate';
  const currentStartDate = searchParams.get('startDate') || '';
  const currentEndDate = searchParams.get('endDate') || '';
  const currentLimit = searchParams.get('limit') || '25';

  const [searchValue, setSearchValue] = useState(currentSearch);
  const [showAdvanced, setShowAdvanced] = useState(
    currentRoomTypeId !== 'ALL' ||
      currentSource !== 'ALL' ||
      currentStartDate !== '' ||
      currentEndDate !== '' ||
      currentPaymentStatus !== 'ALL'
  );

  const applyParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', '1'); // reset page on any filter change

    Object.entries(updates).forEach(([key, val]) => {
      if (val === null || val === '' || val === 'ALL') {
        params.delete(key);
      } else {
        params.set(key, val);
      }
    });

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    applyParams({ search: searchValue.trim() || null });
  };

  const handleClearFilters = () => {
    setSearchValue('');
    startTransition(() => {
      router.push(pathname);
    });
  };

  const handleRefresh = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  const tabs = [
    { id: 'all', label: 'All Reservations' },
    { id: 'today', label: "Today's Arrivals" },
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'confirmed', label: 'Confirmed' },
    { id: 'pending', label: 'Pending' },
    { id: 'cancelled', label: 'Cancelled' },
  ];

  const hasActiveFilters =
    currentSearch !== '' ||
    currentStatus !== 'ALL' ||
    currentPaymentStatus !== 'ALL' ||
    currentRoomTypeId !== 'ALL' ||
    currentSource !== 'ALL' ||
    currentStartDate !== '' ||
    currentEndDate !== '' ||
    currentTab !== 'all';

  return (
    <div className="space-y-4 bg-white rounded-xl border border-neutral-200/80 p-4 shadow-sm">
      {/* Quick Filter Tabs & Refresh */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-neutral-100 pb-3">
        <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
          {tabs.map((tab) => {
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => applyParams({ tab: tab.id, status: null })}
                disabled={isPending}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-resort-forest text-white shadow-sm font-semibold'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {hasActiveFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClearFilters}
              disabled={isPending}
              className="text-xs h-8 text-neutral-500 hover:text-neutral-800"
            >
              <X className="w-3.5 h-3.5 mr-1" /> Clear Filters
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isPending}
            className="text-xs h-8 text-neutral-700 border-neutral-200 hover:bg-neutral-50"
          >
            <RotateCw className={`w-3.5 h-3.5 mr-1.5 ${isPending ? 'animate-spin text-resort-forest' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Main Search and Quick Controls */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
        <form onSubmit={handleSearchSubmit} className="md:col-span-6 relative">
          <Input
            type="text"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="Search reservation number, guest name, phone, email..."
            className="text-xs pl-9 pr-20 h-9 bg-neutral-50/70 border-neutral-200 focus:bg-white"
          />
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
          <Button
            type="submit"
            size="sm"
            disabled={isPending}
            className="absolute right-1 top-1 h-7 text-[11px] px-2.5 bg-resort-forest hover:bg-resort-forest-deep text-white"
          >
            Search
          </Button>
        </form>

        <div className="md:col-span-6 flex flex-wrap items-center gap-2 justify-end">
          {/* Status filter */}
          <select
            value={currentStatus}
            onChange={(e) => applyParams({ status: e.target.value, tab: null })}
            disabled={isPending}
            className="text-xs h-9 px-2.5 rounded-lg border border-neutral-200 bg-neutral-50/70 hover:bg-white text-neutral-700 focus:outline-none focus:ring-1 focus:ring-resort-forest"
          >
            <option value="ALL">All Statuses</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="PENDING">Pending</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="EXPIRED">Expired</option>
            <option value="COMPLETED">Completed</option>
            <option value="NO_SHOW">No Show</option>
          </select>

          {/* Payment Status filter */}
          <select
            value={currentPaymentStatus}
            onChange={(e) => applyParams({ paymentStatus: e.target.value })}
            disabled={isPending}
            className="text-xs h-9 px-2.5 rounded-lg border border-neutral-200 bg-neutral-50/70 hover:bg-white text-neutral-700 focus:outline-none focus:ring-1 focus:ring-resort-forest"
          >
            <option value="ALL">All Payments</option>
            <option value="PAID">Paid</option>
            <option value="PARTIALLY_PAID">Partially Paid</option>
            <option value="UNPAID">Unpaid</option>
            <option value="REFUND_PENDING">Refund Pending</option>
            <option value="REFUNDED">Refunded</option>
          </select>

          {/* Advanced toggle */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`text-xs h-9 px-3 border-neutral-200 ${
              showAdvanced ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-600'
            }`}
          >
            <Filter className="w-3.5 h-3.5 mr-1.5" />
            Filters
          </Button>
        </div>
      </div>

      {/* Advanced Filter Drawer / Row */}
      {showAdvanced && (
        <div className="pt-3 border-t border-neutral-100 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {/* Room Type */}
          <div>
            <label className="block text-[11px] font-medium text-neutral-500 mb-1 flex items-center gap-1">
              <Layers className="w-3 h-3 text-neutral-400" /> Room Category
            </label>
            <select
              value={currentRoomTypeId}
              onChange={(e) => applyParams({ roomTypeId: e.target.value })}
              disabled={isPending}
              className="w-full text-xs h-8 px-2 rounded-lg border border-neutral-200 bg-neutral-50/50 text-neutral-700"
            >
              <option value="ALL">All Room Types</option>
              {roomTypes.map((rt) => (
                <option key={rt.id} value={rt.id}>
                  {rt.name} ({rt.code})
                </option>
              ))}
            </select>
          </div>

          {/* Booking Source */}
          <div>
            <label className="block text-[11px] font-medium text-neutral-500 mb-1 flex items-center gap-1">
              <Tag className="w-3 h-3 text-neutral-400" /> Booking Source
            </label>
            <select
              value={currentSource}
              onChange={(e) => applyParams({ source: e.target.value })}
              disabled={isPending}
              className="w-full text-xs h-8 px-2 rounded-lg border border-neutral-200 bg-neutral-50/50 text-neutral-700"
            >
              <option value="ALL">All Sources</option>
              <option value="DIRECT_WEBSITE">Direct Website</option>
              <option value="FRONT_DESK_WALKIN">Front Desk Walk-in</option>
              <option value="PHONE_CALL">Phone Reservation</option>
              <option value="OTA_BOOKING_COM">Booking.com</option>
              <option value="OTA_AGODA">Agoda</option>
              <option value="OTA_AIRBNB">Airbnb</option>
              <option value="TRAVEL_AGENT">Travel Agent</option>
              <option value="CORPORATE">Corporate</option>
            </select>
          </div>

          {/* Date Type and Start Date */}
          <div>
            <label className="block text-[11px] font-medium text-neutral-500 mb-1 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-neutral-400" /> From Date
            </label>
            <input
              type="date"
              value={currentStartDate}
              onChange={(e) => applyParams({ startDate: e.target.value || null })}
              disabled={isPending}
              className="w-full text-xs h-8 px-2 rounded-lg border border-neutral-200 bg-neutral-50/50 text-neutral-700"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-[11px] font-medium text-neutral-500 mb-1 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-neutral-400" /> To Date
            </label>
            <input
              type="date"
              value={currentEndDate}
              onChange={(e) => applyParams({ endDate: e.target.value || null })}
              disabled={isPending}
              className="w-full text-xs h-8 px-2 rounded-lg border border-neutral-200 bg-neutral-50/50 text-neutral-700"
            />
          </div>
        </div>
      )}

      {isPending && (
        <div className="flex items-center gap-2 text-xs text-resort-forest font-medium pt-1 animate-pulse">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Updating reservations...</span>
        </div>
      )}
    </div>
  );
}
