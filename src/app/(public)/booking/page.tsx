'use client';

import { useState, useEffect, useTransition } from 'react';
import Image from 'next/image';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import {
  CalendarDays,
  Users,
  BedDouble,
  MessageSquare,
  Check,
  Shield,
  Percent,
  Coffee,
  Sparkles,
  AlertCircle,
  Loader2,
  Lock,
  ArrowRight,
} from 'lucide-react';
import { IMAGES, RESORT } from '@/constants/images';
import { SectionHeading } from '@/components/public/SectionHeading';
import { ScrollReveal } from '@/components/public/ScrollReveal';
import { createPublicBookingAction } from '@/actions/booking/create';
import { formatCurrency } from '@/lib/utils';

// Helper to generate a client UUID for request idempotency
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c == 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  // Search & Room State
  const [checkIn, setCheckIn] = useState(searchParams.get('checkIn') || today);
  const [checkOut, setCheckOut] = useState(searchParams.get('checkOut') || tomorrow);
  const [roomTypeId, setRoomTypeId] = useState(searchParams.get('roomTypeId') || '');
  const [adults, setAdults] = useState(searchParams.get('adults') || '2');
  const [children, setChildren] = useState('0');
  const [roomsCount, setRoomsCount] = useState('1');
  const [specialRequests, setSpecialRequests] = useState('');

  // Guest Details State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');

  // Dynamic Available Room Types
  const [availableTypes, setAvailableTypes] = useState<any[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);

  // Submission / Wizard State
  const [bookingRequestId] = useState(() => generateUUID());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<any | null>(null);

  useEffect(() => {
    document.title = 'Book Your Stay — Infinity Resort';
  }, []);

  // Fetch real RoomTypes from availability
  useEffect(() => {
    async function loadAvailability() {
      setIsLoadingRooms(true);
      try {
        const res = await fetch(
          `/api/availability?checkIn=${checkIn}&checkOut=${checkOut}&guests=${Number(adults) + Number(children)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.availableRoomTypes && data.availableRoomTypes.length > 0) {
            setAvailableTypes(data.availableRoomTypes);
            if (!roomTypeId || !data.availableRoomTypes.some((r: any) => r.roomTypeId === roomTypeId)) {
              setRoomTypeId(data.availableRoomTypes[0].roomTypeId);
            }
          }
        }
      } catch (err) {
        console.error('Failed to load room availability', err);
      } finally {
        setIsLoadingRooms(false);
      }
    }
    loadAvailability();
  }, [checkIn, checkOut, adults, children]);

  const selectedRoom = availableTypes.find((r) => r.roomTypeId === roomTypeId) || availableTypes[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!roomTypeId) {
      setErrorMessage('Please select an available room category.');
      return;
    }

    startTransition(async () => {
      const result = await createPublicBookingAction({
        bookingRequestId,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        adults: Number(adults),
        children: Number(children),
        rooms: [
          {
            roomTypeId,
            roomsCount: Number(roomsCount),
          },
        ],
        guest: {
          firstName,
          lastName,
          email,
          phone,
          city: city || undefined,
        },
        specialRequests: specialRequests || undefined,
      });

      if (!result.success) {
        setErrorMessage(result.error?.message || 'Failed to complete booking. Please try again.');
        return;
      }

      if (result.data) {
        setConfirmedBooking(result.data.booking);
      }
    });
  };

  if (confirmedBooking) {
    return (
      <section className="section-padding">
        <div className="container-resort max-w-3xl mx-auto text-center">
          <ScrollReveal>
            <div className="bg-white rounded-2xl shadow-luxury-lg p-10 md:p-14">
              <div className="w-20 h-20 rounded-full bg-resort-forest/10 flex items-center justify-center mx-auto mb-6">
                <Check className="h-10 w-10 text-resort-forest" />
              </div>
              <span className="inline-block px-4 py-1 rounded-full bg-amber-50 text-amber-800 text-xs font-semibold uppercase tracking-wider mb-3">
                Hold Created (15-Min Window)
              </span>
              <h3 className="font-display text-2xl md:text-3xl font-medium text-resort-charcoal-text mb-2">
                Reservation Held!
              </h3>
              <p className="text-sm font-semibold text-resort-forest mb-4">
                Booking Reference: {confirmedBooking.reservationNumber}
              </p>
              <p className="text-resort-muted max-w-md mx-auto mb-8 text-sm leading-relaxed">
                Your room hold has been securely locked in. A confirmation has been registered for {confirmedBooking.maskedGuestName} ({confirmedBooking.maskedEmail}).
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                <div className="p-3 rounded-xl bg-resort-sand/40">
                  <p className="text-[10px] uppercase tracking-wider text-resort-muted mb-1">Check-in</p>
                  <p className="text-sm font-medium text-resort-charcoal-text">{confirmedBooking.checkInDate}</p>
                </div>
                <div className="p-3 rounded-xl bg-resort-sand/40">
                  <p className="text-[10px] uppercase tracking-wider text-resort-muted mb-1">Check-out</p>
                  <p className="text-sm font-medium text-resort-charcoal-text">{confirmedBooking.checkOutDate}</p>
                </div>
                <div className="p-3 rounded-xl bg-resort-sand/40">
                  <p className="text-[10px] uppercase tracking-wider text-resort-muted mb-1">Room Category</p>
                  <p className="text-sm font-medium text-resort-charcoal-text">
                    {confirmedBooking.rooms[0]?.roomTypeName || 'Room'}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-resort-sand/40">
                  <p className="text-[10px] uppercase tracking-wider text-resort-muted mb-1">Total Payable</p>
                  <p className="text-sm font-medium text-resort-charcoal-text">
                    {formatCurrency(confirmedBooking.totalAmount)}
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <button
                  onClick={() => router.push('/')}
                  className="w-full sm:w-auto px-8 py-3.5 bg-resort-forest text-white font-semibold rounded-full hover:bg-resort-forest-light transition-all text-sm"
                >
                  Return to Home
                </button>
              </div>
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
                Lock in your luxury getaway with real-time transactional inventory holds.
              </p>

              {errorMessage && (
                <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 text-red-800 text-sm">
                  <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600 mt-0.5" />
                  <div>
                    <p className="font-semibold">Booking Notice</p>
                    <p className="text-xs mt-0.5">{errorMessage}</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Stay Dates */}
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

                {/* Room Category Selection */}
                <div>
                  <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-resort-muted mb-2">
                    <BedDouble className="h-3.5 w-3.5 text-resort-gold" />
                    Select Room Category *
                  </label>
                  {isLoadingRooms ? (
                    <div className="p-4 rounded-xl border border-resort-sand text-xs text-resort-muted flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-resort-gold" /> Checking real-time availability...
                    </div>
                  ) : availableTypes.length > 0 ? (
                    <select
                      required
                      value={roomTypeId}
                      onChange={(e) => setRoomTypeId(e.target.value)}
                      className="w-full rounded-xl border border-resort-sand bg-resort-ivory/50 px-4 py-3 text-sm text-resort-charcoal-text focus:ring-2 focus:ring-resort-gold/30 focus:border-resort-gold focus:outline-none transition-colors"
                    >
                      {availableTypes.map((room) => (
                        <option key={room.roomTypeId} value={room.roomTypeId}>
                          {room.name} — {formatCurrency(room.basePrice)}/night ({room.availableRoomCount} available)
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-800">
                      No rooms currently available for these dates. Please modify your search dates.
                    </div>
                  )}
                </div>

                {/* Occupancy & Rooms */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                  <div>
                    <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-resort-muted mb-2">
                      <Users className="h-3.5 w-3.5 text-resort-gold" />
                      Adults *
                    </label>
                    <select
                      required
                      value={adults}
                      onChange={(e) => setAdults(e.target.value)}
                      className="w-full rounded-xl border border-resort-sand bg-resort-ivory/50 px-4 py-3 text-sm text-resort-charcoal-text focus:ring-2 focus:ring-resort-gold/30 focus:border-resort-gold focus:outline-none transition-colors"
                    >
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <option key={n} value={n}>
                          {n} {n === 1 ? 'Adult' : 'Adults'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-resort-muted mb-2">
                      <Users className="h-3.5 w-3.5 text-resort-gold" />
                      Children
                    </label>
                    <select
                      value={children}
                      onChange={(e) => setChildren(e.target.value)}
                      className="w-full rounded-xl border border-resort-sand bg-resort-ivory/50 px-4 py-3 text-sm text-resort-charcoal-text focus:ring-2 focus:ring-resort-gold/30 focus:border-resort-gold focus:outline-none transition-colors"
                    >
                      {[0, 1, 2, 3, 4].map((n) => (
                        <option key={n} value={n}>
                          {n} {n === 1 ? 'Child' : 'Children'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-resort-muted mb-2">
                      <BedDouble className="h-3.5 w-3.5 text-resort-gold" />
                      Rooms *
                    </label>
                    <select
                      required
                      value={roomsCount}
                      onChange={(e) => setRoomsCount(e.target.value)}
                      className="w-full rounded-xl border border-resort-sand bg-resort-ivory/50 px-4 py-3 text-sm text-resort-charcoal-text focus:ring-2 focus:ring-resort-gold/30 focus:border-resort-gold focus:outline-none transition-colors"
                    >
                      {[1, 2, 3, 4].map((n) => (
                        <option key={n} value={n}>
                          {n} {n === 1 ? 'Room' : 'Rooms'}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Primary Guest Details */}
                <div className="pt-4 border-t border-resort-sand/60">
                  <h4 className="text-sm font-semibold text-resort-charcoal-text mb-4">
                    Primary Guest Information
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-resort-muted mb-2">
                        First Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="John"
                        className="w-full rounded-xl border border-resort-sand bg-resort-ivory/50 px-4 py-3 text-sm text-resort-charcoal-text focus:ring-2 focus:ring-resort-gold/30 focus:border-resort-gold focus:outline-none transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-resort-muted mb-2">
                        Last Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Doe"
                        className="w-full rounded-xl border border-resort-sand bg-resort-ivory/50 px-4 py-3 text-sm text-resort-charcoal-text focus:ring-2 focus:ring-resort-gold/30 focus:border-resort-gold focus:outline-none transition-colors"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-resort-muted mb-2">
                        Email Address *
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="john.doe@example.com"
                        className="w-full rounded-xl border border-resort-sand bg-resort-ivory/50 px-4 py-3 text-sm text-resort-charcoal-text focus:ring-2 focus:ring-resort-gold/30 focus:border-resort-gold focus:outline-none transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-resort-muted mb-2">
                        Phone Number *
                      </label>
                      <input
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+91 9876543210"
                        className="w-full rounded-xl border border-resort-sand bg-resort-ivory/50 px-4 py-3 text-sm text-resort-charcoal-text focus:ring-2 focus:ring-resort-gold/30 focus:border-resort-gold focus:outline-none transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-resort-muted mb-2">
                      City of Residence
                    </label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Indore"
                      className="w-full rounded-xl border border-resort-sand bg-resort-ivory/50 px-4 py-3 text-sm text-resort-charcoal-text focus:ring-2 focus:ring-resort-gold/30 focus:border-resort-gold focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                {/* Special Requests */}
                <div>
                  <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-resort-muted mb-2">
                    <MessageSquare className="h-3.5 w-3.5 text-resort-gold" />
                    Special Requests
                  </label>
                  <textarea
                    rows={3}
                    value={specialRequests}
                    onChange={(e) => setSpecialRequests(e.target.value)}
                    placeholder="Dietary preferences, accessibility requirements, quiet floor, etc."
                    className="w-full rounded-xl border border-resort-sand bg-resort-ivory/50 px-4 py-3 text-sm text-resort-charcoal-text placeholder:text-resort-muted/50 focus:ring-2 focus:ring-resort-gold/30 focus:border-resort-gold focus:outline-none transition-colors resize-none"
                  />
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isPending || availableTypes.length === 0}
                  className="w-full sm:w-auto px-10 py-4 bg-resort-gold text-resort-charcoal-text font-semibold rounded-full hover:bg-resort-gold-light transition-all duration-300 hover:shadow-gold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Securing Inventory Hold...
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4" /> Hold Room & Proceed to Payment
                    </>
                  )}
                </button>
              </form>
            </div>
          </ScrollReveal>

          {/* ── Sidebar: Selected Room Preview & Perks ── */}
          <ScrollReveal direction="right">
            <div className="space-y-6">
              {/* Selected Room Preview */}
              {selectedRoom && (
                <div className="bg-white rounded-2xl shadow-luxury overflow-hidden">
                  <div className="relative h-48">
                    <Image
                      src={selectedRoom.media?.[0]?.fileUrl || IMAGES.rooms[0].image}
                      alt={selectedRoom.name}
                      fill
                      className="object-cover"
                      sizes="(max-width: 1024px) 100vw, 33vw"
                    />
                    <div className="absolute bottom-3 left-3">
                      <span className="inline-block px-3 py-1 rounded-full bg-resort-gold/90 text-[10px] font-semibold uppercase tracking-wider text-resort-charcoal-text">
                        Selected Suite
                      </span>
                    </div>
                  </div>
                  <div className="p-5">
                    <h4 className="font-display text-base font-medium text-resort-charcoal-text">
                      {selectedRoom.name}
                    </h4>
                    <p className="text-xs text-resort-muted mt-1 leading-relaxed">
                      {selectedRoom.description?.slice(0, 110)}...
                    </p>
                    <p className="text-lg font-display font-semibold text-resort-forest mt-3">
                      {formatCurrency(selectedRoom.basePrice)}
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

              {/* Assistance */}
              <div className="bg-resort-forest rounded-2xl p-6 text-center">
                <h4 className="font-display text-base font-medium text-resort-ivory mb-2">
                  Need Assistance?
                </h4>
                <p className="text-xs text-resort-sand/70 mb-4">
                  Our front desk is available 24/7 to assist with room selection or custom requests.
                </p>
                <a
                  href={`tel:${RESORT.phoneRaw}`}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-resort-gold text-resort-charcoal-text font-semibold rounded-full hover:bg-resort-gold-light transition-all text-xs"
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
              <p className="text-resort-muted">Loading booking engine...</p>
            </div>
          </section>
        }
      >
        <BookingForm />
      </Suspense>
    </>
  );
}
