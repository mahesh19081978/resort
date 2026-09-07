import { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { MapPin, Phone, Clock, Compass, Star } from 'lucide-react';
import { IMAGES, RESORT } from '@/constants/images';
import { SectionHeading } from '@/components/public/SectionHeading';
import { ScrollReveal } from '@/components/public/ScrollReveal';
import { AttractionCard } from '@/components/public/AttractionCard';

export const metadata: Metadata = {
  title: `Discover — ${RESORT.shortName}`,
  description: `Explore the extraordinary destinations surrounding ${RESORT.shortName} — ancient forts, sacred temples, waterfalls, and cultural heritage.`,
};

export default function DiscoverPage() {
  return (
    <>
      {/* ─── HERO ─── */}
      <section className="relative h-[70vh] min-h-[480px] flex items-center overflow-hidden">
        <Image
          src={IMAGES.hero.attractions}
          alt="Stunning landscape near Infinity Resort"
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
              Beyond the Resort
            </span>
          </ScrollReveal>
          <ScrollReveal delay={0.15}>
            <h1 className="font-display text-display-lg md:text-display-xl font-medium text-white max-w-3xl leading-[1.05]">
              Discover
            </h1>
          </ScrollReveal>
          <ScrollReveal delay={0.3}>
            <p className="mt-6 text-lg md:text-xl text-white/70 max-w-xl font-light leading-relaxed">
              Explore the Extraordinary
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* ─── EDITORIAL INTRO ─── */}
      <section className="section-padding">
        <div className="container-resort">
          <div className="max-w-3xl mx-auto text-center">
            <ScrollReveal>
              <SectionHeading
                label="The Surroundings"
                title="A World Waiting to Be Explored"
              />
            </ScrollReveal>
            <ScrollReveal delay={0.2}>
              <p className="text-lg md:text-xl text-resort-charcoal-text leading-relaxed mt-8">
                Beyond the resort, Mhow and its surroundings offer a wealth of natural beauty and
                cultural heritage. From cascading waterfalls to ancient temples, every direction
                holds a new wonder.
              </p>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ─── ATTRACTIONS GRID ─── */}
      <section className="section-padding bg-resort-sand/40">
        <div className="container-resort">
          <ScrollReveal>
            <SectionHeading
              label="Featured Destinations"
              title="Nearby Attractions"
              description="Handpicked destinations that define the character of our region."
            />
          </ScrollReveal>

          <div className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-8">
            {IMAGES.attractions.map((attraction, index) => (
              <ScrollReveal key={attraction.id} delay={index * 0.12}>
                <AttractionCard attraction={attraction} />
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── DISTANCE OVERVIEW ─── */}
      <section className="section-padding">
        <div className="container-resort">
          <ScrollReveal>
            <SectionHeading
              label="Getting There"
              title="Distance & Accessibility"
              description="All attractions are within comfortable reach of the resort."
            />
          </ScrollReveal>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-12">
            {[
              { icon: MapPin, name: 'Patalpani Waterfall' },
              { icon: Compass, name: 'Mandu Fort' },
              { icon: Star, name: 'Omkareshwar' },
              { icon: Clock, name: 'Maheshwar' },
            ].map((item, i) => (
              <ScrollReveal key={item.name} delay={i * 0.1}>
                <div className="bg-white rounded-2xl p-6 text-center shadow-luxury hover:shadow-luxury-lg transition-all duration-300 border border-resort-sand/30">
                  <div className="w-12 h-12 rounded-full bg-resort-gold/15 flex items-center justify-center mx-auto mb-4">
                    <item.icon className="h-5 w-5 text-resort-gold-dark" />
                  </div>
                  <h3 className="font-display text-lg font-medium text-resort-charcoal-text mb-1">
                    {item.name}
                  </h3>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PLAN YOUR EXCURSION ─── */}
      <section className="section-padding bg-resort-charcoal relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-80 h-80 rounded-full bg-resort-gold blur-3xl" />
          <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full bg-resort-gold blur-3xl" />
        </div>
        <div className="container-resort relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <ScrollReveal>
              <SectionHeading
                label="Concierge Services"
                title="Plan Your Excursion"
                description="Our concierge team can arrange excursions to any of these destinations. Contact us to plan your adventure."
                light
              />
            </ScrollReveal>
            <ScrollReveal delay={0.2}>
              <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-resort-gold text-resort-charcoal-text font-semibold rounded-full hover:bg-resort-gold-light transition-colors duration-300 shadow-gold"
                >
                  <Compass className="h-5 w-5" />
                  Request an Itinerary
                </Link>
                <Link
                  href={`tel:${RESORT.phoneRaw}`}
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 border-2 border-white/30 text-white font-semibold rounded-full hover:border-white/60 hover:bg-white/10 transition-all duration-300"
                >
                  <Phone className="h-5 w-5" />
                  Call Concierge
                </Link>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>
    </>
  );
}
