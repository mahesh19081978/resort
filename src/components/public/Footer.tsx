import Link from 'next/link';
import { MapPin, Phone, Mail, Clock } from 'lucide-react';
import { BrandLogo } from '@/components/public/BrandLogo';
import { RESORT } from '@/constants/images';

export function Footer() {
  return (
    <footer className="bg-resort-charcoal text-resort-sand/80">
      <div className="container-resort section-padding !py-16 md:!py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-16">
          <div className="lg:col-span-1">
            <BrandLogo variant="light" linked={false} className="mb-5" />
            <p className="text-sm leading-relaxed text-resort-sand/60">
              A refined resort and restaurant experience in Mhow, offering comfortable accommodation, dining, recreation and hospitality.
            </p>
            <div className="flex gap-3 mt-6">
              <a
                href={RESORT.social.facebook}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-white/5 text-resort-sand/50 hover:bg-resort-gold/20 hover:text-resort-gold transition-colors text-xs"
                aria-label="Facebook"
              >
                f
              </a>
              <a
                href={RESORT.social.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-white/5 text-resort-sand/50 hover:bg-resort-gold/20 hover:text-resort-gold transition-colors text-xs"
                aria-label="Instagram"
              >
                ig
              </a>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.15em] text-white mb-6">
              Quick Links
            </h4>
            <ul className="space-y-3">
              {[
                { href: '/rooms', label: 'Accommodations' },
                { href: '/restaurant', label: 'Dining & Restaurant' },
                { href: '/services', label: 'Experiences' },
                { href: '/attractions', label: 'Attractions' },
                { href: '/gallery', label: 'Gallery' },
                { href: '/contact', label: 'Contact' },
                { href: '/booking', label: 'Book Your Stay' },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm hover:text-resort-gold transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-2">
            <h4 className="text-xs font-semibold uppercase tracking-[0.15em] text-white mb-6">
              Contact & Concierge
            </h4>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-resort-gold mt-0.5 shrink-0" />
                <span className="text-sm">
                  {RESORT.address.street}<br />
                  {RESORT.address.area}, {RESORT.address.city}<br />
                  {RESORT.address.state}
                </span>
              </li>
              <li>
                <a href={`tel:${RESORT.phoneRaw}`} className="flex items-center gap-3 text-sm hover:text-resort-gold transition-colors">
                  <Phone className="h-4 w-4 text-resort-gold shrink-0" />
                  {RESORT.phone}
                </a>
              </li>
              <li>
                <a href={`mailto:${RESORT.email}`} className="flex items-center gap-3 text-sm hover:text-resort-gold transition-colors">
                  <Mail className="h-4 w-4 text-resort-gold shrink-0" />
                  {RESORT.email}
                </a>
              </li>
              <li className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-resort-gold shrink-0" />
                <span className="text-sm">Open {RESORT.hours}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-white/5">
        <div className="container-resort py-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-resort-sand/40">
            &copy; {new Date().getFullYear()} {RESORT.name}. All rights reserved.
          </p>
          <div className="flex gap-6 text-xs text-resort-sand/40">
            <span className="hover:text-resort-gold transition-colors cursor-pointer">Privacy</span>
            <span className="hover:text-resort-gold transition-colors cursor-pointer">Terms</span>
            <span className="hover:text-resort-gold transition-colors cursor-pointer">Sitemap</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
