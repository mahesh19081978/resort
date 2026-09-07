import { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Clock, Star, Leaf, Flame, Wine } from 'lucide-react';
import { IMAGES, RESORT } from '@/constants/images';
import { SectionHeading } from '@/components/public/SectionHeading';
import { ScrollReveal } from '@/components/public/ScrollReveal';

export const metadata: Metadata = {
  title: 'Dining & Restaurant',
  description:
    'Savour every moment at Infinity Resort Restaurant — local specialties, Indian favourites and continental dishes prepared with fresh, locally sourced ingredients.',
};

const MENU_HIGHLIGHTS = [
  {
    title: 'Indian Specialties',
    icon: Flame,
    items: [
      'Tandoori Lamb Chops',
      'Paneer Tikka Masala',
      'Wild Mushroom Biryani',
      'Kerala Fish Curry',
    ],
  },
  {
    title: 'Continental',
    icon: Leaf,
    items: [
      'Herb-Crusted Rack of Lamb',
      'Pan-Seared Salmon',
      'Truffle Mushroom Risotto',
      'Grilled Tenderloin Steak',
    ],
  },
  {
    title: 'Local Favourites',
    icon: Star,
    items: [
      'Indori Poha',
      'Bhopali Gosht Korma',
      'Dal Bafla',
      'Jalebi with Rabdi',
    ],
  },
  {
    title: 'Beverages & Cocktails',
    icon: Wine,
    items: [
      'Signature Forest Sour',
      'Mango & Basil Mojito',
      'Curated Wine Selection',
      'Artisan Coffee & Teas',
    ],
  },
];

const DINING_EXPERIENCES = [
  {
    title: 'Restaurant',
    description:
      'Our main dining space serves a carefully curated menu from morning to evening in an elegant yet relaxed setting.',
    time: '7:00 AM – 11:00 PM',
    image: IMAGES.dining.restaurant,
  },
  {
    title: 'Poolside Dining',
    description:
      'Enjoy light meals, fresh juices and cocktails served right beside the infinity pool with scenic views.',
    time: '11:00 AM – 8:00 PM',
    image: IMAGES.dining.bar,
  },
  {
    title: 'Outdoor & Terrace Dining',
    description:
      'Al fresco dining under the open sky, surrounded by the natural beauty of Mhow\'s lush landscape.',
    time: '12:00 PM – 10:00 PM',
    image: IMAGES.dining.food1,
  },
  {
    title: 'Room Service',
    description:
      'Enjoy the full restaurant menu from the comfort and privacy of your room, available throughout the day.',
    time: '24 Hours',
    image: IMAGES.dining.food2,
  },
];

export default function RestaurantPage() {
  return (
    <>
      {/* ─── HERO ─── */}
      <section className="relative h-[70vh] min-h-[480px] flex items-center overflow-hidden">
        <Image
          src={IMAGES.dining.restaurant}
          alt="Infinity Resort Restaurant"
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
              Dining & Restaurant
            </h1>
          </ScrollReveal>
          <ScrollReveal delay={0.3}>
            <p className="mt-6 text-lg md:text-xl text-white/70 max-w-xl font-light leading-relaxed">
              Savour Every Moment
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* ─── EDITORIAL INTRODUCTION ─── */}
      <section className="section-padding">
        <div className="container-resort">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <ScrollReveal direction="left">
              <div className="grid grid-rows-2 gap-4">
                <div className="relative rounded-2xl overflow-hidden shadow-luxury aspect-[16/9]">
                  <Image
                    src={IMAGES.dining.food1}
                    alt="Signature Indian cuisine"
                    fill
                    className="object-cover"
                    sizes="(max-width: 1024px) 100vw, 50vw"
                  />
                </div>
                <div className="relative rounded-2xl overflow-hidden shadow-luxury aspect-[16/9]">
                  <Image
                    src={IMAGES.dining.food2}
                    alt="Continental dishes"
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
                  Our Philosophy
                </span>
                <div className="gold-line-wide mt-4 mb-6" />
                <h2 className="font-display text-display-sm md:text-display-md font-medium text-resort-charcoal-text leading-tight">
                  The Art of Good Taste
                </h2>
                <p className="mt-6 text-base text-resort-muted leading-relaxed">
                  At Infinity Resort and Restaurant, dining is an experience. Our restaurant serves a
                  carefully curated menu featuring local specialties, Indian favourites and continental
                  dishes, all prepared with fresh, locally sourced ingredients.
                </p>
                <Link
                  href="/contact"
                  className="inline-flex items-center gap-2 mt-8 text-sm font-semibold text-resort-gold-dark hover:text-resort-forest transition-colors group"
                >
                  Reserve a Table
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ─── MENU HIGHLIGHTS ─── */}
      <section className="section-padding bg-resort-sand/40">
        <div className="container-resort">
          <ScrollReveal>
            <SectionHeading
              label="What We Serve"
              title="Menu Highlights"
              description="A curated selection from our kitchen, spanning bold Indian flavours, refined continental classics and local favourites."
            />
          </ScrollReveal>

          <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {MENU_HIGHLIGHTS.map((cat, i) => (
              <ScrollReveal key={cat.title} delay={i * 0.1}>
                <div className="p-6 rounded-2xl bg-white shadow-luxury hover:shadow-luxury-lg transition-all duration-300 h-full">
                  <div className="w-10 h-10 rounded-xl bg-resort-gold/10 flex items-center justify-center mb-4">
                    <cat.icon className="h-5 w-5 text-resort-gold" />
                  </div>
                  <h3 className="font-display text-lg font-medium text-resort-charcoal-text mb-4">
                    {cat.title}
                  </h3>
                  <ul className="space-y-2.5">
                    {cat.items.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-resort-muted">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-resort-gold/60 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── DINING EXPERIENCES ─── */}
      <section className="section-padding">
        <div className="container-resort">
          <ScrollReveal>
            <SectionHeading
              label="Experiences"
              title="Dining Your Way"
              description="From elegant restaurant dinners to casual poolside sips, there is a setting for every occasion."
            />
          </ScrollReveal>

          <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {DINING_EXPERIENCES.map((exp, i) => (
              <ScrollReveal key={exp.title} delay={i * 0.1}>
                <div className="group rounded-2xl overflow-hidden bg-white shadow-luxury hover:shadow-luxury-lg transition-all duration-500 h-full flex flex-col">
                  <div className="relative h-48 overflow-hidden">
                    <Image
                      src={exp.image}
                      alt={exp.title}
                      fill
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                      sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                  </div>
                  <div className="p-5 flex flex-col flex-1">
                    <h3 className="font-display text-lg font-medium text-resort-charcoal-text mb-2">
                      {exp.title}
                    </h3>
                    <p className="text-sm text-resort-muted leading-relaxed mb-4 flex-1">
                      {exp.description}
                    </p>
                    <div className="flex items-center gap-1.5 text-xs text-resort-muted pt-3 border-t border-resort-sand/50">
                      <Clock className="h-3.5 w-3.5 text-resort-gold" />
                      {exp.time}
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── RESERVATION CTA ─── */}
      <section className="relative h-[60vh] min-h-[400px] flex items-center overflow-hidden">
        <Image
          src={IMAGES.dining.restaurant}
          alt="Reserve your table at Infinity Resort Restaurant"
          fill
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-resort-charcoal/70" />
        <div className="container-resort relative z-10 text-center">
          <ScrollReveal>
            <span className="inline-block text-xs font-semibold uppercase tracking-[0.25em] text-resort-gold-light mb-4">
              Join Us
            </span>
            <h2 className="font-display text-display-md md:text-display-lg font-medium text-white max-w-2xl mx-auto">
              Reserve Your Table
            </h2>
            <p className="mt-4 text-white/60 max-w-lg mx-auto">
              Whether it is an intimate dinner for two or a celebration with loved ones, we would love to
              welcome you.
            </p>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 mt-10 px-10 py-4 bg-resort-gold text-resort-charcoal-text font-semibold rounded-full hover:bg-resort-gold-light transition-all duration-300 hover:shadow-gold text-lg"
            >
              Reserve Your Table
              <ArrowRight className="h-5 w-5" />
            </Link>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
