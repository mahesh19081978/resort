import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface BrandLogoProps {
  variant?: 'light' | 'dark';
  size?: 'default' | 'compact' | 'large' | 'xl';
  className?: string;
  linked?: boolean;
}

export function BrandLogo({ variant = 'dark', size = 'default', className, linked = true }: BrandLogoProps) {
  const logoSrc = '/images/branding/infinity-resort-logo.png';

  const dimensions = {
    compact: { width: 160, height: 44, class: 'h-11' },
    default: { width: 240, height: 64, class: 'h-16' },
    large: { width: 280, height: 84, class: 'h-20' },
    xl: { width: 320, height: 104, class: 'h-24' },
  }[size] || { width: 240, height: 64, class: 'h-16' };

  const image = (
    <Image
      src={logoSrc}
      alt="Infinity Resort and Restaurant"
      width={dimensions.width}
      height={dimensions.height}
      className={cn(
        'w-auto object-contain',
        dimensions.class,
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
