'use client';

import React from 'react';
import { CreditCard, Smartphone, Building2 } from 'lucide-react';

export type OnlineSubMethod = 'CARD' | 'UPI' | 'NET_BANKING';

interface PaymentChannelTabsProps {
  selectedChannel: OnlineSubMethod;
  onSelectChannel: (channel: OnlineSubMethod) => void;
  disabled?: boolean;
}

export function PaymentChannelTabs({
  selectedChannel,
  onSelectChannel,
  disabled = false,
}: PaymentChannelTabsProps) {
  const tabs: { id: OnlineSubMethod; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'CARD', label: 'Credit / Debit Card', icon: CreditCard },
    { id: 'UPI', label: 'UPI / QR', icon: Smartphone },
    { id: 'NET_BANKING', label: 'Net Banking', icon: Building2 },
  ];

  return (
    <div className="space-y-1.5" role="tablist" aria-label="Online Payment Channels">
      <div className="flex p-1 bg-resort-sand/25 rounded-xl border border-resort-sand/60">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isSelected = selectedChannel === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              type="button"
              id={`tab-${tab.id.toLowerCase()}`}
              aria-controls={`tabpanel-${tab.id.toLowerCase()}`}
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              disabled={disabled}
              onClick={() => onSelectChannel(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-medium transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-resort-gold ${
                isSelected
                  ? 'bg-white text-resort-forest font-semibold shadow-xs border border-resort-sand/40'
                  : 'text-resort-muted hover:text-resort-charcoal-text hover:bg-white/40'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <Icon className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-resort-forest' : 'text-resort-muted'}`} />
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
