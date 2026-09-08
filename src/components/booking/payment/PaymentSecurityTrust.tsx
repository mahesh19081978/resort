'use client';

import React from 'react';
import { Lock, ShieldCheck, CheckCircle2 } from 'lucide-react';

export function PaymentSecurityTrust() {
  return (
    <div className="pt-3 pb-1 border-t border-resort-sand/60">
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-4 text-[11px] text-resort-muted">
        <div className="flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5 text-resort-forest shrink-0" />
          <span>Encrypted Gateway Connection</span>
        </div>
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-resort-gold shrink-0" />
          <span>Direct Resort Guarantee</span>
        </div>
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>Official INR Settlement</span>
        </div>
      </div>
    </div>
  );
}
