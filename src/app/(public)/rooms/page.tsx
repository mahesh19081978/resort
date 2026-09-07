import { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Wifi, Car, Coffee, Tv, Wind, Bath } from 'lucide-react';
import { IMAGES, RESORT } from '@/constants/images';
import { SectionHeading } from '@/components/public/SectionHeading';
import { ScrollReveal } from '@/components/public/ScrollReveal';
import { RoomCard } from '@/components/public/RoomCard';
import { getPublicRoomTypes, type PublicRoomType } from '@/actions/rooms/public';

export const metadata: Metadata = {
  title: 'Accommodations',
  description:
    'Comfortable rooms and suites at Infinity Resort Mhow — modern amenities, scenic views and thoughtful touches for the perfect retreat.',
};

const FALLBACK_AMENITIES = [
  { icon: Wind, title: 'Air Conditioning', desc: 'Climate-controlled comfort in every room.' },
  { icon: Wifi, title: 'Free Wi-Fi', desc: 'Stay connected with complimentary high-speed internet.' },
  { icon: Tv, title: 'Television', desc: 'Flat-screen TV with satellite channels.' },
  { icon: Coffee, title: 'Tea & Coffee', desc: 'In-room tea and coffee maker replenished daily.' },
  { icon: Bath, title: 'Room Service 24/7', desc: 'Full menu available around the clock.' },
  { icon: Car, title: 'Complimentary Breakfast', desc: 'Fresh buffet spread served each morning.' },
];

export default async function RoomsPage() {
  let rooms: PublicRoomType[] = [];
  try {
    rooms = await getPublicRoomTypes();
  } catch {
    rooms = [];
  }

  const featuredRoom = rooms[0];
  const remainingRooms = rooms.slice(1);

  return (
    <>
      {/* ─── HERO ─── */}
      <section className="relative h-[70vh] min-h-[480px] flex items-center overflow-hidden">
        <Image
          src={IMAGES.hero.main}
          alt="Accommodations at Infinity Resort"
          fill
          className="object-cover"
          priority
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/30 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

        <div className="container-resort relative z-10 pt-24">
          <ScrollReveal>
            <span className="inline-block text-xs font-semibold uppercase tracking-[0.25em] text-resort-gold-light mb-4">
              {RESORT.shortName}
            </span>
          </ScrollReveal>
          <ScrollReveal delay={0.15}>
            <h1 className="font-display text-display-lg md:text-display-xl font-medium text-white max-w-3xl leading-[1.05]">
              Accommodations
            </h1>
          </ScrollReveal>
          <ScrollReveal delay={0.3}>
            <p className="mt-6 text-lg md:text-xl text-white/70 max-w-xl font-light leading-relaxed">
              Comfortable Rooms & Suites in Mhow
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* ─── EDITORIAL INTRO ─── */}
      <section className="section-padding">
        <div className="container-resort">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <ScrollReveal direction="left">
              <div className="relative">
                <div className="relative rounded-2xl overflow-hidden shadow-luxury-lg aspect-[4/5]">
                  <Image
                    src={featuredRoom.media[0]?.fileUrl || IMAGES.rooms[1].image}
                    alt={`${featuredRoom.name} at Infinity Resort`}
                    fill
                    className="object-cover"
                    sizes="(max-width: 1024px) 100vw, 50vw"
                  />
                </div>
              </div>
            </ScrollReveal>

            <ScrollReveal direction="right">
              <div>
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-resort-gold">
                  Stay With Us
                </span>
                <div className="gold-line-wide mt-4 mb-6" />
                <h2 className="font-display text-display-sm md:text-display-md font-medium text-resort-charcoal-text leading-tight">
                  A Room for Every Mood
                </h2>
                <p className="mt-6 text-base text-resort-muted leading-relaxed">
                  Every room at Infinity Resort is designed for comfort and relaxation. With modern
                  amenities, scenic views and thoughtful touches, our accommodations provide the perfect
                  retreat after a day of exploration.
                </p>
                <Link
                  href="/booking"
                  className="inline-flex items-center gap-2 mt-8 text-sm font-semibold text-resort-gold-dark hover:text-resort-forest transition-colors group"
                >
                  Check Availability
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ─── ALL ROOMS ─── */}
      <section className="section-padding bg-resort-sand/40">
        <div className="container-resort">
          <ScrollReveal>
            <SectionHeading
              label="Our Collection"
              title="Rooms & Suites"
              description="Each room is thoughtfully designed to offer comfort, privacy and an immersive experience of the surrounding landscape."
            />
          </ScrollReveal>

          {/* Featured Horizontal Room */}
          {featuredRoom && (
            <div className="mt-14">
              <ScrollReveal>
                <RoomCard room={featuredRoom} variant="horizontal" />
              </ScrollReveal>
            </div>
          )}

          {/* Remaining Rooms in Grid */}
          {remainingRooms.length > 0 && (
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {remainingRooms.map((room, i) => (
                <ScrollReveal key={room.id} delay={i * 0.1}>
                  <RoomCard room={room} />
                </ScrollReveal>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ─── AMENITIES GRID ─── */}
      <section className="section-padding">
        <div className="container-resort">
          <ScrollReveal>
            <SectionHeading
              label="Included With Your Stay"
              title="Room Amenities"
              description="Every stay includes access to our signature comforts and modern conveniences."
            />
          </ScrollReveal>

          <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FALLBACK_AMENITIES.map((item, i) => (
              <ScrollReveal key={item.title} delay={i * 0.1}>
                <div className="flex items-start gap-4 p-6 rounded-2xl bg-resort-sand/30 border border-resort-sand/50 hover:shadow-luxury transition-all duration-300">
                  <div className="w-10 h-10 rounded-xl bg-resort-gold/10 flex items-center justify-center shrink-0">
                    <item.icon className="h-5 w-5 text-resort-gold" />
                  </div>
                  <div>
                    <h4 className="font-display text-lg font-medium text-resort-charcoal-text">
                      {item.title}
                    </h4>
                    <p className="text-sm text-resort-muted mt-1 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── BOOKING CTA ─── */}
      <section className="relative h-[60vh] min-h-[400px] flex items-center overflow-hidden">
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
