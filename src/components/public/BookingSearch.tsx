'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CalendarDays, Users, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BookingSearchProps {
  variant?: 'floating' | 'inline' | 'compact';
  className?: string;
}

export function BookingSearch({ variant = 'floating', className }: BookingSearchProps) {
  const router = useRouter();
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const [checkIn, setCheckIn] = useState(today);
  const [checkOut, setCheckOut] = useState(tomorrow);
  const [guests, setGuests] = useState('2');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams({ checkIn, checkOut, guests });
    router.push(`/rooms/availability?${params.toString()}`);
  };

  if (variant === 'compact') {
    return (
      <form onSubmit={handleSearch} className={cn('flex items-center gap-2', className)}>
        <input
          type="date"
          value={checkIn}
          onChange={(e) => setCheckIn(e.target.value)}
          min={today}
          className="rounded-full border border-white/20 bg-white/10 backdrop-blur-sm px-4 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:ring-1 focus:ring-resort-gold"
        />
        <input
          type="date"
          value={checkOut}
          onChange={(e) => setCheckOut(e.target.value)}
          min={checkIn}
          className="rounded-full border border-white/20 bg-white/10 backdrop-blur-sm px-4 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:ring-1 focus:ring-resort-gold"
        />
        <button
          type="submit"
          className="rounded-full bg-resort-gold px-5 py-2 text-sm font-semibold text-resort-charcoal-text hover:bg-resort-gold-light transition-colors"
        >
          Search
        </button>
      </form>
    );
  }

  return (
    <div
      className={cn(
        'bg-white/95 backdrop-blur-md rounded-2xl shadow-luxury-lg border border-resort-sand/30 p-6 md:p-8',
        variant === 'floating' && '-mt-16 relative z-20 mx-6 md:mx-auto',
        className
      )}
    >
      <div className="text-center mb-6">
        <h3 className="font-display text-xl md:text-2xl font-medium text-resort-charcoal-text">
          Check Availability
        </h3>
      </div>
      <form onSubmit={handleSearch}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-resort-muted mb-2">
              <CalendarDays className="h-3.5 w-3.5 text-resort-gold" />
              Check-in
            </label>
            <input
              type="date"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
              min={today}
              className="w-full rounded-xl border border-resort-sand bg-resort-ivory/50 px-4 py-3 text-sm text-resort-charcoal-text focus:ring-2 focus:ring-resort-gold/30 focus:border-resort-gold focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-resort-muted mb-2">
              <CalendarDays className="h-3.5 w-3.5 text-resort-gold" />
              Check-out
            </label>
            <input
              type="date"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
              min={checkIn}
              className="w-full rounded-xl border border-resort-sand bg-resort-ivory/50 px-4 py-3 text-sm text-resort-charcoal-text focus:ring-2 focus:ring-resort-gold/30 focus:border-resort-gold focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-resort-muted mb-2">
              <Users className="h-3.5 w-3.5 text-resort-gold" />
              Guests
            </label>
            <select
              value={guests}
              onChange={(e) => setGuests(e.target.value)}
              className="w-full rounded-xl border border-resort-sand bg-resort-ivory/50 px-4 py-3 text-sm text-resort-charcoal-text focus:ring-2 focus:ring-resort-gold/30 focus:border-resort-gold focus:outline-none transition-colors appearance-none"
            >
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'Guest' : 'Guests'}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-resort-forest px-6 py-3.5 text-sm font-semibold text-white hover:bg-resort-forest-light transition-all duration-300 hover:shadow-lg"
          >
            <Search className="h-4 w-4" />
            Search Availability
          </button>
        </div>
      </form>
    </div>
  );
}
