'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { CalendarDays, Users, BedDouble, MessageSquare, Check, Shield, Percent, Coffee, Sparkles } from 'lucide-react';
import { IMAGES, RESORT } from '@/constants/images';
import { SectionHeading } from '@/components/public/SectionHeading';
import { ScrollReveal } from '@/components/public/ScrollReveal';
import { cn } from '@/lib/utils';

const ROOM_TYPES = IMAGES.rooms.map((room) => ({
  id: room.id,
  name: room.name,
  price: room.price,
  size: room.size,
  bed: room.bed,
  view: room.view,
}));

const BOOKING_PERKS = [
  {
    icon: Shield,
    title: 'Best Rate Guarantee',
    description: 'Book directly and always get the lowest available rate.',
  },
  {
    icon: Percent,
    title: 'Free Cancellation',
    description: 'Cancel up to 48 hours before check-in with no charge.',
  },
  {
    icon: Coffee,
    title: 'Complimentary Breakfast',
    description: 'Enjoy a curated breakfast spread every morning.',
  },
  {
    icon: Sparkles,
    title: 'Welcome Amenity',
    description: 'A special welcome gift waiting in your room upon arrival.',
  },
];

function BookingForm() {
  const searchParams = useSearchParams();
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const [checkIn, setCheckIn] = useState(searchParams.get('checkIn') || today);
  const [checkOut, setCheckOut] = useState(searchParams.get('checkOut') || tomorrow);
  const [roomType, setRoomType] = useState(ROOM_TYPES[0]?.id.toString() || '');
  const [guests, setGuests] = useState('2');
  const [rooms, setRooms] = useState('1');
  const [specialRequests, setSpecialRequests] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    document.title = 'Book Your Stay — Infinity Resort';
  }, []);

  useEffect(() => {
    const ci = searchParams.get('checkIn');
    const co = searchParams.get('checkOut');
    if (ci) setCheckIn(ci);
    if (co) setCheckOut(co);
  }, [searchParams]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  const selectedRoom = ROOM_TYPES.find((r) => r.id.toString() === roomType);

  if (submitted) {
    return (
      <section className="section-padding">
        <div className="container-resort max-w-3xl mx-auto text-center">
          <ScrollReveal>
            <div className="bg-white rounded-2xl shadow-luxury-lg p-10 md:p-14">
              <div className="w-20 h-20 rounded-full bg-resort-forest/10 flex items-center justify-center mx-auto mb-6">
                <Check className="h-10 w-10 text-resort-forest" />
              </div>
              <h3 className="font-display text-2xl md:text-3xl font-medium text-resort-charcoal-text mb-3">
                Booking Confirmed!
              </h3>
              <p className="text-resort-muted max-w-md mx-auto mb-8">
                Thank you for choosing Infinity Resort. A confirmation email has been sent to your address. Our reservations team will reach out shortly with further details.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                <div className="p-3 rounded-xl bg-resort-sand/40">
                  <p className="text-[10px] uppercase tracking-wider text-resort-muted mb-1">Check-in</p>
                  <p className="text-sm font-medium text-resort-charcoal-text">{checkIn}</p>
                </div>
                <div className="p-3 rounded-xl bg-resort-sand/40">
                  <p className="text-[10px] uppercase tracking-wider text-resort-muted mb-1">Check-out</p>
                  <p className="text-sm font-medium text-resort-charcoal-text">{checkOut}</p>
                </div>
                <div className="p-3 rounded-xl bg-resort-sand/40">
                  <p className="text-[10px] uppercase tracking-wider text-resort-muted mb-1">Room</p>
                  <p className="text-sm font-medium text-resort-charcoal-text">{selectedRoom?.name || 'N/A'}</p>
                </div>
                <div className="p-3 rounded-xl bg-resort-sand/40">
                  <p className="text-[10px] uppercase tracking-wider text-resort-muted mb-1">Guests</p>
                  <p className="text-sm font-medium text-resort-charcoal-text">{guests}</p>
                </div>
              </div>
              <button
                onClick={() => setSubmitted(false)}
                className="px-8 py-3 bg-resort-forest text-white font-semibold rounded-full hover:bg-resort-forest-light transition-all duration-300 text-sm"
              >
                Make Another Booking
              </button>
            </div>
          </ScrollReveal>
        </div>
      </section>
    );
  }

  return (
    <section className="section-padding">
      <div className="container-resort">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 lg:gap-14">
          {/* ── Main Form ── */}
          <ScrollReveal direction="left" className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-luxury p-8 md:p-10">
              <h3 className="font-display text-2xl font-medium text-resort-charcoal-text mb-1">
                Reservation Details
              </h3>
              <p className="text-sm text-resort-muted mb-8">
                Fill in your details below to check availability and reserve your stay.
              </p>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Dates */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-resort-muted mb-2">
                      <CalendarDays className="h-3.5 w-3.5 text-resort-gold" />
                      Check-in Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={checkIn}
                      onChange={(e) => setCheckIn(e.target.value)}
                      min={today}
                      className="w-full rounded-xl border border-resort-sand bg-resort-ivory/50 px-4 py-3 text-sm text-resort-charcoal-text focus:ring-2 focus:ring-resort-gold/30 focus:border-resort-gold focus:outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-resort-muted mb-2">
                      <CalendarDays className="h-3.5 w-3.5 text-resort-gold" />
                      Check-out Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={checkOut}
                      onChange={(e) => setCheckOut(e.target.value)}
                      min={checkIn}
                      className="w-full rounded-xl border border-resort-sand bg-resort-ivory/50 px-4 py-3 text-sm text-resort-charcoal-text focus:ring-2 focus:ring-resort-gold/30 focus:border-resort-gold focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                {/* Room Type */}
                <div>
                  <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-resort-muted mb-2">
                    <BedDouble className="h-3.5 w-3.5 text-resort-gold" />
                    Room Type *
                  </label>
                  <select
                    required
                    value={roomType}
                    onChange={(e) => setRoomType(e.target.value)}
                    className="w-full rounded-xl border border-resort-sand bg-resort-ivory/50 px-4 py-3 text-sm text-resort-charcoal-text focus:ring-2 focus:ring-resort-gold/30 focus:border-resort-gold focus:outline-none transition-colors appearance-none"
                  >
                    {ROOM_TYPES.map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.name} — ₹{room.price.toLocaleString('en-IN')}/night ({room.size}, {room.bed})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Guests & Rooms */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-resort-muted mb-2">
                      <Users className="h-3.5 w-3.5 text-resort-gold" />
                      Number of Guests *
                    </label>
                    <select
                      required
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
                  <div>
                    <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-resort-muted mb-2">
                      <BedDouble className="h-3.5 w-3.5 text-resort-gold" />
                      Number of Rooms *
                    </label>
                    <select
                      required
                      value={rooms}
                      onChange={(e) => setRooms(e.target.value)}
                      className="w-full rounded-xl border border-resort-sand bg-resort-ivory/50 px-4 py-3 text-sm text-resort-charcoal-text focus:ring-2 focus:ring-resort-gold/30 focus:border-resort-gold focus:outline-none transition-colors appearance-none"
                    >
                      {[1, 2, 3, 4].map((n) => (
                        <option key={n} value={n}>
                          {n} {n === 1 ? 'Room' : 'Rooms'}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Special Requests */}
                <div>
                  <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-resort-muted mb-2">
                    <MessageSquare className="h-3.5 w-3.5 text-resort-gold" />
                    Special Requests
                  </label>
                  <textarea
                    rows={4}
                    value={specialRequests}
                    onChange={(e) => setSpecialRequests(e.target.value)}
                    placeholder="Any dietary requirements, accessibility needs, or celebration arrangements..."
                    className="w-full rounded-xl border border-resort-sand bg-resort-ivory/50 px-4 py-3 text-sm text-resort-charcoal-text placeholder:text-resort-muted/50 focus:ring-2 focus:ring-resort-gold/30 focus:border-resort-gold focus:outline-none transition-colors resize-none"
                  />
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  className="w-full sm:w-auto px-10 py-4 bg-resort-gold text-resort-charcoal-text font-semibold rounded-full hover:bg-resort-gold-light transition-all duration-300 hover:shadow-gold text-sm"
                >
                  Check Availability & Book
                </button>
              </form>
            </div>
          </ScrollReveal>

          {/* ── Sidebar: Perks ── */}
          <ScrollReveal direction="right">
            <div className="space-y-6">
              {/* Selected Room Preview */}
              {selectedRoom && (
                <div className="bg-white rounded-2xl shadow-luxury overflow-hidden">
                  <div className="relative h-48">
                    <Image
                      src={IMAGES.rooms.find((r) => r.id === selectedRoom.id)?.image || IMAGES.rooms[0].image}
                      alt={selectedRoom.name}
                      fill
                      className="object-cover"
                      sizes="(max-width: 1024px) 100vw, 33vw"
                    />
                    <div className="absolute bottom-3 left-3">
                      <span className="inline-block px-3 py-1 rounded-full bg-resort-gold/90 text-[10px] font-semibold uppercase tracking-wider text-resort-charcoal-text">
                        Selected
                      </span>
                    </div>
                  </div>
                  <div className="p-5">
                    <h4 className="font-display text-base font-medium text-resort-charcoal-text">
                      {selectedRoom.name}
                    </h4>
                    <p className="text-xs text-resort-muted mt-1">
                      {selectedRoom.size} · {selectedRoom.bed} · {selectedRoom.view}
                    </p>
                    <p className="text-lg font-display font-semibold text-resort-forest mt-3">
                      ₹{selectedRoom.price.toLocaleString('en-IN')}
                      <span className="text-xs font-body font-normal text-resort-muted ml-1">/ night</span>
                    </p>
                  </div>
                </div>
              )}

              {/* Booking Perks */}
              <div className="bg-white rounded-2xl shadow-luxury p-6">
                <h4 className="font-display text-base font-medium text-resort-charcoal-text mb-5">
                  Book Direct & Save
                </h4>
                <div className="space-y-4">
                  {BOOKING_PERKS.map((perk) => (
                    <div key={perk.title} className="flex gap-3">
                      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-resort-forest/10 flex items-center justify-center">
                        <perk.icon className="h-4 w-4 text-resort-forest" />
                      </div>
                      <div>
                        <h5 className="text-sm font-semibold text-resort-charcoal-text">
                          {perk.title}
                        </h5>
                        <p className="text-xs text-resort-muted mt-0.5 leading-relaxed">
                          {perk.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Need Help */}
              <div className="bg-resort-forest rounded-2xl p-6 text-center">
                <h4 className="font-display text-base font-medium text-resort-ivory mb-2">
                  Need Assistance?
                </h4>
                <p className="text-xs text-resort-sand/70 mb-4">
                  Our reservations team is available 24/7 to help you plan the perfect stay.
                </p>
                <a
                  href={`tel:${RESORT.phoneRaw}`}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-resort-gold text-resort-charcoal-text font-semibold rounded-full hover:bg-resort-gold-light transition-all duration-300 text-xs"
                >
                  {RESORT.phone}
                </a>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}

export default function BookingPage() {
  return (
    <>
      {/* ─── HERO ─── */}
      <section className="relative h-[60vh] min-h-[400px] flex items-center justify-center overflow-hidden">
        <Image
          src={IMAGES.hero.main}
          alt="Book your stay at Infinity Resort"
          fill
          className="object-cover"
          priority
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-resort-charcoal/70" />
        <div className="container-resort relative z-10 text-center">
          <ScrollReveal>
            <SectionHeading
              label="Reservations"
              title="Book Your Stay"
              description="Reserve Your Escape"
              light
            />
          </ScrollReveal>
        </div>
      </section>

      <Suspense
        fallback={
          <section className="section-padding">
            <div className="container-resort text-center py-20">
              <p className="text-resort-muted">Loading booking form...</p>
            </div>
          </section>
        }
      >
        <BookingForm />
      </Suspense>
    </>
  );
}
