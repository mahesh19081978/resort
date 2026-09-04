import React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-resort-gold disabled:pointer-events-none disabled:opacity-50',
          {
            'bg-resort-forest text-resort-ivory hover:bg-resort-forest-light': variant === 'primary',
            'bg-resort-gold text-resort-charcoal hover:bg-resort-gold-light': variant === 'secondary',
            'border border-resort-forest text-resort-forest hover:bg-resort-sand': variant === 'outline',
            'text-resort-charcoal hover:bg-resort-sand': variant === 'ghost',
            'h-8 px-3 text-xs': size === 'sm',
            'h-10 px-5 text-sm': size === 'md',
            'h-12 px-7 text-base': size === 'lg',
          },
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';