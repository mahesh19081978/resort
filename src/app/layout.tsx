import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'The Royal Reserve | Luxury Resort & Hotel Management System',
  description: 'Enterprise luxury resort, fine dining restaurant, PMS, POS, and inventory management system.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased bg-resort-ivory text-resort-charcoal">
        {children}
      </body>
    </html>
  );
}