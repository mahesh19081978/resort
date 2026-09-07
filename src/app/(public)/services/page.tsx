import { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Quote } from 'lucide-react';
import { IMAGES, RESORT } from '@/constants/images';
import { SectionHeading } from '@/components/public/SectionHeading';
import { ScrollReveal } from '@/components/public/ScrollReveal';
import { ExperienceCard } from '@/components/public/ExperienceCard';

export const metadata: Metadata = {
  title: `Experiences — ${RESORT.shortName}`,
  description: `Discover curated experiences at ${RESORT.shortName} — from relaxing by the infinity pool to exploring nearby natural wonders.`,
};

export default function ExperiencesPage() {
  return (
    <>
      {/* ─── HERO ─── */}
      <section className="relative h-[70vh] min-h-[480px] flex items-center overflow-hidden">
        <Image
          src={IMAGES.hero.experiences}
          alt="Infinity Resort experiences"
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
              Curated for You
            </span>
          </ScrollReveal>
          <ScrollReveal delay={0.15}>
            <h1 className="font-display text-display-lg md:text-display-xl font-medium text-white max-w-3xl leading-[1.05]">
              Experiences
            </h1>
          </ScrollReveal>
          <ScrollReveal delay={0.3}>
            <p className="mt-6 text-lg md:text-xl text-white/70 max-w-xl font-light leading-relaxed">
              Moments Worth Remembering
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
                label="Our Philosophy"
                title="Crafted with Intention"
              />
            </ScrollReveal>
            <ScrollReveal delay={0.2}>
              <p className="text-lg md:text-xl text-resort-charcoal-text leading-relaxed mt-8">
                Every experience at Infinity Resort is designed to connect you with our beautiful
                surroundings. From relaxing by the infinity pool to exploring nearby natural wonders,
                we offer something for every guest.
              </p>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ─── EXPERIENCES GRID ─── */}
      <section className="section-padding bg-resort-sand/40">
        <div className="container-resort">
          <ScrollReveal>
            <SectionHeading
              label="What Awaits"
              title="Signature Experiences"
              description="Six pillars of unforgettable moments, each rooted in the beauty and culture of our surroundings."
            />
          </ScrollReveal>

          <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {IMAGES.experiences.map((exp, index) => (
              <ScrollReveal key={exp.id} delay={index * 0.1}>
                <ExperienceCard experience={exp} />
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── TESTIMONIAL ─── */}
      <section className="section-padding bg-resort-charcoal relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-64 h-64 rounded-full bg-resort-gold blur-3xl" />
          <div className="absolute bottom-10 right-10 w-96 h-96 rounded-full bg-resort-gold blur-3xl" />
        </div>
        <div className="container-resort relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <ScrollReveal>
              <Quote className="h-10 w-10 text-resort-gold/40 mx-auto mb-6" />
              <blockquote className="font-display text-2xl md:text-4xl italic leading-relaxed text-resort-gold-light">
                &ldquo;{RESORT.shortName} and Restaurant exceeded all expectations! The gourmet dining
                with scenic views was incredible, the infinity pool offered a tranquil escape, and our
                spacious room was the perfect retreat.&rdquo;
              </blockquote>
            </ScrollReveal>
            <ScrollReveal delay={0.2}>
              <div className="mt-10">
                <p className="text-lg text-white/80">— Aarav Sharma, Software Engineer</p>
                <div className="flex justify-center gap-1 mt-3">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} className="w-5 h-5 text-resort-gold" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="section-padding bg-gradient-to-br from-resort-charcoal to-resort-forest">
        <div className="container-resort">
          <div className="max-w-3xl mx-auto text-center">
            <ScrollReveal>
              <SectionHeading
                label="Something Special"
                title="Create Your Own Experience"
                description="Our concierge team specializes in crafting bespoke experiences tailored to your interests, celebrations, and group sizes."
                light
              />
            </ScrollReveal>
            <ScrollReveal delay={0.2}>
              <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-resort-gold text-resort-charcoal-text font-semibold rounded-full hover:bg-resort-gold-light transition-colors duration-300 shadow-gold"
                >
                  Contact Our Concierge
                </Link>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>
    </>
  );
}
