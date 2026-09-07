import { cn } from '@/lib/utils';

interface SectionHeadingProps {
  label?: string;
  title: string;
  description?: string;
  alignment?: 'left' | 'center';
  className?: string;
  light?: boolean;
}

export function SectionHeading({
  label,
  title,
  description,
  alignment = 'center',
  className,
  light = false,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        'max-w-2xl',
        alignment === 'center' && 'mx-auto text-center',
        alignment === 'left' && 'text-left',
        className
      )}
    >
      {label && (
        <span
          className={cn(
            'inline-block text-xs font-semibold uppercase tracking-[0.2em] mb-4',
            light ? 'text-resort-gold-light' : 'text-resort-gold'
          )}
        >
          {label}
        </span>
      )}
      <div className={cn('gold-line-wide mb-6', alignment === 'center' && 'mx-auto')} />
      <h2
        className={cn(
          'font-display text-display-sm md:text-display-md font-medium leading-tight',
          light ? 'text-resort-ivory' : 'text-resort-charcoal-text'
        )}
      >
        {title}
      </h2>
      {description && (
        <p
          className={cn(
            'mt-5 text-base md:text-lg leading-relaxed',
            light ? 'text-resort-sand/80' : 'text-resort-muted'
          )}
        >
          {description}
        </p>
      )}
    </div>
  );
}
