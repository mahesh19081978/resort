'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, ChevronRight, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BrandLogo } from '@/components/public/BrandLogo';
import { RESORT } from '@/constants/images';

const NAV_LINKS = [
  { href: '/rooms', label: 'Accommodations' },
  { href: '/restaurant', label: 'Dining & Restaurant' },
  { href: '/services', label: 'Experiences' },
  { href: '/attractions', label: 'Attractions' },
  { href: '/gallery', label: 'Gallery' },
  { href: '/contact', label: 'Contact' },
];

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  return (
    <>
      <header
        className={cn(
          'fixed top-0 left-0 right-0 z-50 transition-all duration-500',
          scrolled
            ? 'bg-resort-ivory/95 backdrop-blur-md shadow-luxury border-b border-resort-sand/50'
            : 'bg-transparent'
        )}
      >
        <div className="container-resort flex items-center justify-between h-20 md:h-24">
          <div className="lg:hidden">
            <BrandLogo variant={scrolled ? 'dark' : 'light'} size="compact" linked={false} />
          </div>
          <div className="hidden lg:block">
            <BrandLogo variant={scrolled ? 'dark' : 'light'} />
          </div>

          <nav className="hidden lg:flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'px-4 py-2 text-sm font-medium transition-colors duration-300 rounded-full',
                  scrolled
                    ? 'text-resort-charcoal-text hover:text-resort-gold-dark hover:bg-resort-gold/10'
                    : 'text-white/90 hover:text-white hover:bg-white/10'
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            <a
              href={`tel:${RESORT.phoneRaw}`}
              className={cn(
                'hidden md:inline-flex items-center gap-2 text-sm font-medium transition-colors',
                scrolled ? 'text-resort-charcoal-text hover:text-resort-forest' : 'text-white/80 hover:text-white'
              )}
            >
              <Phone className="h-4 w-4" />
              {RESORT.phone}
            </a>
            <Link
              href="/booking"
              className={cn(
                'hidden md:inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-full transition-all duration-300',
                scrolled
                  ? 'bg-resort-forest text-white hover:bg-resort-forest-light'
                  : 'bg-white/15 text-white border border-white/30 hover:bg-white/25 backdrop-blur-sm'
              )}
            >
              Book Your Stay
            </Link>

            <button
              onClick={() => setMobileOpen(true)}
              className={cn(
                'lg:hidden p-2 rounded-full transition-colors',
                scrolled
                  ? 'text-resort-charcoal-text hover:bg-resort-sand'
                  : 'text-white hover:bg-white/10'
              )}
              aria-label="Open menu"
            >
              <Menu className="h-6 w-6" />
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]"
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed top-0 right-0 bottom-0 w-[85vw] max-w-sm bg-resort-ivory z-[70] flex flex-col"
            >
              <div className="flex items-center justify-between p-6 border-b border-resort-sand">
                <BrandLogo variant="dark" linked={false} />
                <button
                  onClick={() => setMobileOpen(false)}
                  className="p-2 rounded-full hover:bg-resort-sand text-resort-charcoal-text"
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <nav className="flex-1 py-6">
                {NAV_LINKS.map((link, i) => (
                  <motion.div
                    key={link.href}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + i * 0.05 }}
                  >
                    <Link
                      href={link.href}
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center justify-between px-6 py-4 text-lg font-display text-resort-charcoal-text hover:bg-resort-sand/50 hover:text-resort-gold-dark transition-colors"
                    >
                      {link.label}
                      <ChevronRight className="h-4 w-4 text-resort-muted" />
                    </Link>
                  </motion.div>
                ))}
              </nav>

              <div className="p-6 border-t border-resort-sand">
                <a
                  href={`tel:${RESORT.phoneRaw}`}
                  className="flex items-center justify-center gap-2 mb-3 text-sm text-resort-forest font-semibold"
                >
                  <Phone className="h-4 w-4" />
                  {RESORT.phone}
                </a>
                <Link
                  href="/booking"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-center w-full py-3.5 bg-resort-forest text-white font-semibold rounded-full hover:bg-resort-forest-light transition-colors"
                >
                  Book Your Stay
                </Link>
                <Link
                  href="/admin/login"
                  onClick={() => setMobileOpen(false)}
                  className="block mt-3 text-center text-xs text-resort-muted hover:text-resort-forest transition-colors"
                >
                  Staff Portal
                </Link>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
