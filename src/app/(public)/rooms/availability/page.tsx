import { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, CalendarDays, Users, Clock, Search, AlertCircle, Wifi, Check } from 'lucide-react';
import { IMAGES } from '@/constants/images';
import { SectionHeading } from '@/components/public/SectionHeading';
import { ScrollReveal } from '@/components/public/ScrollReveal';
import { availabilitySearchSchema } from '@/lib/availability/schema';
import { getAvailableRoomTypes, type AvailableRoomType } from '@/lib/availability/service';
import { formatCurrency, formatDate } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Availability | Accommodations',
  description:
    'Check room availability and book your stay at Infinity Resort Mhow. Real-time availability for all room types.',
  robots: { index: false, follow: true },
};

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function parseSearchParams(sp: { [key: string]: string | string[] | undefined }) {
  const get = (key: string): string => {
    const val = sp[key];
    return Array.isArray(val) ? val[0] ?? '' : val ?? '';
  };
  return {
    checkIn: get('checkIn'),
    checkOut: get('checkOut'),
    guests: get('guests'),
  };
}

function getRoomImage(room: AvailableRoomType): string {
  if (room.media.length > 0) {
    const featured = room.media.find((m) => m.isFeatured);
    if (featured) return featured.fileUrl;
    return room.media[0].fileUrl;
  }
  return IMAGES.hero.main;
}

function getAmenitySummary(amenities: AvailableRoomType['amenities']): string {
  if (amenities.length === 0) return '';
  const top = amenities.slice(0, 4).map((a) => a.name);
  return top.join(' · ');
}

function buildModifyUrl(checkIn: string, checkOut: string, guests: string): string {
  const params = new URLSearchParams();
  if (checkIn) params.set('checkIn', checkIn);
  if (checkOut) params.set('checkOut', checkOut);
  if (guests) params.set('guests', guests);
  return `/?${params.toString()}`;
}

function buildBookUrl(
  roomTypeId: string,
  checkIn: string,
  checkOut: string,
  guests: string
): string {
  const params = new URLSearchParams({
    roomTypeId,
    checkIn,
    checkOut,
    adults: guests,
  });
  return `/booking?${params.toString()}`;
}

export default async function AvailabilityPage({ searchParams }: PageProps) {
  const raw = parseSearchParams(await searchParams);

  // ─── VALIDATE SEARCH PARAMS ───
  const parsed = availabilitySearchSchema.safeParse({
    checkIn: raw.checkIn,
    checkOut: raw.checkOut,
    guests: raw.guests ? Number(raw.guests) : undefined,
  });

  if (!parsed.success) {
    return (
      <>
        {/* ─── HERO ─── */}
        <section className="relative h-[40vh] min-h-[320px] flex items-center overflow-hidden">
          <Image
            src={IMAGES.hero.main}
            alt="Availability search"
            fill
            className="object-cover"
            priority
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/30 to-transparent" />
          <div className="container-resort relative z-10 pt-24">
            <ScrollReveal>
              <h1 className="font-display text-display-lg md:text-display-xl font-medium text-white">
                Check Availability
              </h1>
            </ScrollReveal>
          </div>
        </section>

        {/* ─── INVALID STATE ─── */}
        <section className="section-padding">
          <div className="container-resort max-w-2xl text-center">
            <ScrollReveal>
              <div className="w-16 h-16 rounded-full bg-resort-gold/10 flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="h-8 w-8 text-resort-gold" />
              </div>
              <h2 className="font-display text-2xl font-medium text-resort-charcoal-text mb-4">
                Please Select Valid Dates
              </h2>
              <p className="text-resort-muted leading-relaxed mb-8">
                {parsed.error.issues[0]?.message ??
                  'The search parameters provided are invalid. Please check your dates and try again.'}
              </p>
              <Link
                href="/"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-resort-forest text-white font-semibold rounded-full hover:bg-resort-forest-light transition-colors"
              >
                <Search className="h-4 w-4" />
                Modify Search
              </Link>
            </ScrollReveal>
          </div>
        </section>
      </>
    );
  }

  const { checkIn, checkOut, guests } = parsed.data;

  // ─── FETCH AVAILABILITY ───
  let availableRoomTypes: AvailableRoomType[] = [];
  let totalAvailable = 0;
  let dbError = false;

  try {
    const result = await getAvailableRoomTypes(parsed.data);
    availableRoomTypes = result.availableRoomTypes;
    totalAvailable = result.totalAvailable;
  } catch (error) {
    console.error('[AVAILABILITY] Database error:', error);
    dbError = true;
  }

  // ─── ERROR STATE ───
  if (dbError) {
    return (
      <>
        <section className="relative h-[40vh] min-h-[320px] flex items-center overflow-hidden">
          <Image
            src={IMAGES.hero.main}
            alt="Availability search error"
            fill
            className="object-cover"
            priority
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/30 to-transparent" />
          <div className="container-resort relative z-10 pt-24">
            <ScrollReveal>
              <h1 className="font-display text-display-lg md:text-display-xl font-medium text-white">
                Check Availability
              </h1>
            </ScrollReveal>
          </div>
        </section>

        <section className="section-padding">
          <div className="container-resort max-w-2xl text-center">
            <ScrollReveal>
              <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="h-8 w-8 text-red-500" />
              </div>
              <h2 className="font-display text-2xl font-medium text-resort-charcoal-text mb-4">
                Unable to Check Availability
              </h2>
              <p className="text-resort-muted leading-relaxed mb-8">
                We&apos;re unable to check availability right now. Please try again in a moment.
              </p>
              <Link
                href={`/rooms/availability?checkIn=${checkIn}&checkOut=${checkOut}&guests=${guests}`}
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-resort-forest text-white font-semibold rounded-full hover:bg-resort-forest-light transition-colors"
              >
                Try Again
              </Link>
            </ScrollReveal>
          </div>
        </section>
      </>
    );
  }

  // ─── CALCULATIONS ───
  const nights = Math.round(
    (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000
  );
  const modifyUrl = buildModifyUrl(checkIn, checkOut, String(guests));

  // ─── RENDER ───
  return (
    <>
      {/* ─── HERO ─── */}
      <section className="relative h-[40vh] min-h-[320px] flex items-center overflow-hidden">
        <Image
          src={IMAGES.hero.main}
          alt="Availability search results"
          fill
          className="object-cover"
          priority
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/30 to-transparent" />
        <div className="container-resort relative z-10 pt-24">
          <ScrollReveal>
            <h1 className="font-display text-display-lg md:text-display-xl font-medium text-white">
              Check Availability
            </h1>
          </ScrollReveal>
        </div>
      </section>

      {/* ─── SEARCH SUMMARY BAR ─── */}
      <section className="bg-white border-b border-resort-sand/50 sticky top-0 z-30">
        <div className="container-resort py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-2 text-sm">
                <CalendarDays className="h-4 w-4 text-resort-gold" />
                <span className="text-resort-muted">Check-in</span>
                <span className="font-medium text-resort-charcoal-text">
                  {formatDate(checkIn)}
                </span>
              </div>
              <div className="hidden sm:block w-px h-4 bg-resort-sand" />
              <div className="flex items-center gap-2 text-sm">
                <CalendarDays className="h-4 w-4 text-resort-gold" />
                <span className="text-resort-muted">Check-out</span>
                <span className="font-medium text-resort-charcoal-text">
                  {formatDate(checkOut)}
                </span>
              </div>
              <div className="hidden sm:block w-px h-4 bg-resort-sand" />
              <div className="flex items-center gap-2 text-sm">
                <Users className="h-4 w-4 text-resort-gold" />
                <span className="text-resort-muted">{guests} Guests</span>
              </div>
              <div className="hidden sm:block w-px h-4 bg-resort-sand" />
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-resort-gold" />
                <span className="text-resort-muted">
                  {nights} {nights === 1 ? 'Night' : 'Nights'}
                </span>
              </div>
            </div>
            <Link
              href={modifyUrl}
              className="text-sm font-semibold text-resort-gold-dark hover:text-resort-forest transition-colors"
            >
              Modify Search
            </Link>
          </div>
        </div>
      </section>

      {/* ─── RESULTS ─── */}
      <section className="section-padding">
        <div className="container-resort">
          <ScrollReveal>
            <div className="mb-10">
              <h2 className="font-display text-display-sm md:text-display-md font-medium text-resort-charcoal-text">
                {totalAvailable > 0
                  ? `${totalAvailable} room ${totalAvailable === 1 ? 'type' : 'types'} available`
                  : 'No rooms available'}
              </h2>
              <p className="mt-2 text-resort-muted">
                {totalAvailable > 0
                  ? `For ${formatDate(checkIn)} — ${formatDate(checkOut)} · ${guests} ${guests === 1 ? 'Guest' : 'Guests'} · ${nights} ${nights === 1 ? 'Night' : 'Nights'}`
                  : `We couldn't find a room matching your stay for ${formatDate(checkIn)} — ${formatDate(checkOut)}.`}
              </p>
            </div>
          </ScrollReveal>

          {totalAvailable > 0 ? (
            <div className="space-y-8">
              {availableRoomTypes.map((room, i) => (
                <ScrollReveal key={room.roomTypeId} delay={i * 0.1}>
                  <AvailabilityResultCard
                    room={room}
                    checkIn={checkIn}
                    checkOut={checkOut}
                    guests={guests}
                    nights={nights}
                  />
                </ScrollReveal>
              ))}
            </div>
          ) : (
            /* ─── EMPTY STATE ─── */
            <ScrollReveal>
              <div className="max-w-2xl mx-auto text-center py-16">
                <div className="relative w-full max-w-md mx-auto aspect-[4/3] rounded-2xl overflow-hidden mb-8">
                  <Image
                    src={IMAGES.hero.secondary}
                    alt="No rooms available"
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 100vw, 448px"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                </div>
                <h3 className="font-display text-2xl font-medium text-resort-charcoal-text mb-3">
                  No Rooms Available for These Dates
                </h3>
                <p className="text-resort-muted leading-relaxed mb-8">
                  We couldn&apos;t find a room matching your stay for{' '}
                  <span className="font-medium text-resort-charcoal-text">
                    {formatDate(checkIn)} — {formatDate(checkOut)}
                  </span>
                  . Try adjusting your dates or number of guests.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Link
                    href={modifyUrl}
                    className="inline-flex items-center gap-2 px-8 py-3.5 bg-resort-forest text-white font-semibold rounded-full hover:bg-resort-forest-light transition-colors"
                  >
                    <Search className="h-4 w-4" />
                    Modify Search
                  </Link>
                  <Link
                    href="/rooms"
                    className="inline-flex items-center gap-2 px-8 py-3.5 border border-resort-forest text-resort-forest font-semibold rounded-full hover:bg-resort-forest hover:text-white transition-all duration-300"
                  >
                    Explore All Rooms
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </ScrollReveal>
          )}
        </div>
      </section>

      {/* ─── BOOKING CTA ─── */}
      <section className="relative h-[50vh] min-h-[350px] flex items-center overflow-hidden">
        <Image
          src={IMAGES.cta}
          alt="Book your stay at Infinity Resort"
          fill
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-resort-charcoal/70" />
        <div className="container-resort relative z-10 text-center">
          <ScrollReveal>
            <h2 className="font-display text-display-md md:text-display-lg font-medium text-white max-w-2xl mx-auto">
              Ready to Experience Comfort?
            </h2>
            <p className="mt-4 text-white/60 max-w-lg mx-auto">
              Book directly for the best rates and instant confirmation.
            </p>
            <Link
              href="/booking"
              className="inline-flex items-center gap-2 mt-10 px-10 py-4 bg-resort-gold text-resort-charcoal-text font-semibold rounded-full hover:bg-resort-gold-light transition-all duration-300 hover:shadow-gold text-lg"
            >
              Book Your Stay
              <ArrowRight className="h-5 w-5" />
            </Link>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}

/* ─── RESULT CARD ─── */
function AvailabilityResultCard({
  room,
  checkIn,
  checkOut,
  guests,
  nights,
}: {
  room: AvailableRoomType;
  checkIn: string;
  checkOut: string;
  guests: number;
  nights: number;
}) {
  const imageSrc = getRoomImage(room);
  const totalPrice = room.basePrice * nights;
  const detailHref = `/rooms/${room.slug}`;
  const bookHref = buildBookUrl(room.roomTypeId, checkIn, checkOut, String(guests));
  const amenitySummary = getAmenitySummary(room.amenities);

  return (
    <div className="group grid grid-cols-1 md:grid-cols-[320px_1fr_auto] gap-0 rounded-2xl overflow-hidden bg-white shadow-luxury hover:shadow-luxury-lg transition-all duration-500">
      {/* Image */}
      <div className="relative h-64 md:h-full min-h-[280px] overflow-hidden">
        <Image
          src={imageSrc}
          alt={room.name}
          fill
          className="object-cover transition-transform duration-700 group-hover:scale-105"
          sizes="(max-width: 768px) 100vw, 320px"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
        {room.availableRoomCount <= 3 && (
          <div className="absolute top-4 left-4">
            <span className="text-[10px] font-semibold uppercase tracking-widest bg-resort-gold/90 text-white px-3 py-1.5 rounded-full">
              {room.availableRoomCount === 1
                ? '1 room left'
                : `${room.availableRoomCount} rooms left`}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-col justify-center p-6 md:p-8">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-resort-gold mb-2">
          Accommodation
        </span>
        <h3 className="font-display text-xl md:text-2xl font-medium text-resort-charcoal-text mb-2">
          {room.name}
        </h3>
        <p className="text-sm text-resort-muted leading-relaxed line-clamp-2 mb-4">
          {room.description}
        </p>

        <div className="flex items-center gap-4 text-xs text-resort-muted mb-4">
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-resort-gold" />
            Up to {room.maxOccupancy} guests
          </span>
          <span className="flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 text-resort-gold" />
            {room.availableRoomCount} {room.availableRoomCount === 1 ? 'room' : 'rooms'} available
          </span>
        </div>

        {amenitySummary && (
          <p className="text-xs text-resort-muted mb-4">{amenitySummary}</p>
        )}

        {/* Mobile price */}
        <div className="md:hidden flex items-center gap-4 pt-4 border-t border-resort-sand/50">
          <div>
            <p className="text-xl font-display font-semibold text-resort-forest">
              {formatCurrency(room.basePrice)}
              <span className="text-xs font-normal text-resort-muted ml-1">/ night</span>
            </p>
            <p className="text-xs text-resort-muted mt-0.5">
              {formatCurrency(totalPrice)} total · {nights} {nights === 1 ? 'night' : 'nights'}
            </p>
          </div>
        </div>

        {/* Mobile CTAs */}
        <div className="md:hidden flex items-center gap-3 mt-4">
          <Link
            href={detailHref}
            className="flex-1 text-center py-2.5 border border-resort-forest text-resort-forest text-sm font-semibold rounded-full hover:bg-resort-forest hover:text-white transition-all duration-300"
          >
            View Room
          </Link>
          <Link
            href={bookHref}
            className="flex-1 text-center py-2.5 bg-resort-forest text-white text-sm font-semibold rounded-full hover:bg-resort-forest-light transition-colors"
          >
            Book Now
          </Link>
        </div>
      </div>

      {/* Desktop sidebar price + CTAs */}
      <div className="hidden md:flex flex-col items-center justify-center gap-4 px-8 py-8 border-l border-resort-sand/30 min-w-[200px]">
        <div className="text-center">
          <p className="text-2xl font-display font-semibold text-resort-forest">
            {formatCurrency(room.basePrice)}
          </p>
          <p className="text-xs text-resort-muted mt-1">per night</p>
        </div>
        <div className="w-12 h-px bg-resort-sand" />
        <div className="text-center">
          <p className="text-lg font-display font-medium text-resort-charcoal-text">
            {formatCurrency(totalPrice)}
          </p>
          <p className="text-xs text-resort-muted mt-1">
            {nights} {nights === 1 ? 'night' : 'nights'} total
          </p>
        </div>
        <Link
          href={detailHref}
          className="w-full text-center py-2.5 border border-resort-forest text-resort-forest text-sm font-semibold rounded-full hover:bg-resort-forest hover:text-white transition-all duration-300"
        >
          View Room
        </Link>
        <Link
          href={bookHref}
          className="w-full text-center py-2.5 bg-resort-forest text-white text-sm font-semibold rounded-full hover:bg-resort-forest-light transition-colors"
        >
          Book Now
        </Link>
      </div>
    </div>
  );
}
