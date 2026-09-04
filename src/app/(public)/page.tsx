import Link from 'next/link';
import { Calendar, Users, ArrowRight, ShieldCheck, Sparkles, Utensils, BedDouble } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  return (
    <div>
      {/* Hero Banner */}
      <section className="relative overflow-hidden bg-resort-forest py-24 text-resort-ivory">
        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-2xl">
            <span className="inline-block rounded bg-resort-gold/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-resort-gold mb-4">
              Luxury Wilderness & Heritage
            </span>
            <h1 className="font-serif text-4xl sm:text-5xl md:text-6xl font-normal leading-tight tracking-tight">
              An Exquisite Sanctuary for the Discerning Traveler.
            </h1>
            <p className="mt-6 text-base sm:text-lg text-resort-sand/90 font-light leading-relaxed">
              Nestled between untamed canopy forests and crystalline waters, The Royal Reserve offers secluded chalets, farm-to-table culinary journeys, and world-class hospitality.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <Link href="/booking">
                <Button variant="secondary" size="lg" className="flex items-center gap-2">
                  <span>Explore Accommodations</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/restaurant">
                <Button variant="outline" size="lg" className="border-resort-sand text-resort-ivory hover:bg-white/10">
                  <span>Fine Dining & KOT</span>
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-resort-gold/10 blur-3xl" />
      </section>

      {/* Booking Quick Engine Bar */}
      <section className="relative -mt-8 z-20 container mx-auto px-6">
        <div className="rounded-lg bg-white p-6 shadow-xl border border-resort-sand">
          <form action="/booking" method="GET" className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-resort-stone mb-1">
                Check-In Date
              </label>
              <input
                type="date"
                name="checkIn"
                defaultValue={new Date().toISOString().split('T')[0]}
                className="w-full rounded border border-resort-sand p-2 text-sm text-resort-charcoal focus:ring-1 focus:ring-resort-gold focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-resort-stone mb-1">
                Check-Out Date
              </label>
              <input
                type="date"
                name="checkOut"
                defaultValue={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
                className="w-full rounded border border-resort-sand p-2 text-sm text-resort-charcoal focus:ring-1 focus:ring-resort-gold focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-resort-stone mb-1">
                Guests (Adults)
              </label>
              <select
                name="adults"
                defaultValue="2"
                className="w-full rounded border border-resort-sand p-2 text-sm text-resort-charcoal focus:ring-1 focus:ring-resort-gold focus:outline-none"
              >
                <option value="1">1 Adult</option>
                <option value="2">2 Adults</option>
                <option value="3">3 Adults</option>
                <option value="4">4 Adults</option>
              </select>
            </div>
            <div>
              <Button type="submit" className="w-full h-10">
                Check Availability
              </Button>
            </div>
          </form>
        </div>
      </section>

      {/* Hospitality Features */}
      <section className="container mx-auto px-6 py-20">
        <div className="text-center max-w-xl mx-auto mb-16">
          <span className="text-xs font-semibold uppercase tracking-widest text-resort-gold">
            Bespoke Resort Amenities
          </span>
          <h2 className="mt-2 font-serif text-3xl font-semibold text-resort-charcoal">
            Unrivaled Hospitality and Comfort
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="p-8 rounded-lg bg-white border border-resort-sand text-center space-y-4">
            <div className="inline-flex p-4 rounded-full bg-resort-sand/50 text-resort-forest">
              <BedDouble className="h-6 w-6" />
            </div>
            <h3 className="font-serif text-xl font-medium text-resort-charcoal">Heritage Villas & Chalets</h3>
            <p className="text-sm text-resort-stone leading-relaxed">
              Designed with authentic regional architecture, private balconies, and immersive natural views.
            </p>
          </div>

          <div className="p-8 rounded-lg bg-white border border-resort-sand text-center space-y-4">
            <div className="inline-flex p-4 rounded-full bg-resort-sand/50 text-resort-forest">
              <Utensils className="h-6 w-6" />
            </div>
            <h3 className="font-serif text-xl font-medium text-resort-charcoal">The Spice Pavilion Restaurant</h3>
            <p className="text-sm text-resort-stone leading-relaxed">
              Dine-in, in-room service, and live garden bar powered by modern kitchen display and table management.
            </p>
          </div>

          <div className="p-8 rounded-lg bg-white border border-resort-sand text-center space-y-4">
            <div className="inline-flex p-4 rounded-full bg-resort-sand/50 text-resort-forest">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h3 className="font-serif text-xl font-medium text-resort-charcoal">Express Check-In & PMS</h3>
            <p className="text-sm text-resort-stone leading-relaxed">
              Streamlined guest verification, live digital billing folios, and touchless transaction management.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}