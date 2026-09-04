import Link from 'next/link';
import { Compass, CalendarCheck, User } from 'lucide-react';

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-resort-sand/80 bg-resort-ivory/95 backdrop-blur">
      <div className="container mx-auto flex h-20 items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="font-serif text-2xl font-bold tracking-wider text-resort-forest">
            THE ROYAL RESERVE
          </span>
          <span className="rounded bg-resort-gold/20 px-2 py-0.5 text-xs font-semibold text-resort-darkwood">
            RESORT & SPA
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex text-sm font-medium text-resort-charcoal">
          <Link href="/rooms" className="transition-colors hover:text-resort-gold">
            Accommodations
          </Link>
          <Link href="/restaurant" className="transition-colors hover:text-resort-gold">
            Dining & Bar
          </Link>
          <Link href="/services" className="transition-colors hover:text-resort-gold">
            Experiences
          </Link>
          <Link href="/attractions" className="transition-colors hover:text-resort-gold">
            Attractions
          </Link>
          <Link href="/gallery" className="transition-colors hover:text-resort-gold">
            Gallery
          </Link>
          <Link href="/contact" className="transition-colors hover:text-resort-gold">
            Contact
          </Link>
        </nav>

        <div className="flex items-center gap-4">
          <Link
            href="/booking"
            className="inline-flex items-center gap-2 rounded bg-resort-forest px-4 py-2 text-sm font-medium text-resort-ivory transition-colors hover:bg-resort-forest-light"
          >
            <CalendarCheck className="h-4 w-4 text-resort-gold" />
            <span>Book Stay</span>
          </Link>
          <Link
            href="/admin/login"
            className="inline-flex items-center gap-1 text-xs text-resort-stone hover:text-resort-forest"
            title="Staff Portal"
          >
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">Portal</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-resort-sand bg-resort-charcoal text-resort-ivory">
      <div className="container mx-auto px-6 py-12">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          <div className="space-y-3">
            <h3 className="font-serif text-lg font-semibold text-resort-gold">The Royal Reserve</h3>
            <p className="text-xs text-resort-stone leading-relaxed">
              An idyllic sanctuary blending pristine natural surroundings with timeless hospitality, fine dining, and bespoke guest experiences.
            </p>
          </div>
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-resort-sand">Guest Services</h4>
            <ul className="space-y-2 text-xs text-resort-sand/80">
              <li>Luxury Villas & Suites</li>
              <li>Signature Multi-Cuisine Dining</li>
              <li>Ayurvedic Wellness Spa</li>
              <li>Curated Nature Safaris</li>
            </ul>
          </div>
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-resort-sand">Quick Links</h4>
            <ul className="space-y-2 text-xs text-resort-sand/80">
              <li><Link href="/rooms" className="hover:text-resort-gold">Rooms & Rates</Link></li>
              <li><Link href="/restaurant" className="hover:text-resort-gold">Restaurant & In-Room Dining</Link></li>
              <li><Link href="/booking" className="hover:text-resort-gold">Direct Reservation</Link></li>
              <li><Link href="/contact" className="hover:text-resort-gold">Location & Contact</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-resort-sand">Contact & Concierge</h4>
            <p className="text-xs text-resort-stone">Direct line: +91 98765 43210</p>
            <p className="text-xs text-resort-stone mt-1">Email: reservations@royalreserve.com</p>
            <div className="mt-4 pt-2 border-t border-white/10 text-xs text-resort-stone">
              Operational Hours: 24/7 Front Desk & Concierge
            </div>
          </div>
        </div>
        <div className="mt-12 border-t border-white/10 pt-6 text-center text-xs text-resort-stone">
          &copy; {new Date().getFullYear()} The Royal Reserve Resort Management System. All rights reserved.
        </div>
      </div>
    </footer>
  );
}