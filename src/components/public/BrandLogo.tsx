import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface BrandLogoProps {
  variant?: 'light' | 'dark';
  size?: 'default' | 'compact';
  className?: string;
  linked?: boolean;
}

export function BrandLogo({ variant = 'dark', size = 'default', className, linked = true }: BrandLogoProps) {
  const logoSrc = '/images/branding/infinity-resort-logo.png';

  const image = (
    <Image
      src={logoSrc}
      alt="Infinity Resort and Restaurant"
      width={size === 'compact' ? 160 : 240}
      height={size === 'compact' ? 44 : 64}
      className={cn(
        'w-auto object-contain',
        size === 'compact' ? 'h-11' : 'h-16',
        variant === 'dark' && 'brightness-0'
      )}
      priority
    />
  );

  const content = (
    <div className={cn('flex items-center', className)}>
      {image}
    </div>
  );

  if (linked) {
    return <Link href="/">{content}</Link>;
  }

  return content;
}
