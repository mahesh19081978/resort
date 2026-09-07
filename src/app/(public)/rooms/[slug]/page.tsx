import { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Users, Maximize2, Check } from 'lucide-react';
import { IMAGES, RESORT } from '@/constants/images';
import { SectionHeading } from '@/components/public/SectionHeading';
import { ScrollReveal } from '@/components/public/ScrollReveal';
import { RoomCard } from '@/components/public/RoomCard';
import { getPublicRoomTypeBySlug, type PublicRoomTypeDetail } from '@/actions/rooms/public';
import { formatCurrency } from '@/lib/utils';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const room = await getPublicRoomTypeBySlug(slug);

  if (!room) {
    return { title: 'Room Not Found' };
  }

  return {
    title: `${room.name} | Accommodations`,
    description: room.description,
  };
}

export default async function RoomDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const room = await getPublicRoomTypeBySlug(slug);

  if (!room) {
    notFound();
  }

  const heroImage = getHeroImage(room);
  const galleryImages = room.media.filter((m) => !m.isFeatured);

  return (
    <>
      {/* ─── HERO ─── */}
      <section className="relative h-[70vh] min-h-[480px] flex items-end overflow-hidden">
        <Image
          src={heroImage}
          alt={room.name}
          fill
          className="object-cover"
          priority
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

        <div className="container-resort relative z-10 pb-16 pt-32">
          <ScrollReveal>
            <Link
              href="/rooms"
              className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-resort-gold-light mb-4 hover:text-white transition-colors"
            >
              ← All Accommodations
            </Link>
          </ScrollReveal>
          <ScrollReveal delay={0.1}>
            <h1 className="font-display text-display-lg md:text-display-xl font-medium text-white max-w-3xl leading-[1.05]">
              {room.name}
            </h1>
          </ScrollReveal>
          <ScrollReveal delay={0.2}>
            <div className="flex items-center gap-6 mt-4 text-white/70 text-sm">
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-resort-gold" />
                Up to {room.maxOccupancy} guests
              </span>
              <span className="flex items-center gap-1.5">
                <Maximize2 className="h-4 w-4 text-resort-gold" />
                {room.maxAdults} adults, {room.maxChildren} children
              </span>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ─── ROOM DETAILS ─── */}
      <section className="section-padding">
        <div className="container-resort">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 lg:gap-16">
            {/* Main Content */}
            <div className="lg:col-span-2">
              <ScrollReveal>
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-resort-gold">
                  About This Room
                </span>
                <div className="gold-line-wide mt-4 mb-6" />
                <p className="text-base text-resort-muted leading-relaxed whitespace-pre-line">
                  {room.description}
                </p>
              </ScrollReveal>

              {/* Amenities */}
              {room.amenities.length > 0 && (
                <ScrollReveal delay={0.1}>
                  <div className="mt-10">
                    <h3 className="font-display text-xl font-medium text-resort-charcoal-text mb-5">
                      Room Amenities
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {room.amenities.map((amenity) => (
                        <div
                          key={amenity.code}
                          className="flex items-center gap-3 p-3 rounded-xl bg-resort-sand/30 border border-resort-sand/50"
                        >
                          <div className="w-8 h-8 rounded-lg bg-resort-gold/10 flex items-center justify-center shrink-0">
                            <Check className="h-4 w-4 text-resort-gold" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-resort-charcoal-text">
                              {amenity.name}
                            </p>
                            {amenity.icon && (
                              <p className="text-[10px] text-resort-muted uppercase tracking-wider">
                                {amenity.icon}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </ScrollReveal>
              )}

              {/* Gallery */}
              {galleryImages.length > 0 && (
                <ScrollReveal delay={0.2}>
                  <div className="mt-10">
                    <h3 className="font-display text-xl font-medium text-resort-charcoal-text mb-5">
                      Gallery
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      {galleryImages.map((img) => (
                        <div
                          key={img.id}
                          className="relative aspect-[4/3] rounded-xl overflow-hidden"
                        >
                          <Image
                            src={img.fileUrl}
                            alt={img.title || room.name}
                            fill
                            className="object-cover"
                            sizes="(max-width: 640px) 50vw, 33vw"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </ScrollReveal>
              )}
            </div>

            {/* Sidebar — Pricing */}
            <div className="lg:col-span-1">
              <ScrollReveal direction="right">
                <div className="sticky top-28 bg-white rounded-2xl shadow-luxury p-8 border border-resort-sand/30">
                  <div className="mb-6">
                    <span className="text-xs text-resort-muted uppercase tracking-wider">
                      Starting from
                    </span>
                    <p className="text-3xl font-display font-semibold text-resort-forest mt-1">
                      {formatCurrency(room.basePrice)}
                      <span className="text-sm font-normal text-resort-muted ml-1">/ night</span>
                    </p>
                  </div>

                  <Link
                    href="/booking"
                    className="flex items-center justify-center gap-2 w-full py-3.5 bg-resort-forest text-white font-semibold rounded-full hover:bg-resort-forest-light transition-colors"
                  >
                    Book Your Stay
                    <ArrowRight className="h-4 w-4" />
                  </Link>

                  <p className="text-center text-xs text-resort-muted mt-4">
                    Best rate guarantee when you book direct
                  </p>
                </div>
              </ScrollReveal>
            </div>
          </div>
        </div>
      </section>

      {/* ─── RELATED ROOMS ─── */}
      {room.relatedRoomTypes.length > 0 && (
        <section className="section-padding bg-resort-sand/40">
          <div className="container-resort">
            <ScrollReveal>
              <SectionHeading
                label="You May Also Like"
                title="Other Accommodations"
                description="Explore our other room types and find the perfect match for your stay."
              />
            </ScrollReveal>

            <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {room.relatedRoomTypes.map((rt, i) => (
                <ScrollReveal key={rt.id} delay={i * 0.1}>
                  <RoomCard
                    room={{
                      ...rt,
                      amenities: [],
                      media: rt.media.map((m) => ({
                        id: m.fileUrl,
                        fileUrl: m.fileUrl,
                        title: null,
                        isFeatured: m.isFeatured,
                      })),
                      activeRoomCount: 10,
                    }}
                  />
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>
      )}

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
            <span className="inline-block text-xs font-semibold uppercase tracking-[0.25em] text-resort-gold-light mb-4">
              {RESORT.shortName}
            </span>
            <h2 className="font-display text-display-md md:text-display-lg font-medium text-white max-w-2xl mx-auto">
              Ready to Experience Comfort?
            </h2>
            <p className="mt-4 text-white/60 max-w-lg mx-auto">
              Check availability and secure the best rates directly through our website.
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

function getHeroImage(room: PublicRoomTypeDetail): string {
  const featured = room.media.find((m) => m.isFeatured);
  if (featured) return featured.fileUrl;
  if (room.media.length > 0) return room.media[0].fileUrl;
  return IMAGES.hero.main;
}
