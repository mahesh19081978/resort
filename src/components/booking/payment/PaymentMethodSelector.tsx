'use client';

import React from 'react';
import { CreditCard, Building, ShieldCheck, AlertCircle } from 'lucide-react';

interface PaymentMethodSelectorProps {
  paymentMethod: 'PAY_ONLINE' | 'PAY_AT_HOTEL';
  onSelectMethod: (method: 'PAY_ONLINE' | 'PAY_AT_HOTEL') => void;
  allowPayAtHotel: boolean;
  disabled?: boolean;
}

export function PaymentMethodSelector({
  paymentMethod,
  onSelectMethod,
  allowPayAtHotel,
  disabled = false,
}: PaymentMethodSelectorProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-resort-charcoal-text">
          Select Payment Option <span className="text-rose-600">*</span>
        </label>
        <span className="text-[11px] text-resort-muted flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-resort-forest" />
          Official Direct Reservation
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* PAY_ONLINE Option */}
        <div
          role="radio"
          aria-checked={paymentMethod === 'PAY_ONLINE'}
          tabIndex={disabled ? -1 : 0}
          onClick={() => !disabled && onSelectMethod('PAY_ONLINE')}
          onKeyDown={(e) => {
            if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              onSelectMethod('PAY_ONLINE');
            }
          }}
          className={`relative p-5 rounded-2xl border transition-all duration-200 cursor-pointer select-none text-left ${
            paymentMethod === 'PAY_ONLINE'
              ? 'border-resort-forest bg-resort-forest/[0.03] ring-2 ring-resort-forest/20 shadow-sm'
              : 'border-resort-sand/80 bg-white hover:border-resort-sand hover:bg-resort-ivory/30'
          } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          <div className="flex items-start justify-between gap-3 mb-2.5">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                  paymentMethod === 'PAY_ONLINE'
                    ? 'bg-resort-forest text-white shadow-sm'
                    : 'bg-resort-forest/10 text-resort-forest'
                }`}
              >
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-resort-charcoal-text tracking-tight">
                  Pay Online Now
                </p>
                <p className="text-[11px] font-medium text-resort-forest">
                  Card • UPI • Net Banking
                </p>
              </div>
            </div>

            {/* Radio indicator */}
            <div
              className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                paymentMethod === 'PAY_ONLINE'
                  ? 'border-resort-forest bg-resort-forest'
                  : 'border-resort-sand bg-white'
              }`}
            >
              {paymentMethod === 'PAY_ONLINE' && (
                <div className="w-2 h-2 rounded-full bg-white" />
              )}
            </div>
          </div>

          <p className="text-xs text-resort-muted leading-relaxed pl-13">
            Secure inventory hold for 15 minutes. Pay advance deposit seamlessly via luxury gateway.
          </p>
        </div>

        {/* PAY_AT_HOTEL Option */}
        <div
          role="radio"
          aria-checked={paymentMethod === 'PAY_AT_HOTEL'}
          aria-disabled={!allowPayAtHotel || disabled}
          tabIndex={allowPayAtHotel && !disabled ? 0 : -1}
          onClick={() => {
            if (allowPayAtHotel && !disabled) {
              onSelectMethod('PAY_AT_HOTEL');
            }
          }}
          onKeyDown={(e) => {
            if (allowPayAtHotel && !disabled && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              onSelectMethod('PAY_AT_HOTEL');
            }
          }}
          className={`relative p-5 rounded-2xl border transition-all duration-200 select-none text-left ${
            !allowPayAtHotel
              ? 'opacity-60 cursor-not-allowed bg-slate-50/80 border-slate-200 text-slate-400'
              : paymentMethod === 'PAY_AT_HOTEL'
              ? 'border-resort-forest bg-resort-forest/[0.03] ring-2 ring-resort-forest/20 shadow-sm cursor-pointer'
              : 'border-resort-sand/80 bg-white hover:border-resort-sand hover:bg-resort-ivory/30 cursor-pointer'
          } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          <div className="flex items-start justify-between gap-3 mb-2.5">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                  !allowPayAtHotel
                    ? 'bg-slate-100 text-slate-400'
                    : paymentMethod === 'PAY_AT_HOTEL'
                    ? 'bg-resort-forest text-white shadow-sm'
                    : 'bg-resort-forest/10 text-resort-forest'
                }`}
              >
                <Building className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-resort-charcoal-text tracking-tight">
                  Pay at Hotel
                </p>
                <p className="text-[11px] font-medium text-resort-muted">
                  {allowPayAtHotel ? 'Settle upon arrival' : 'Policy restriction'}
                </p>
              </div>
            </div>

            {/* Radio indicator */}
            <div
              className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                !allowPayAtHotel
                  ? 'border-slate-300 bg-slate-100'
                  : paymentMethod === 'PAY_AT_HOTEL'
                  ? 'border-resort-forest bg-resort-forest'
                  : 'border-resort-sand bg-white'
              }`}
            >
              {paymentMethod === 'PAY_AT_HOTEL' && allowPayAtHotel && (
                <div className="w-2 h-2 rounded-full bg-white" />
              )}
            </div>
          </div>

          <p className="text-xs text-resort-muted leading-relaxed pl-13">
            {allowPayAtHotel ? (
              'No advance deposit required today. Full balance settled at front desk on check-in.'
            ) : (
              <span className="flex items-center gap-1 text-amber-700 text-[11px] font-medium mt-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                Mandatory advance deposit required for these peak booking dates.
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
