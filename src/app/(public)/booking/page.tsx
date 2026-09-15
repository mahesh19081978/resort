'use client';

import { useState, useEffect, useTransition, useRef } from 'react';
import Image from 'next/image';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { calculatePublicPricingAction, PublicPricingSummary } from '@/actions/booking/pricing';
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
  CreditCard,
  Building,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { IMAGES, RESORT } from '@/constants/images';
import { SectionHeading } from '@/components/public/SectionHeading';
import { ScrollReveal } from '@/components/public/ScrollReveal';
import { createPublicBookingAction } from '@/actions/booking/create';
import { getBookingStatusAction } from '@/actions/booking/status';
import { formatCurrency } from '@/lib/utils';
import { SanitizedPublicBooking } from '@/lib/booking/reservation-service';
import { PaymentMethodSelector } from '@/components/booking/payment/PaymentMethodSelector';
import { PaymentChannelTabs, OnlineSubMethod } from '@/components/booking/payment/PaymentChannelTabs';
import { CardPaymentForm } from '@/components/booking/payment/CardPaymentForm';
import { UpiPaymentPanel } from '@/components/booking/payment/UpiPaymentPanel';
import { NetBankingPanel } from '@/components/booking/payment/NetBankingPanel';
import { PaymentSummaryBreakdown } from '@/components/booking/payment/PaymentSummaryBreakdown';
import { PaymentSecurityTrust } from '@/components/booking/payment/PaymentSecurityTrust';

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

  const [today] = useState(() => new Date().toISOString().split('T')[0]);
  const [tomorrow] = useState(() => new Date(Date.now() + 86400000).toISOString().split('T')[0]);

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

  // Payment Method Selection
  const [paymentMethod, setPaymentMethod] = useState<'PAY_ONLINE' | 'PAY_AT_HOTEL'>('PAY_ONLINE');
  const [onlineSubMethod, setOnlineSubMethod] = useState<'CARD' | 'UPI' | 'NET_BANKING'>('CARD');

  // Dynamic Available Room Types
  const [availableTypes, setAvailableTypes] = useState<any[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);

  // Policy State
  const [allowPayAtHotel, setAllowPayAtHotel] = useState(true);

  // Submission / Flow State
  const [bookingRequestId] = useState(() => generateUUID());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Authoritative Server Pricing Preview State
  const [serverPricing, setServerPricing] = useState<PublicPricingSummary | null>(null);
  const [isPricingLoading, setIsPricingLoading] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const latestPricingRequestId = useRef(0);

  // Hold State vs Confirmed State
  const [activeHold, setActiveHold] = useState<SanitizedPublicBooking | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<SanitizedPublicBooking | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const confirmedIdFromUrl = searchParams.get('confirmedId');

  useEffect(() => {
    document.title = 'Book Your Stay — Infinity Resort';
    const isPayAtHotelDisabled =
      process.env.NEXT_PUBLIC_ALLOW_PAY_AT_HOTEL === 'false' ||
      process.env.NEXT_PUBLIC_MANDATORY_ADVANCE === 'true';
    setAllowPayAtHotel(!isPayAtHotelDisabled);
  }, []);

  // Check URL params for confirmed return from payment gateway using signed token
  const tokenFromUrl = searchParams.get('token');

  useEffect(() => {
    if (tokenFromUrl) {
      getBookingStatusAction(tokenFromUrl).then((res) => {
        if (res.success && res.data) {
          setConfirmedBooking(res.data);
          setActiveHold(null);
        }
      });
    }
  }, [tokenFromUrl]);

  // Hold Timer countdown
  useEffect(() => {
    if (!activeHold || !activeHold.expiresAt) {
      setSecondsRemaining(null);
      return;
    }

    const expiryTime = new Date(activeHold.expiresAt).getTime();

    const interval = setInterval(() => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((expiryTime - now) / 1000));
      setSecondsRemaining(diff);

      if (diff <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeHold]);

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

  const nightsCount = Math.max(
    1,
    Math.round(
      (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60 * 24)
    ) || 1
  );

  // Authoritative Pricing Preview Query with strict request sequencing to prevent stale overwrites
  useEffect(() => {
    if (!roomTypeId || !checkIn || !checkOut || checkIn >= checkOut) {
      setServerPricing(null);
      setIsPricingLoading(false);
      return;
    }

    const currentRequestId = ++latestPricingRequestId.current;
    setIsPricingLoading(true);
    setPricingError(null);

    calculatePublicPricingAction({
      checkInDate: checkIn,
      checkOutDate: checkOut,
      rooms: [
        {
          roomTypeId,
          roomsCount: Number(roomsCount) || 1,
        },
      ],
    })
      .then((res) => {
        // Discard if a subsequent request has been fired
        if (latestPricingRequestId.current !== currentRequestId) return;

        if (res.success && res.data) {
          setServerPricing(res.data);
          setPricingError(null);
        } else {
          setServerPricing(null);
          setPricingError(res.error?.message || 'Unable to calculate authoritative pricing.');
        }
      })
      .catch((err) => {
        if (latestPricingRequestId.current !== currentRequestId) return;
        setServerPricing(null);
        setPricingError(err?.message || 'Pricing calculation failed.');
      })
      .finally(() => {
        if (latestPricingRequestId.current === currentRequestId) {
          setIsPricingLoading(false);
        }
      });
  }, [checkIn, checkOut, roomTypeId, roomsCount]);

  const formattedTotalPayable = serverPricing
    ? formatCurrency(serverPricing.requiredAdvanceAmount)
    : isPricingLoading
    ? 'Calculating...'
    : '—';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!roomTypeId) {
      setErrorMessage('Please select an available room category.');
      return;
    }

    if (isPricingLoading || !serverPricing) {
      setErrorMessage('Please wait for pricing calculation to complete before submitting.');
      return;
    }

    if (pricingError) {
      setErrorMessage(`Pricing error: ${pricingError}`);
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
        paymentMethod,
        onlineSubMethod: paymentMethod === 'PAY_ONLINE' ? onlineSubMethod : undefined,
        specialRequests: specialRequests || undefined,
      });

      if (!result.success) {
        let msg = result.error?.message || 'Failed to complete booking. Please try again.';
        if (result.error?.details && typeof result.error.details === 'object') {
          const fieldMsgs = Object.entries(result.error.details)
            .flatMap(([field, errors]: [string, any]) =>
              Array.isArray(errors) ? errors.map((e: string) => `${field}: ${e}`) : []
            )
            .filter(Boolean);
          if (fieldMsgs.length > 0) {
            msg = `${msg} (${fieldMsgs.join('; ')})`;
          }
        }
        setErrorMessage(msg);
        return;
      }

      if (result.data) {
        if (result.data.booking.status === 'CONFIRMED') {
          setConfirmedBooking(result.data.booking);
          setActiveHold(null);
        } else if (result.data.checkoutUrl) {
          setIsRedirecting(true);
          router.push(result.data.checkoutUrl);
        } else {
          setActiveHold(result.data.booking);
          setCheckoutUrl(result.data.checkoutUrl || null);
        }
      }
    });
  };

  // ──────────────────────────────────────────────────────────
  // SCREEN 1: CONFIRMED BOOKING (Online Success or Pay at Hotel)
  // ──────────────────────────────────────────────────────────
  if (confirmedBooking) {
    const isPayAtHotelBooking = confirmedBooking.advancePaidAmount === 0 && confirmedBooking.totalAmount > 0;
    const balanceDue = confirmedBooking.totalAmount - confirmedBooking.advancePaidAmount;

    return (
      <section className="section-padding">
        <div className="container-resort max-w-3xl mx-auto text-center">
          <ScrollReveal>
            <div className="bg-white rounded-2xl shadow-luxury-lg p-8 md:p-12 border border-resort-sand/60">
              <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6 text-emerald-600">
                <CheckCircle2 className="h-10 w-10" />
              </div>
              <span className="inline-block px-4 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-semibold uppercase tracking-wider mb-3">
                Confirmed Reservation
              </span>
              <h3 className="font-display text-2xl md:text-3xl font-medium text-resort-charcoal-text mb-2">
                Booking Confirmed!
              </h3>
              <p className="text-sm font-semibold text-resort-forest mb-4 font-mono">
                Reservation Number: {confirmedBooking.reservationNumber}
              </p>
              <p className="text-resort-muted max-w-md mx-auto mb-8 text-sm leading-relaxed">
                Thank you! Your luxury stay has been officially confirmed for {confirmedBooking.maskedGuestName}. A confirmation has been registered for {confirmedBooking.maskedEmail}.
              </p>

              {/* Booking & Financial Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6 text-left">
                <div className="p-3.5 rounded-xl bg-resort-sand/30">
                  <p className="text-[10px] uppercase tracking-wider text-resort-muted mb-1">Check-in</p>
                  <p className="text-sm font-medium text-resort-charcoal-text">{confirmedBooking.checkInDate}</p>
                </div>
                <div className="p-3.5 rounded-xl bg-resort-sand/30">
                  <p className="text-[10px] uppercase tracking-wider text-resort-muted mb-1">Check-out</p>
                  <p className="text-sm font-medium text-resort-charcoal-text">{confirmedBooking.checkOutDate}</p>
                </div>
                <div className="p-3.5 rounded-xl bg-resort-sand/30">
                  <p className="text-[10px] uppercase tracking-wider text-resort-muted mb-1">Room Category</p>
                  <p className="text-sm font-medium text-resort-charcoal-text truncate">
                    {confirmedBooking.rooms[0]?.roomTypeName || 'Suite'}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-resort-sand/30">
                  <p className="text-[10px] uppercase tracking-wider text-resort-muted mb-1">Total Guests</p>
                  <p className="text-sm font-medium text-resort-charcoal-text">
                    {confirmedBooking.adults} Adults {confirmedBooking.children > 0 ? `, ${confirmedBooking.children} Child` : ''}
                  </p>
                </div>
              </div>

              {/* Payment Ledger Breakdown */}
              <div className="p-5 rounded-2xl bg-resort-sand/20 border border-resort-sand/60 mb-8 text-left">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-resort-muted mb-3">
                  Payment & Balance Breakdown
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-resort-muted">Payment Method</span>
                    <span className="font-medium text-resort-charcoal-text">
                      {isPayAtHotelBooking ? 'Pay at Hotel' : 'Online Payment (Gateway)'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-resort-muted">Total Booking Amount</span>
                    <span className="font-medium text-resort-charcoal-text">
                      {formatCurrency(confirmedBooking.totalAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-resort-muted">Amount Paid Advance</span>
                    <span className="font-semibold text-emerald-700">
                      {formatCurrency(confirmedBooking.advancePaidAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-resort-sand/60 text-base font-bold">
                    <span className="text-resort-charcoal-text">Outstanding Balance Due</span>
                    <span className="text-resort-forest">
                      {formatCurrency(balanceDue)}
                    </span>
                  </div>
                  {isPayAtHotelBooking && (
                    <p className="text-xs text-amber-800 bg-amber-50 p-2.5 rounded-lg mt-3">
                      Please settle the outstanding balance of {formatCurrency(balanceDue)} at the front desk upon arrival.
                    </p>
                  )}
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

  // ──────────────────────────────────────────────────────────
  // SCREEN 2: PENDING HOLD SCREEN (15-Minute Window & Pay Online)
  // ──────────────────────────────────────────────────────────
  if (activeHold) {
    const isExpired = secondsRemaining !== null && secondsRemaining <= 0;
    const formatTime = (secs: number) => {
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    return (
      <section className="section-padding">
        <div className="container-resort max-w-3xl mx-auto text-center">
          <ScrollReveal>
            <div className="bg-white rounded-2xl shadow-luxury-lg p-8 md:p-12 border border-amber-200/80">
              {/* Warning/Pending Badge */}
              <div className="w-20 h-20 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-6 text-amber-600">
                <Clock className="h-10 w-10 animate-pulse" />
              </div>
              <span className="inline-block px-4 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-semibold uppercase tracking-wider mb-3">
                Temporary Hold Active
              </span>
              <h3 className="font-display text-2xl md:text-3xl font-medium text-resort-charcoal-text mb-2">
                Your Room is Held
              </h3>
              <p className="text-sm text-resort-muted max-w-md mx-auto mb-4 leading-relaxed">
                Your room is temporarily held for 15 minutes. Complete payment to confirm your reservation.
              </p>

              {/* Hold Expiration Counter */}
              <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-amber-50 border border-amber-200 mb-6">
                <Clock className="h-4 w-4 text-amber-700" />
                <span className="text-xs font-semibold text-amber-900">
                  Hold Expires In:{' '}
                  <span className="font-mono text-sm font-bold text-amber-700">
                    {secondsRemaining !== null ? formatTime(secondsRemaining) : '15:00'}
                  </span>
                </span>
              </div>

              {isExpired ? (
                <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm mb-6">
                  This reservation hold has expired. The inventory has been released back into available pool. Please restart your booking.
                </div>
              ) : null}

              {/* Hold Details Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8 text-left">
                <div className="p-3.5 rounded-xl bg-resort-sand/30">
                  <p className="text-[10px] uppercase tracking-wider text-resort-muted mb-1">Hold Reference</p>
                  <p className="text-sm font-mono font-bold text-resort-charcoal-text truncate">
                    {activeHold.reservationNumber}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-resort-sand/30">
                  <p className="text-[10px] uppercase tracking-wider text-resort-muted mb-1">Category</p>
                  <p className="text-sm font-medium text-resort-charcoal-text truncate">
                    {activeHold.rooms[0]?.roomTypeName || 'Room'}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-resort-sand/30">
                  <p className="text-[10px] uppercase tracking-wider text-resort-muted mb-1">Check-in</p>
                  <p className="text-sm font-medium text-resort-charcoal-text">{activeHold.checkInDate}</p>
                </div>
                <div className="p-3.5 rounded-xl bg-resort-sand/30">
                  <p className="text-[10px] uppercase tracking-wider text-resort-muted mb-1">Total Payable</p>
                  <p className="text-sm font-bold text-resort-forest">
                    {formatCurrency(activeHold.requiredAdvanceAmount)}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                {!isExpired && checkoutUrl ? (
                  <button
                    onClick={() => router.push(checkoutUrl)}
                    className="w-full sm:w-auto px-10 py-4 bg-emerald-600 text-white font-semibold rounded-full hover:bg-emerald-700 transition-all text-sm shadow-md flex items-center justify-center gap-2"
                  >
                    <Lock className="h-4 w-4" /> Complete Online Payment ({formatCurrency(activeHold.requiredAdvanceAmount)})
                  </button>
                ) : (
                  <button
                    onClick={() => window.location.reload()}
                    className="w-full sm:w-auto px-8 py-3.5 bg-resort-forest text-white font-semibold rounded-full hover:bg-resort-forest-light transition-all text-sm"
                  >
                    Start New Booking
                  </button>
                )}
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

                {/* Payment Method Selection & Checkout Details */}
                <div className="pt-4 border-t border-resort-sand/60 space-y-4">
                  <PaymentMethodSelector
                    paymentMethod={paymentMethod}
                    onSelectMethod={(method) => setPaymentMethod(method)}
                    allowPayAtHotel={allowPayAtHotel}
                    disabled={isPending}
                  />

                  {paymentMethod === 'PAY_ONLINE' && (
                    <div className="space-y-3 pt-1">
                      <PaymentChannelTabs
                        selectedChannel={onlineSubMethod}
                        onSelectChannel={(ch) => setOnlineSubMethod(ch)}
                        disabled={isPending}
                      />

                      {onlineSubMethod === 'CARD' && (
                        <CardPaymentForm amountDueFormatted={formattedTotalPayable} />
                      )}

                      {onlineSubMethod === 'UPI' && (
                        <UpiPaymentPanel amountDueFormatted={formattedTotalPayable} />
                      )}

                      {onlineSubMethod === 'NET_BANKING' && (
                        <NetBankingPanel amountDueFormatted={formattedTotalPayable} />
                      )}
                    </div>
                  )}

                  {/* Authoritative pricing breakdown preview */}
                  <PaymentSummaryBreakdown
                    roomName={selectedRoom?.name || ''}
                    nights={serverPricing?.nights ?? nightsCount}
                    roomsCount={Number(roomsCount) || 1}
                    basePricePerNight={Number(selectedRoom?.basePrice) || 0}
                    paymentMethod={paymentMethod}
                    subtotal={serverPricing?.subtotal ?? null}
                    taxAmount={serverPricing?.taxAmount ?? null}
                    taxRatePercent={serverPricing?.taxRatePercent ?? null}
                    totalAmount={serverPricing?.totalAmount ?? null}
                    requiredAdvanceAmount={serverPricing?.requiredAdvanceAmount ?? null}
                    balanceAtHotel={serverPricing?.balanceAtHotel ?? null}
                    isLoading={isPricingLoading}
                    pricingError={pricingError}
                  />

                  <PaymentSecurityTrust />
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
                  disabled={
                    isPending ||
                    isRedirecting ||
                    availableTypes.length === 0 ||
                    isPricingLoading ||
                    !!pricingError ||
                    !serverPricing
                  }
                  suppressHydrationWarning
                  className="w-full sm:w-auto px-10 py-4 bg-resort-gold text-resort-charcoal-text font-semibold rounded-full hover:bg-resort-gold-light transition-all duration-300 hover:shadow-gold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isRedirecting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Connecting to Secure Payment...
                    </>
                  ) : isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Securing Inventory Hold...
                    </>
                  ) : isPricingLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Calculating Rate...
                    </>
                  ) : paymentMethod === 'PAY_AT_HOTEL' ? (
                    <>
                      <Check className="h-4 w-4" /> Confirm Booking (Pay at Hotel)
                    </>
                  ) : (
                    <>
                      Proceed to Online Payment ({formattedTotalPayable})
                      <ArrowRight className="h-4 w-4" />
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
