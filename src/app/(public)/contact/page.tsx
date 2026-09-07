import type { Metadata } from 'next';
import Image from 'next/image';
import { MapPin, Phone, Mail, Clock, Send, Headphones, Car, Plane, Utensils, Star, Heart } from 'lucide-react';
import { IMAGES, RESORT } from '@/constants/images';
import { SectionHeading } from '@/components/public/SectionHeading';
import { ScrollReveal } from '@/components/public/ScrollReveal';
import { ContactForm } from './ContactForm';

export const metadata: Metadata = {
  title: `Contact & Concierge — ${RESORT.shortName}`,
  description: `Get in touch with ${RESORT.shortName}. Our concierge team is available 24/7 to assist with reservations, special requests, and curated experiences.`,
};

const CONCIERGE_SERVICES = [
  { icon: Car, title: 'Airport Transfers', description: 'Luxury sedan and helicopter transfers arranged seamlessly.' },
  { icon: Plane, title: 'Travel Planning', description: 'Bespoke itinerary creation for local excursions and adventures.' },
  { icon: Utensils, title: 'Private Dining', description: 'In-room, lakeside, or forest dining experiences curated for you.' },
  { icon: Star, title: 'Special Occasions', description: 'Birthday, anniversary, and proposal arrangements with floral decor.' },
  { icon: Heart, title: 'Wellness Coordination', description: 'Ayurvedic consultations and spa session bookings.' },
  { icon: Headphones, title: '24/7 Concierge', description: 'Round-the-clock assistance for any request, big or small.' },
];

export default function ContactPage() {
  return (
    <>
      {/* ─── HERO ─── */}
      <section className="relative h-[60vh] min-h-[400px] flex items-center justify-center overflow-hidden">
        <Image
          src={IMAGES.dining.restaurant}
          alt="Contact Infinity Resort"
          fill
          className="object-cover"
          priority
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-resort-charcoal/70" />
        <div className="container-resort relative z-10 text-center">
          <ScrollReveal>
            <SectionHeading
              label="Get in Touch"
              title="Contact & Concierge"
              description="We Are at Your Service"
              light
            />
          </ScrollReveal>
        </div>
      </section>

      {/* ─── CONTACT FORM + INFO ─── */}
      <section className="section-padding">
        <div className="container-resort">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-16">
            {/* ── Left: Contact Form ── */}
            <ScrollReveal direction="left" className="lg:col-span-3">
              <div className="bg-white rounded-2xl shadow-luxury p-8 md:p-10">
                <h3 className="font-display text-2xl font-medium text-resort-charcoal-text mb-2">
                  Send Us a Message
                </h3>
                <p className="text-sm text-resort-muted mb-8">
                  Fill out the form below and our team will respond within 24 hours.
                </p>
                <ContactForm />
              </div>
            </ScrollReveal>

            {/* ── Right: Contact Info ── */}
            <ScrollReveal direction="right" className="lg:col-span-2">
              <div className="space-y-8">
                {/* Address */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-resort-forest/10 flex items-center justify-center">
                    <MapPin className="h-5 w-5 text-resort-forest" />
                  </div>
                  <div>
                    <h4 className="font-display text-base font-medium text-resort-charcoal-text mb-1">
                      Resort Address
                    </h4>
                    <p className="text-sm text-resort-muted leading-relaxed">
                      {RESORT.address.street}<br />
                      {RESORT.address.area}<br />
                      {RESORT.address.city}, {RESORT.address.state}, India
                    </p>
                  </div>
                </div>

                {/* Phone */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-resort-forest/10 flex items-center justify-center">
                    <Phone className="h-5 w-5 text-resort-forest" />
                  </div>
                  <div>
                    <h4 className="font-display text-base font-medium text-resort-charcoal-text mb-1">
                      Phone
                    </h4>
                    <a
                      href={`tel:${RESORT.phoneRaw}`}
                      className="text-sm text-resort-muted hover:text-resort-gold-dark transition-colors"
                    >
                      {RESORT.phone}
                    </a>
                  </div>
                </div>

                {/* Email */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-resort-forest/10 flex items-center justify-center">
                    <Mail className="h-5 w-5 text-resort-forest" />
                  </div>
                  <div>
                    <h4 className="font-display text-base font-medium text-resort-charcoal-text mb-1">
                      Email
                    </h4>
                    <a
                      href={`mailto:${RESORT.email}`}
                      className="text-sm text-resort-muted hover:text-resort-gold-dark transition-colors"
                    >
                      {RESORT.email}
                    </a>
                  </div>
                </div>

                {/* Hours */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-resort-forest/10 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-resort-forest" />
                  </div>
                  <div>
                    <h4 className="font-display text-base font-medium text-resort-charcoal-text mb-1">
                      Operational Hours
                    </h4>
                    <p className="text-sm text-resort-muted">Open {RESORT.hours}</p>
                  </div>
                </div>

                {/* Map Placeholder */}
                <div className="rounded-2xl overflow-hidden border border-resort-sand bg-resort-sand/30 h-48 flex items-center justify-center">
                  <div className="text-center">
                    <MapPin className="h-8 w-8 text-resort-gold mx-auto mb-2" />
                    <p className="text-sm font-medium text-resort-charcoal-text">
                      {RESORT.address.city}, {RESORT.address.state}
                    </p>
                  </div>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ─── CONCIERGE SERVICES ─── */}
      <section className="section-padding bg-resort-charcoal">
        <div className="container-resort">
          <ScrollReveal>
            <SectionHeading
              label="Concierge"
              title="Your Personal Concierge"
              description="Our dedicated concierge team ensures every detail of your stay is effortlessly taken care of."
              light
            />
          </ScrollReveal>

          <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {CONCIERGE_SERVICES.map((service, i) => (
              <ScrollReveal key={service.title} delay={i * 0.08}>
                <div className="group p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-resort-gold/30 hover:bg-white/8 transition-all duration-500">
                  <div className="w-12 h-12 rounded-xl bg-resort-gold/15 flex items-center justify-center mb-4 group-hover:bg-resort-gold/25 transition-colors">
                    <service.icon className="h-5 w-5 text-resort-gold" />
                  </div>
                  <h4 className="font-display text-base font-medium text-resort-ivory mb-2">
                    {service.title}
                  </h4>
                  <p className="text-sm text-resort-sand/60 leading-relaxed">
                    {service.description}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
