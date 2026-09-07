import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Quote, Wifi, Car, Utensils, Waves, TreePine, MapPin } from 'lucide-react';
import { IMAGES, RESORT } from '@/constants/images';
import { ScrollReveal } from '@/components/public/ScrollReveal';
import { SectionHeading } from '@/components/public/SectionHeading';
import { BookingSearch } from '@/components/public/BookingSearch';
import { RoomCard } from '@/components/public/RoomCard';
import { ExperienceCard } from '@/components/public/ExperienceCard';
import { getPublicRoomTypes } from '@/actions/rooms/public';

export const metadata = {
  title: 'Infinity Resort & Restaurant | Mhow',
  description:
    'Experience memorable stays, fine dining and warm hospitality at Infinity Resort and Restaurant in Mhow, Madhya Pradesh. A perfect blend of comfort, nature and exceptional service.',
};

const FACILITIES = [
  {
    icon: Waves,
    title: 'Infinity Pool',
    description: 'Take a dip in our stunning infinity pool with breathtaking views.',
  },
  {
    icon: Utensils,
    title: 'Restaurant',
    description: 'Savour exquisite local and global cuisines at our restaurant.',
  },
  {
    icon: Wifi,
    title: 'Free Wi-Fi',
    description: 'Stay connected with complimentary high-speed Wi-Fi throughout the resort.',
  },
  {
    icon: TreePine,
    title: 'Poolside Dining',
    description: 'Enjoy meals al fresco beside the pool with scenic views.',
  },
  {
    icon: MapPin,
    title: 'Event Lawn',
    description: 'A lush green lawn perfect for celebrations and gatherings.',
  },
  {
    icon: Car,
    title: 'Parking',
    description: 'Free spacious parking for a stress-free stay.',
  },
];

export default async function HomePage() {
  let featuredRooms: Awaited<ReturnType<typeof getPublicRoomTypes>> = [];
  try {
    const allRooms = await getPublicRoomTypes();
    featuredRooms = allRooms.slice(0, 3);
  } catch {
    featuredRooms = [];
  }

  return (
    <>
      {/* ─── HERO ─── */}
      <section className="relative h-[90vh] min-h-[600px] flex items-center overflow-hidden">
        <Image
          src={IMAGES.hero.main}
          alt="Infinity Resort — luxury resort surrounded by nature"
          fill
          className="object-cover"
          priority
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/30 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

        <div className="container-resort relative z-10 pt-24">
          <ScrollReveal>
            <span className="inline-block text-xs font-semibold uppercase tracking-[0.25em] text-resort-gold-light mb-6">
              Resort & Restaurant · Mhow, Madhya Pradesh
            </span>
          </ScrollReveal>
          <ScrollReveal delay={0.15}>
            <h1 className="font-display text-display-lg md:text-display-xl font-medium text-white max-w-3xl leading-[1.05]">
              Where Comfort<br />Meets Nature
            </h1>
          </ScrollReveal>
          <ScrollReveal delay={0.3}>
            <p className="mt-6 text-lg md:text-xl text-white/70 max-w-xl font-light leading-relaxed">
              Experience memorable stays, fine dining and warm hospitality at Infinity Resort and
              Restaurant in Mhow.
            </p>
          </ScrollReveal>
          <ScrollReveal delay={0.45}>
            <div className="mt-10 flex flex-wrap gap-4">
              <Link
                href="/booking"
                className="inline-flex items-center gap-2 px-8 py-4 bg-resort-gold text-resort-charcoal-text font-semibold rounded-full hover:bg-resort-gold-light transition-all duration-300 hover:shadow-gold"
              >
                Book Your Stay
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/rooms"
                className="inline-flex items-center gap-2 px-8 py-4 border border-white/30 text-white font-semibold rounded-full hover:bg-white/10 backdrop-blur-sm transition-all duration-300"
              >
                Explore the Resort
              </Link>
            </div>
          </ScrollReveal>
        </div>

        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-white/50 animate-bounce">
          <span className="text-[10px] uppercase tracking-[0.2em]">Scroll</span>
          <div className="w-px h-8 bg-gradient-to-b from-white/50 to-transparent" />
        </div>
      </section>

      {/* ─── BOOKING SEARCH ─── */}
      <BookingSearch variant="floating" className="max-w-5xl" />

      {/* ─── INTRODUCTION ─── */}
      <section className="section-padding">
        <div className="container-resort">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <ScrollReveal direction="left">
              <div className="relative">
                <div className="relative rounded-2xl overflow-hidden shadow-luxury-lg aspect-[4/5]">
                  <Image
                    src={IMAGES.dining.restaurant}
                    alt="Infinity Resort — elegant dining experience"
                    fill
                    className="object-cover"
                    sizes="(max-width: 1024px) 100vw, 50vw"
                  />
                </div>
                <div className="absolute -bottom-6 -right-6 md:-bottom-8 md:-right-8 bg-resort-forest text-white p-6 md:p-8 rounded-2xl shadow-luxury-lg max-w-[200px]">
                  <p className="font-display text-sm font-semibold text-resort-gold-light">
                    Infinity Resort · Mhow
                  </p>
                </div>
              </div>
            </ScrollReveal>

            <ScrollReveal direction="right">
              <div>
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-resort-gold">
                  Welcome to Infinity Resort
                </span>
                <div className="gold-line-wide mt-4 mb-6" />
                <h2 className="font-display text-display-sm md:text-display-md font-medium text-resort-charcoal-text leading-tight">
                  A Destination for Every Occasion
                </h2>
                <p className="mt-6 text-base text-resort-muted leading-relaxed">
                  Whether it&apos;s a weekend getaway, a family vacation, or a business retreat,
                  Infinity Resort and Restaurant offers the perfect blend of comfort, nature and warm
                  hospitality in Mhow. Our scenic surroundings, comfortable rooms and dedicated service
                  ensure a memorable experience for every guest.
                </p>
                <Link
                  href="/services"
                  className="inline-flex items-center gap-2 mt-8 text-sm font-semibold text-resort-gold-dark hover:text-resort-forest transition-colors group"
                >
                  Discover Our Experiences
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ─── ROOMS SHOWCASE ─── */}
      <section className="section-padding bg-resort-sand/40">
        <div className="container-resort">
          <ScrollReveal>
            <SectionHeading
              label="Accommodations"
              title="Comfortable Rooms & Suites"
              description="Thoughtfully designed spaces offering modern amenities, scenic views and a peaceful retreat from the everyday."
            />
          </ScrollReveal>

          <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {featuredRooms.map((room, i) => (
              <ScrollReveal key={room.id} delay={i * 0.1}>
                <RoomCard room={room} />
              </ScrollReveal>
            ))}
          </div>

          <ScrollReveal>
            <div className="mt-12 text-center">
              <Link
                href="/rooms"
                className="inline-flex items-center gap-2 px-8 py-3.5 border border-resort-forest text-resort-forest font-semibold rounded-full hover:bg-resort-forest hover:text-white transition-all duration-300"
              >
                View All Accommodations
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ─── FACILITIES ─── */}
      <section className="section-padding bg-resort-charcoal">
        <div className="container-resort">
          <ScrollReveal>
            <SectionHeading
              label="Facilities"
              title="Experience Our Facilities"
              light
            />
          </ScrollReveal>

          <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FACILITIES.map((facility, i) => (
              <ScrollReveal key={facility.title} delay={i * 0.1}>
                <div className="group p-8 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all duration-300">
                  <div className="w-12 h-12 rounded-xl bg-resort-gold/10 flex items-center justify-center mb-5 group-hover:bg-resort-gold/20 transition-colors">
                    <facility.icon className="h-6 w-6 text-resort-gold" />
                  </div>
                  <h3 className="font-display text-lg font-medium text-resort-ivory mb-2">
                    {facility.title}
                  </h3>
                  <p className="text-sm text-resort-sand/70 leading-relaxed">
                    {facility.description}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── TESTIMONIAL ─── */}
      <section className="section-padding">
        <div className="container-resort">
          <ScrollReveal>
            <div className="max-w-3xl mx-auto text-center">
              <Quote className="h-10 w-10 text-resort-gold/40 mx-auto mb-6" />
              <blockquote className="font-display text-display-sm md:text-display-md font-medium text-resort-charcoal-text leading-snug italic">
                &ldquo;Our experience at Infinity Resort and Restaurant was unforgettable. The dining
                was exquisite, the infinity pool offered pure relaxation with breathtaking views, and
                our luxurious accommodations provided the perfect blend of comfort and
                elegance.&rdquo;
              </blockquote>
              <div className="mt-8">
                <div className="w-12 h-px bg-resort-gold mx-auto mb-4" />
                <p className="text-sm font-semibold text-resort-charcoal-text">Ananya Iyer</p>
                <p className="text-xs text-resort-muted mt-1">Marketing Manager</p>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="relative h-[60vh] min-h-[400px] flex items-center overflow-hidden">
        <Image
          src={IMAGES.cta}
          alt="Your next escape awaits at Infinity Resort"
          fill
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-resort-charcoal/70" />
        <div className="container-resort relative z-10 text-center">
          <ScrollReveal>
            <h2 className="font-display text-display-md md:text-display-lg font-medium text-white max-w-2xl mx-auto">
              Your Next Escape Awaits
            </h2>
            <p className="mt-4 text-lg text-white/70 max-w-xl mx-auto">
              Come for the stay. Experience the difference.
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
