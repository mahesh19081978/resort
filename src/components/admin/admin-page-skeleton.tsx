export function AdminPageSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-live="polite">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-48 rounded bg-resort-sand/60" />
          <div className="h-4 w-72 rounded bg-resort-sand/40" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-24 rounded bg-resort-sand/40" />
          <div className="h-8 w-28 rounded bg-resort-sand/40" />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-resort-sand bg-white p-3 text-center">
            <div className="h-3 w-16 mx-auto rounded bg-resort-sand/40" />
            <div className="h-7 w-10 mx-auto mt-2 rounded bg-resort-sand/60" />
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-resort-sand bg-white">
        <div className="p-4 border-b border-resort-sand">
          <div className="h-5 w-40 rounded bg-resort-sand/40" />
        </div>
        <div className="p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="h-4 w-20 rounded bg-resort-sand/40" />
              <div className="h-4 w-32 rounded bg-resort-sand/30" />
              <div className="h-4 w-24 rounded bg-resort-sand/30" />
              <div className="h-4 w-16 rounded bg-resort-sand/20" />
              <div className="flex-1" />
              <div className="h-7 w-20 rounded bg-resort-sand/30" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
