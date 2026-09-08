'use client';

import React from 'react';
import { useFormStatus } from 'react-dom';
import { cn } from '@/lib/utils';

interface SubmitButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  pendingLabel?: string;
  icon?: React.ReactNode;
}

export function SubmitButton({
  variant = 'primary',
  size = 'md',
  pendingLabel,
  icon,
  className,
  children,
  disabled,
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending}
      className={cn(
        'inline-flex items-center justify-center rounded font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-resort-gold disabled:pointer-events-none disabled:opacity-50',
        {
          'bg-resort-forest text-resort-ivory hover:bg-resort-forest-light': variant === 'primary',
          'bg-resort-gold text-resort-charcoal hover:bg-resort-gold-light': variant === 'secondary',
          'border border-resort-forest text-resort-forest hover:bg-resort-sand': variant === 'outline',
          'text-resort-charcoal hover:bg-resort-sand': variant === 'ghost',
          'bg-red-600 text-white hover:bg-red-700': variant === 'danger',
          'h-8 px-3 text-xs gap-1.5': size === 'sm',
          'h-10 px-5 text-sm gap-2': size === 'md',
          'h-12 px-7 text-base gap-2': size === 'lg',
        },
        className
      )}
      {...props}
    >
      {pending ? (
        <>
          <svg
            className="animate-spin shrink-0"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
            width={size === 'sm' ? 12 : size === 'lg' ? 16 : 14}
            height={size === 'sm' ? 12 : size === 'lg' ? 16 : 14}
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          {pendingLabel || 'Processing...'}
        </>
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </button>
  );
}
