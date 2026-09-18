import Image from 'next/image';
import Link from 'next/link';
import { Users, DoorOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';
import type { StayPricingSummary } from '@/lib/availability/service';

interface RoomCardRoom {
  id: string | number;
  name: string;
  description: string;
  basePrice: number;
  slug?: string;
  maxOccupancy?: number;
  amenities?: { name: string; code: string; icon: string | null }[];
  media?: { id: string; fileUrl: string; title: string | null; isFeatured: boolean }[];
  activeRoomCount?: number;
  image?: string;
  pricing?: StayPricingSummary;
  marketingPricing?: StayPricingSummary;
}

interface RoomCardProps {
  room: RoomCardRoom;
  variant?: 'default' | 'horizontal';
  className?: string;
  checkIn?: string;
  checkOut?: string;
}

function getRoomImage(room: RoomCardRoom): string {
  if (room.media && room.media.length > 0) {
    const featured = room.media.find((m) => m.isFeatured);
    if (featured) return featured.fileUrl;
    return room.media[0].fileUrl;
  }
  if (room.image) return room.image;
  return '/images/resort/room-standard.jpg';
}

function getAmenitySummary(room: RoomCardRoom): string {
  if (!room.amenities || room.amenities.length === 0) return '';
  const top = room.amenities.slice(0, 3).map((a) => a.name);
  if (room.amenities.length > 3) {
    top.push(`+${room.amenities.length - 3} more`);
  }
  return top.join(' · ');
}

export function RoomCard({ room, variant = 'default', className, checkIn, checkOut }: RoomCardProps) {
  const imageSrc = getRoomImage(room);
  const occupancy = room.maxOccupancy || 2;
  const roomCount = room.activeRoomCount ?? 10;
  
  const queryParams = new URLSearchParams();
  if (checkIn) queryParams.set('checkIn', checkIn);
  if (checkOut) queryParams.set('checkOut', checkOut);
  const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';

  const detailHref = room.slug ? `/rooms/${room.slug}${queryString}` : `/rooms${queryString}`;

  // Date-Aware Pricing Logic (dated vs marketing)
  const hasDatePricing = Boolean(room.pricing && checkIn && checkOut);
  const hasMarketingPricing = Boolean(room.marketingPricing && !checkIn && !checkOut);
  const activePricing = hasDatePricing ? room.pricing : hasMarketingPricing ? room.marketingPricing : undefined;
  const isDiscounted = Boolean(activePricing?.isDiscounted);
  const sellingPrice = activePricing ? activePricing.averageNightlyRate : room.basePrice;
  const referencePrice = activePricing ? activePricing.totalReferenceAmount / Math.max(1, activePricing.nightsBreakdown.length) : room.basePrice;
  const discountSavings = activePricing ? activePricing.totalPromotionDiscount : 0;
  const offerLabel = activePricing?.effectiveOfferLabel;
  const isMarketingPromo = Boolean(hasMarketingPricing && isDiscounted);

  if (variant === 'horizontal') {
    return (
      <div
        className={cn(
          'group grid grid-cols-1 md:grid-cols-2 gap-0 rounded-2xl overflow-hidden bg-white shadow-luxury hover:shadow-luxury-lg transition-all duration-500',
          className
        )}
      >
        <div className="relative h-72 md:h-96 overflow-hidden">
          <Image
            src={imageSrc}
            alt={room.name}
            fill
            className="object-cover transition-transform duration-700 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
          {isDiscounted && (
            <div className="absolute top-4 left-4 z-10">
              <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-600 text-white px-3 py-1.5 rounded-full shadow-md">
                {offerLabel ? offerLabel : `Save ${formatCurrency(discountSavings)}`}
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-col justify-center p-8 md:p-10">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-resort-gold mb-3">
            Accommodation
          </span>
          <h3 className="font-display text-2xl md:text-3xl font-medium text-resort-charcoal-text mb-3">
            {room.name}
          </h3>
          <p className="text-sm text-resort-muted leading-relaxed mb-6">{room.description}</p>
          <div className="flex items-center gap-5 text-xs text-resort-muted mb-4">
            <span className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-resort-gold" />
              Up to {occupancy} guests
            </span>
            <span className="flex items-center gap-1.5">
              <DoorOpen className="h-3.5 w-3.5 text-resort-gold" />
              {roomCount} {roomCount === 1 ? 'room' : 'rooms'}
            </span>
          </div>
          {getAmenitySummary(room) && (
            <p className="text-xs text-resort-muted mb-6">{getAmenitySummary(room)}</p>
          )}
          <div className="flex items-end justify-between">
            <div>
              <span className="text-xs text-resort-muted">
                {hasDatePricing ? 'Selected dates' : isMarketingPromo ? "Today's offer" : 'Starting from'}
              </span>
              <div className="flex items-baseline gap-2 mt-0.5">
                {isDiscounted && (
                  <span className="text-sm line-through text-resort-muted/80">
                    {formatCurrency(referencePrice)}
                  </span>
                )}
                <p className="text-xl font-display font-semibold text-resort-forest">
                  {formatCurrency(sellingPrice)}
                  <span className="text-xs font-normal text-resort-muted ml-1">/ night</span>
                </p>
              </div>
              {hasDatePricing && room.pricing && room.pricing.nightsBreakdown.length > 1 && (
                <p className="text-[11px] text-resort-muted mt-0.5">
                  {formatCurrency(room.pricing.totalStayAmount)} total ({room.pricing.nightsBreakdown.length} nights)
                </p>
              )}
              {isMarketingPromo && (
                <p className="text-[10px] text-emerald-700 mt-1">Today only — select dates for exact rates</p>
              )}
            </div>
            <Link
              href={detailHref}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-resort-forest text-white text-sm font-semibold rounded-full hover:bg-resort-forest-light transition-colors"
            >
              View Details
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'group rounded-2xl overflow-hidden bg-white shadow-luxury hover:shadow-luxury-lg transition-all duration-500 flex flex-col justify-between',
        className
      )}
    >
      <div>
        <div className="relative h-64 md:h-72 overflow-hidden">
          <Image
            src={imageSrc}
            alt={room.name}
            fill
            className="object-cover transition-transform duration-700 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 25vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
          <span className="absolute top-4 left-4 text-[10px] font-semibold uppercase tracking-widest bg-white/90 backdrop-blur-sm text-resort-forest px-3 py-1.5 rounded-full">
            Accommodation
          </span>
          {isDiscounted && (
            <div className="absolute top-4 right-4 z-10">
              <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-600 text-white px-2.5 py-1 rounded-full shadow-sm">
                Save {formatCurrency(discountSavings)}
              </span>
            </div>
          )}
        </div>
        <div className="p-6">
          <h3 className="font-display text-xl font-medium text-resort-charcoal-text mb-2">
            {room.name}
          </h3>
          <p className="text-sm text-resort-muted leading-relaxed line-clamp-2 mb-4">
            {room.description}
          </p>
          <div className="flex items-center gap-4 text-xs text-resort-muted mb-5">
            <span className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-resort-gold" />
              Up to {occupancy}
            </span>
            <span className="flex items-center gap-1.5">
              <DoorOpen className="h-3.5 w-3.5 text-resort-gold" />
              {roomCount} {roomCount === 1 ? 'room' : 'rooms'} in category
            </span>
          </div>
        </div>
      </div>

      <div className="p-6 pt-0">
        <div className="flex items-end justify-between pt-4 border-t border-resort-sand/50">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-resort-muted">
              {hasDatePricing ? 'Selected dates' : isMarketingPromo ? "Today's offer" : 'From'}
            </span>
            <div className="flex items-baseline gap-1.5">
              {isDiscounted && (
                <span className="text-xs line-through text-resort-muted/80">
                  {formatCurrency(referencePrice)}
                </span>
              )}
              <p className="text-lg font-display font-semibold text-resort-forest">
                {formatCurrency(sellingPrice)}
                <span className="text-[10px] font-normal text-resort-muted ml-0.5">/night</span>
              </p>
            </div>
            {hasDatePricing && room.pricing && room.pricing.nightsBreakdown.length > 1 && (
              <p className="text-[10px] text-resort-muted mt-0.5">
                {formatCurrency(room.pricing.totalStayAmount)} total ({room.pricing.nightsBreakdown.length} nights)
              </p>
            )}
            {isMarketingPromo && (
              <p className="text-[9px] text-emerald-700 mt-1">Today only</p>
            )}
          </div>
          <Link
            href={detailHref}
            className="text-sm font-semibold text-resort-gold-dark hover:text-resort-forest transition-colors"
          >
            View Details →
          </Link>
        </div>
      </div>
    </div>
  );
}
