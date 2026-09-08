'use client';

import React, { useState } from 'react';
import { CreditCard, HelpCircle, Lock } from 'lucide-react';

interface CardPaymentFormProps {
  amountDueFormatted: string;
}

type CardBrand = 'visa' | 'mastercard' | 'rupay' | 'generic';

export function CardPaymentForm({ amountDueFormatted }: CardPaymentFormProps) {
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [showCvvHelp, setShowCvvHelp] = useState(false);

  // Detect card brand based on prefix
  const getCardBrand = (num: string): CardBrand => {
    const clean = num.replace(/\s+/g, '');
    if (/^4/.test(clean)) return 'visa';
    if (/^(5[1-5]|2[2-7])/.test(clean)) return 'mastercard';
    if (/^(60|65|81|82|508)/.test(clean)) return 'rupay';
    return 'generic';
  };

  const cardBrand = getCardBrand(cardNumber);

  // Auto-format card number into 4-digit blocks
  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value.replace(/\D/g, '').slice(0, 16);
    const parts = rawVal.match(/.{1,4}/g);
    setCardNumber(parts ? parts.join(' ') : '');
  };

  // Auto-format expiry as MM/YY
  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let rawVal = e.target.value.replace(/\D/g, '').slice(0, 4);
    if (rawVal.length >= 3) {
      setExpiry(`${rawVal.slice(0, 2)}/${rawVal.slice(2)}`);
    } else {
      setExpiry(rawVal);
    }
  };

  // Mask/limit CVV (3-4 digits)
  const handleCvvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value.replace(/\D/g, '').slice(0, 4);
    setCvv(rawVal);
  };

  return (
    <div
      role="tabpanel"
      id="tabpanel-card"
      aria-labelledby="tab-card"
      className="space-y-4 p-5 rounded-2xl bg-white border border-resort-sand/80 shadow-xs animate-in fade-in duration-200"
    >
      {/* Dev Mode Mock Banner */}
      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-amber-50/70 border border-amber-200/80 text-[11px] text-amber-800">
        <span className="flex items-center gap-1.5 font-medium">
          <Lock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
          Demo card preview — processed via secure mock gateway
        </span>
        <span className="font-semibold text-amber-900 bg-amber-100/60 px-2 py-0.5 rounded">
          {amountDueFormatted}
        </span>
      </div>

      <div className="space-y-3.5">
        {/* Card Number */}
        <div>
          <label className="block text-xs font-semibold text-resort-charcoal-text uppercase tracking-wider mb-1.5">
            Card Number
          </label>
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={cardNumber}
              onChange={handleCardNumberChange}
              placeholder="4111 •••• •••• 1111"
              maxLength={19}
              className="w-full rounded-xl border border-resort-sand bg-resort-ivory/30 pl-11 pr-24 py-2.5 text-sm text-resort-charcoal-text placeholder:text-resort-muted/50 font-mono focus:ring-2 focus:ring-resort-gold/30 focus:border-resort-gold focus:outline-none transition-all"
            />
            <CreditCard className="w-4 h-4 text-resort-muted absolute left-3.5 top-1/2 -translate-y-1/2" />

            {/* Brand Badges */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded border transition-colors ${
                  cardBrand === 'visa'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-gray-100 text-gray-400 border-gray-200'
                }`}
              >
                VISA
              </span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded border transition-colors ${
                  cardBrand === 'mastercard'
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-gray-100 text-gray-400 border-gray-200'
                }`}
              >
                MC
              </span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded border transition-colors ${
                  cardBrand === 'rupay'
                    ? 'bg-green-700 text-white border-green-700'
                    : 'bg-gray-100 text-gray-400 border-gray-200'
                }`}
              >
                RUPAY
              </span>
            </div>
          </div>
        </div>

        {/* Cardholder Name */}
        <div>
          <label className="block text-xs font-semibold text-resort-charcoal-text uppercase tracking-wider mb-1.5">
            Cardholder Name
          </label>
          <input
            type="text"
            autoComplete="off"
            value={cardHolder}
            onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
            placeholder="NAME AS PRINTED ON CARD"
            className="w-full rounded-xl border border-resort-sand bg-resort-ivory/30 px-3.5 py-2.5 text-sm text-resort-charcoal-text placeholder:text-resort-muted/50 uppercase tracking-wide focus:ring-2 focus:ring-resort-gold/30 focus:border-resort-gold focus:outline-none transition-all"
          />
        </div>

        {/* Expiry & CVV */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-resort-charcoal-text uppercase tracking-wider mb-1.5">
              Valid Thru
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={expiry}
              onChange={handleExpiryChange}
              placeholder="MM / YY"
              maxLength={5}
              className="w-full rounded-xl border border-resort-sand bg-resort-ivory/30 px-3.5 py-2.5 text-sm text-resort-charcoal-text placeholder:text-resort-muted/50 font-mono text-center focus:ring-2 focus:ring-resort-gold/30 focus:border-resort-gold focus:outline-none transition-all"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-resort-charcoal-text uppercase tracking-wider">
                CVV / CVC
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowCvvHelp(!showCvvHelp)}
                  onMouseEnter={() => setShowCvvHelp(true)}
                  onMouseLeave={() => setShowCvvHelp(false)}
                  className="text-resort-muted hover:text-resort-forest transition-colors p-0.5"
                  aria-label="CVV information"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                </button>
                {showCvvHelp && (
                  <div className="absolute right-0 bottom-full mb-1 w-44 p-2 rounded-lg bg-resort-charcoal text-white text-[10px] leading-tight shadow-lg z-20 pointer-events-none">
                    3 digits on the back of your card (4 digits for Amex).
                  </div>
                )}
              </div>
            </div>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={cvv}
              onChange={handleCvvChange}
              placeholder="•••"
              maxLength={4}
              className="w-full rounded-xl border border-resort-sand bg-resort-ivory/30 px-3.5 py-2.5 text-sm text-resort-charcoal-text placeholder:text-resort-muted/50 font-mono text-center tracking-widest focus:ring-2 focus:ring-resort-gold/30 focus:border-resort-gold focus:outline-none transition-all"
            />
          </div>
        </div>
      </div>

      <p className="text-[11px] text-resort-muted text-center pt-1">
        Your card details are verified over TLS encryption and never stored on our servers.
      </p>
    </div>
  );
}
