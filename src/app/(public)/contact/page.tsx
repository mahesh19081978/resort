import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { MapPin, Phone, Mail, Clock, ArrowRight, ExternalLink } from 'lucide-react';
import { IMAGES, RESORT } from '@/constants/images';
import { ScrollReveal } from '@/components/public/ScrollReveal';
import { ContactForm } from './ContactForm';

export const metadata: Metadata = {
  title: 'Contact Infinity Resort & Restaurant | Mhow, Madhya Pradesh',
  description:
    'Contact Infinity Resort & Restaurant in Mhow, Madhya Pradesh for room reservations, dining, events and general enquiries. Find our location and directions.',
};

const DIRECTIONS_URL =
  'https://www.google.com/maps/search/?api=1&query=Infinity+Resort+%26+Restaurant+Mhow';

export default function ContactPage() {
  return (
    <>
      {/* ─── 1. HERO ─── */}
      <section className="relative h-[420px] md:h-[460px] flex items-center overflow-hidden">
        <Image
          src={IMAGES.hero.main}
          alt="Infinity Resort & Restaurant"
          fill
          className="object-cover"
          priority
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-resort-charcoal/80 via-resort-charcoal/50 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-resort-charcoal/40 via-transparent to-transparent" />

        <div className="container-resort relative z-10">
          <ScrollReveal>
            <span className="inline-block text-xs font-semibold uppercase tracking-[0.25em] text-resort-gold-light mb-4">
              Get in Touch
            </span>
          </ScrollReveal>
          <ScrollReveal delay={0.1}>
            <h1 className="font-display text-display-md md:text-display-lg font-medium text-white max-w-2xl leading-[1.1]">
              Contact Infinity Resort
            </h1>
          </ScrollReveal>
          <ScrollReveal delay={0.2}>
            <p className="mt-4 text-base md:text-lg text-white/70 max-w-xl leading-relaxed">
              Contact us for reservations, dining, events and general enquiries.
            </p>
          </ScrollReveal>
          <ScrollReveal delay={0.3}>
            <p className="mt-2 text-sm text-white/50 max-w-lg leading-relaxed">
              Whether you&apos;re planning a stay, dining with us, organising an event, or simply need
              directions, our team is happy to assist.
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* ─── 2. CONTACT INFO + ENQUIRY FORM ─── */}
      <section className="section-padding">
        <div className="container-resort">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">
            {/* ── Left: Contact Information (~42%) ── */}
            <ScrollReveal direction="left" className="lg:col-span-5">
              <div>
                <span className="inline-block text-xs font-semibold uppercase tracking-[0.2em] text-resort-gold mb-3">
                  Get in Touch
                </span>
                <div className="gold-line-wide mb-6" />
                <h2 className="font-display text-display-sm font-medium text-resort-charcoal-text mb-4">
                  We&apos;re Here to Help
                </h2>
                <p className="text-sm text-resort-muted leading-relaxed mb-10">
                  We&apos;re here to help with your stay, dining experience, celebrations and other
                  enquiries.
                </p>

                <div className="space-y-6">
                  {/* Visit Us */}
                  <div className="flex gap-4">
                    <MapPin className="h-4 w-4 text-resort-gold mt-1 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-resort-muted mb-1.5">
                        Visit Us
                      </p>
                      <p className="text-sm text-resort-charcoal-text leading-relaxed">
                        {RESORT.name}<br />
                        {RESORT.address.street},<br />
                        {RESORT.address.area},<br />
                        {RESORT.address.city}, {RESORT.address.state}, India
                      </p>
                    </div>
                  </div>

                  <div className="h-px bg-resort-sand" />

                  {/* Call Us */}
                  <div className="flex gap-4">
                    <Phone className="h-4 w-4 text-resort-gold mt-1 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-resort-muted mb-1.5">
                        Call Us
                      </p>
                      <a
                        href={`tel:${RESORT.phoneRaw}`}
                        className="text-sm text-resort-charcoal-text hover:text-resort-gold-dark transition-colors"
                      >
                        {RESORT.phone}
                      </a>
                    </div>
                  </div>

                  <div className="h-px bg-resort-sand" />

                  {/* Email Us */}
                  <div className="flex gap-4">
                    <Mail className="h-4 w-4 text-resort-gold mt-1 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-resort-muted mb-1.5">
                        Email Us
                      </p>
                      <a
                        href={`mailto:${RESORT.email}`}
                        className="text-sm text-resort-charcoal-text hover:text-resort-gold-dark transition-colors break-all"
                      >
                        {RESORT.email}
                      </a>
                    </div>
                  </div>

                  <div className="h-px bg-resort-sand" />

                  {/* Opening Hours */}
                  <div className="flex gap-4">
                    <Clock className="h-4 w-4 text-resort-gold mt-1 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-resort-muted mb-1.5">
                        Opening Hours
                      </p>
                      <div className="space-y-1 text-sm text-resort-charcoal-text">
                        <p>Open {RESORT.hours}</p>
                        <p>Restaurant: 7:00 AM – 11:00 PM</p>
                        <p>Check-in: 12:00 PM</p>
                        <p>Check-out: 10:00 AM</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="flex flex-wrap gap-3 mt-10">
                  <a
                    href={`tel:${RESORT.phoneRaw}`}
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-resort-forest text-resort-ivory font-semibold rounded-full hover:bg-resort-forest-light transition-all duration-300 text-sm"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    Call Us
                  </a>
                  <a
                    href={`mailto:${RESORT.email}`}
                    className="inline-flex items-center gap-2 px-6 py-2.5 border border-resort-forest text-resort-forest font-semibold rounded-full hover:bg-resort-sand transition-all duration-300 text-sm"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    Email Us
                  </a>
                  <a
                    href={DIRECTIONS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-6 py-2.5 border border-resort-sand text-resort-charcoal-text font-semibold rounded-full hover:bg-resort-sand transition-all duration-300 text-sm"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Get Directions
                  </a>
                </div>
              </div>
            </ScrollReveal>

            {/* ── Right: Enquiry Form (~58%) ── */}
            <ScrollReveal direction="right" className="lg:col-span-7">
              <div>
                <span className="inline-block text-xs font-semibold uppercase tracking-[0.2em] text-resort-gold mb-3">
                  Enquiry
                </span>
                <div className="gold-line-wide mb-6" />
                <h2 className="font-display text-display-sm font-medium text-resort-charcoal-text mb-4">
                  Send Us an Enquiry
                </h2>
                <p className="text-sm text-resort-muted leading-relaxed mb-10">
                  Have a question about your stay, dining, celebrations or events? Send us a message
                  and our team will be happy to assist.
                </p>
                <ContactForm />
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ─── 3. FULL-WIDTH GOOGLE MAP ─── */}
      <section className="bg-white">
        <div className="container-resort pt-4 pb-8 md:pt-6 md:pb-12">
          <ScrollReveal>
            <div className="text-center mb-8">
              <span className="inline-block text-xs font-semibold uppercase tracking-[0.2em] text-resort-gold mb-3">
                Find Us
              </span>
              <h2 className="font-display text-display-sm font-medium text-resort-charcoal-text mb-3">
                Our Location
              </h2>
              <p className="text-sm text-resort-muted max-w-lg mx-auto leading-relaxed">
                Located on Mandleshwar Road in Mhow, Infinity Resort &amp; Restaurant is easy to find
                and conveniently positioned for exploring the region.
              </p>
            </div>
          </ScrollReveal>

          <ScrollReveal>
            <div className="rounded-2xl overflow-hidden shadow-luxury h-[350px] md:h-[450px] lg:h-[500px]">
              <iframe
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3685.9116615105486!2d75.75170037689035!3d22.50749733535028!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3962f700588fb82b%3A0xc4a16a101b7ae23b!2sInfinity%20Resort%20%26%20Restaurant!5e0!3m2!1sen!2sin!4v1788794038129!5m2!1sen!2sin"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                title="Infinity Resort & Restaurant location map"
              />
            </div>
          </ScrollReveal>

          <ScrollReveal>
            <div className="mt-6 text-center">
              <a
                href={DIRECTIONS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-resort-forest text-resort-ivory font-semibold rounded-full hover:bg-resort-forest-light transition-all duration-300 text-sm"
              >
                Get Directions
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ─── 4. FINAL RESORT CTA ─── */}
      <section className="relative py-16 md:py-20 overflow-hidden">
        <Image
          src={IMAGES.hero.secondary}
          alt=""
          fill
          className="object-cover"
          sizes="100vw"
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-resort-charcoal/75" />

        <div className="container-resort relative z-10 text-center">
          <ScrollReveal>
            <span className="inline-block text-xs font-semibold uppercase tracking-[0.25em] text-resort-gold-light mb-4">
              Ready to Plan Your Stay?
            </span>
            <h2 className="font-display text-display-sm md:text-display-md font-medium text-white max-w-xl mx-auto">
              Your Stay Awaits
            </h2>
            <p className="mt-3 text-white/60 max-w-md mx-auto text-sm leading-relaxed">
              Explore our rooms and find the right accommodation for your visit to Mhow.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/rooms"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-resort-gold text-resort-charcoal-text font-semibold rounded-full hover:bg-resort-gold-light transition-all duration-300 text-sm"
              >
                Explore Rooms
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/rooms/availability"
                className="inline-flex items-center gap-2 px-8 py-3.5 border border-white/30 text-white font-semibold rounded-full hover:bg-white/10 transition-all duration-300 text-sm"
              >
                Check Availability
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Social Links */}
            <div className="mt-10 flex items-center justify-center gap-4">
              {RESORT.social.facebook && (
                <a
                  href={RESORT.social.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/40 hover:text-resort-gold transition-colors"
                  aria-label="Follow us on Facebook"
                >
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                </a>
              )}
              {RESORT.social.instagram && (
                <a
                  href={RESORT.social.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/40 hover:text-resort-gold transition-colors"
                  aria-label="Follow us on Instagram"
                >
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24.009 12.017 24.009c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641 0 12.017 0z" />
                  </svg>
                </a>
              )}
            </div>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
