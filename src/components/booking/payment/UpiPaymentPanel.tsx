'use client';

import React, { useState } from 'react';
import { Smartphone, QrCode, Check, Copy } from 'lucide-react';

interface UpiPaymentPanelProps {
  amountDueFormatted: string;
}

export function UpiPaymentPanel({ amountDueFormatted }: UpiPaymentPanelProps) {
  const [copied, setCopied] = useState(false);
  const demoVpa = 'infinityresort@icici';

  const handleCopy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(demoVpa);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      role="tabpanel"
      id="tabpanel-upi"
      aria-labelledby="tab-upi"
      className="space-y-4 p-5 rounded-2xl bg-white border border-resort-sand/80 shadow-xs animate-in fade-in duration-200"
    >
      <div className="flex flex-col sm:flex-row items-center gap-6">
        {/* Dynamic QR Display */}
        <div className="flex flex-col items-center p-3.5 bg-resort-ivory/60 border border-resort-sand/80 rounded-2xl shrink-0 shadow-xs">
          <div className="relative w-36 h-36 bg-white p-2 rounded-xl border border-resort-sand/40 flex items-center justify-center">
            {/* SVG simulated QR Code with luxury center emblem */}
            <svg
              viewBox="0 0 100 100"
              className="w-full h-full text-resort-charcoal-text"
              fill="currentColor"
            >
              {/* Corner 1 */}
              <rect x="5" y="5" width="26" height="26" rx="4" fill="none" stroke="currentColor" strokeWidth="4" />
              <rect x="11" y="11" width="14" height="14" rx="2" />
              {/* Corner 2 */}
              <rect x="69" y="5" width="26" height="26" rx="4" fill="none" stroke="currentColor" strokeWidth="4" />
              <rect x="75" y="11" width="14" height="14" rx="2" />
              {/* Corner 3 */}
              <rect x="5" y="69" width="26" height="26" rx="4" fill="none" stroke="currentColor" strokeWidth="4" />
              <rect x="11" y="75" width="14" height="14" rx="2" />
              {/* Data matrices dots */}
              <rect x="36" y="8" width="5" height="5" />
              <rect x="46" y="8" width="5" height="5" />
              <rect x="56" y="8" width="5" height="5" />
              <rect x="36" y="18" width="5" height="5" />
              <rect x="56" y="18" width="5" height="5" />
              <rect x="8" y="36" width="5" height="5" />
              <rect x="8" y="46" width="5" height="5" />
              <rect x="8" y="56" width="5" height="5" />
              <rect x="18" y="36" width="5" height="5" />
              <rect x="18" y="56" width="5" height="5" />
              <rect x="36" y="36" width="6" height="6" fill="#1C3D2F" />
              <rect x="47" y="36" width="6" height="6" fill="#1C3D2F" />
              <rect x="58" y="36" width="6" height="6" fill="#1C3D2F" />
              <rect x="36" y="47" width="6" height="6" fill="#C5A869" />
              <rect x="47" y="47" width="6" height="6" fill="#1C3D2F" />
              <rect x="58" y="47" width="6" height="6" fill="#C5A869" />
              <rect x="36" y="58" width="6" height="6" fill="#1C3D2F" />
              <rect x="47" y="58" width="6" height="6" fill="#1C3D2F" />
              <rect x="58" y="58" width="6" height="6" fill="#1C3D2F" />
              <rect x="69" y="36" width="5" height="5" />
              <rect x="79" y="46" width="5" height="5" />
              <rect x="89" y="36" width="5" height="5" />
              <rect x="69" y="56" width="5" height="5" />
              <rect x="89" y="56" width="5" height="5" />
              <rect x="36" y="69" width="5" height="5" />
              <rect x="46" y="79" width="5" height="5" />
              <rect x="56" y="69" width="5" height="5" />
              <rect x="36" y="89" width="5" height="5" />
              <rect x="56" y="89" width="5" height="5" />
              <rect x="69" y="69" width="5" height="5" />
              <rect x="79" y="79" width="5" height="5" />
              <rect x="89" y="89" width="5" height="5" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-7 h-7 rounded-full bg-white shadow-sm flex items-center justify-center border border-resort-gold">
                <QrCode className="w-4 h-4 text-resort-forest" />
              </div>
            </div>
          </div>
          <p className="text-[10px] font-medium text-resort-muted mt-2 tracking-wide uppercase">
            Scan to Pay {amountDueFormatted}
          </p>
        </div>

        {/* UPI Details & Supported Apps */}
        <div className="flex-1 space-y-3.5 text-center sm:text-left">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-resort-forest/10 text-resort-forest text-xs font-medium mb-1.5">
              <Smartphone className="w-3.5 h-3.5" />
              Instant Zero-Fee Transfer
            </div>
            <h5 className="text-sm font-semibold text-resort-charcoal-text">
              Scan with any UPI App
            </h5>
            <p className="text-xs text-resort-muted mt-0.5">
              Scan the QR using Google Pay, PhonePe, Paytm, BHIM, or any banking app.
            </p>
          </div>

          {/* VPA Copy Box */}
          <div className="p-2.5 rounded-xl bg-resort-ivory/50 border border-resort-sand/80 flex items-center justify-between gap-2 max-w-sm">
            <div className="truncate text-left">
              <span className="block text-[10px] uppercase tracking-wider text-resort-muted font-medium">
                Verified Resort VPA (Simulated)
              </span>
              <span className="text-xs font-mono font-semibold text-resort-charcoal-text">
                {demoVpa}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="p-1.5 rounded-lg border border-resort-sand bg-white text-resort-charcoal hover:bg-resort-ivory transition-colors shrink-0"
              title="Copy VPA"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-resort-muted" />
              )}
            </button>
          </div>

          {/* Supported UPI Apps Badges */}
          <div>
            <span className="text-[10px] uppercase tracking-wider text-resort-muted font-semibold block mb-1.5">
              Supported Apps
            </span>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5">
              {['Google Pay', 'PhonePe', 'Paytm', 'BHIM', 'CRED'].map((app) => (
                <span
                  key={app}
                  className="px-2 py-0.5 rounded-md bg-white border border-resort-sand text-[11px] font-medium text-resort-charcoal-text"
                >
                  {app}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
