import type { Metadata } from 'next';
import './globals.css';
import { RESORT } from '@/constants/images';

export const metadata: Metadata = {
  title: {
    default: `${RESORT.shortName} | ${RESORT.address.city}`,
    template: `%s | ${RESORT.shortName}`,
  },
  description: `Experience comfortable stays, dining, recreation and memorable hospitality at ${RESORT.name} in ${RESORT.address.city}, ${RESORT.address.state}. Book your stay directly for the best rates.`,
  keywords: [
    'resort in mhow',
    'hotel in mhow',
    'infinity resort',
    'resort restaurant mhow',
    'luxury resort madhya pradesh',
    'accommodation mhow',
    'pool resort mhow',
    'weekend getaway mhow',
    'restaurant mhow',
    'party lawn mhow',
  ],
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    siteName: RESORT.name,
    title: `${RESORT.shortName} | ${RESORT.address.city}`,
    description: `Experience comfortable stays, dining, recreation and memorable hospitality at ${RESORT.name} in ${RESORT.address.city}, ${RESORT.address.state}.`,
    images: [{ url: '/images/resort/hero-1.jpg', width: 1200, height: 630 }],
  },
  metadataBase: new URL(RESORT.website),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-resort-ivory text-resort-charcoal-text font-body antialiased">
        {children}
      </body>
    </html>
  );
}
