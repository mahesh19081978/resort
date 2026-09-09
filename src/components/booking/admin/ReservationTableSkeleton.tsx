import React from 'react';

export function ReservationTableSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200 pb-4">
        <div>
          <div className="h-7 w-64 bg-neutral-200 rounded-md" />
          <div className="h-4 w-96 bg-neutral-100 rounded-md mt-2" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-36 bg-neutral-200 rounded-md" />
          <div className="h-9 w-24 bg-neutral-100 rounded-md" />
        </div>
      </div>

      {/* KPI Cards Skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-24 bg-white rounded-xl border border-neutral-200 p-4 space-y-2">
            <div className="h-3 w-20 bg-neutral-200 rounded" />
            <div className="h-7 w-12 bg-neutral-300 rounded" />
          </div>
        ))}
      </div>

      {/* Filter Bar Skeleton */}
      <div className="h-16 bg-white rounded-xl border border-neutral-200 p-4" />

      {/* Table Skeleton */}
      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-sm">
        <div className="h-10 bg-neutral-50 border-b border-neutral-200" />
        <div className="divide-y divide-neutral-100">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-14 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-4 w-32 bg-neutral-200 rounded" />
                <div className="h-4 w-28 bg-neutral-100 rounded" />
              </div>
              <div className="flex items-center gap-4">
                <div className="h-5 w-20 bg-neutral-100 rounded-full" />
                <div className="h-4 w-16 bg-neutral-200 rounded" />
                <div className="h-7 w-16 bg-neutral-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
