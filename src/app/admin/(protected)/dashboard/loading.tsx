import { Card, CardContent, CardHeader } from '@/components/ui/card';

export default function DashboardLoading() {
  return (
    <div className="space-y-8 animate-pulse" aria-busy="true" aria-live="polite">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200 pb-5">
        <div>
          <div className="h-8 w-72 bg-neutral-200 rounded" />
          <div className="h-4 w-96 bg-neutral-100 rounded mt-2" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-40 bg-neutral-200 rounded" />
          <div className="h-9 w-24 bg-neutral-100 rounded" />
        </div>
      </div>

      {/* 6 Executive KPI Cards Skeleton */}
      <div className="space-y-3">
        <div className="h-4 w-48 bg-neutral-200 rounded" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="border-neutral-200">
              <CardHeader className="p-4 pb-1">
                <div className="h-3 w-24 bg-neutral-200 rounded" />
                <div className="h-7 w-28 bg-neutral-200 rounded mt-2" />
              </CardHeader>
              <CardContent className="p-4 pt-1">
                <div className="h-3 w-20 bg-neutral-100 rounded mt-1" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Revenue Performance Graph Skeleton */}
      <Card className="border-neutral-200">
        <CardHeader className="p-5 border-b border-neutral-100">
          <div className="h-5 w-60 bg-neutral-200 rounded" />
          <div className="h-3 w-80 bg-neutral-100 rounded mt-1.5" />
        </CardHeader>
        <CardContent className="p-5">
          <div className="h-56 w-full bg-neutral-100 rounded" />
        </CardContent>
      </Card>

      {/* Bookings & Commercial Performance Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="border-neutral-200 lg:col-span-1">
          <CardHeader className="p-4 border-b border-neutral-100">
            <div className="h-4 w-40 bg-neutral-200 rounded" />
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-6 w-full bg-neutral-100 rounded" />
            ))}
          </CardContent>
        </Card>
        <Card className="border-neutral-200 lg:col-span-2">
          <CardHeader className="p-4 border-b border-neutral-100">
            <div className="h-4 w-52 bg-neutral-200 rounded" />
          </CardHeader>
          <CardContent className="p-4">
            <div className="h-36 w-full bg-neutral-100 rounded" />
          </CardContent>
        </Card>
      </div>

      {/* Restaurant Performance & Top Dishes Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-neutral-200">
          <CardHeader className="p-4 border-b border-neutral-100">
            <div className="h-4 w-48 bg-neutral-200 rounded" />
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="h-14 bg-neutral-100 rounded" />
              <div className="h-14 bg-neutral-100 rounded" />
              <div className="h-14 bg-neutral-100 rounded" />
            </div>
            <div className="h-20 bg-neutral-100 rounded" />
          </CardContent>
        </Card>
        <Card className="border-neutral-200">
          <CardHeader className="p-4 border-b border-neutral-100">
            <div className="h-4 w-44 bg-neutral-200 rounded" />
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-8 bg-neutral-100 rounded" />
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Compact Operational Attention Alerts Skeleton */}
      <div className="space-y-3">
        <div className="h-4 w-44 bg-neutral-200 rounded" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="p-3 bg-neutral-100 rounded-lg border border-neutral-200">
              <div className="h-3 w-16 bg-neutral-200 rounded" />
              <div className="h-6 w-10 bg-neutral-200 rounded mt-2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
