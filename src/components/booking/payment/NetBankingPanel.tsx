'use client';

import React, { useState } from 'react';
import { Building2, Search, Check } from 'lucide-react';

interface NetBankingPanelProps {
  amountDueFormatted: string;
}

const POPULAR_BANKS = [
  { id: 'HDFC', name: 'HDFC Bank', code: 'HDFC' },
  { id: 'ICICI', name: 'ICICI Bank', code: 'ICIC' },
  { id: 'SBI', name: 'State Bank of India', code: 'SBIN' },
  { id: 'AXIS', name: 'Axis Bank', code: 'UTIB' },
  { id: 'KOTAK', name: 'Kotak Mahindra Bank', code: 'KKBK' },
];

const OTHER_BANKS = [
  { id: 'PNB', name: 'Punjab National Bank' },
  { id: 'BOB', name: 'Bank of Baroda' },
  { id: 'CANARA', name: 'Canara Bank' },
  { id: 'INDUSIND', name: 'IndusInd Bank' },
  { id: 'IDBI', name: 'IDBI Bank' },
  { id: 'YES', name: 'Yes Bank' },
  { id: 'UNION', name: 'Union Bank of India' },
  { id: 'FEDERAL', name: 'Federal Bank' },
];

export function NetBankingPanel({ amountDueFormatted }: NetBankingPanelProps) {
  const [selectedBank, setSelectedBank] = useState<string>('HDFC');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredOtherBanks = OTHER_BANKS.filter((b) =>
    b.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div
      role="tabpanel"
      id="tabpanel-netbanking"
      aria-labelledby="tab-netbanking"
      className="space-y-4 p-5 rounded-2xl bg-white border border-resort-sand/80 shadow-xs animate-in fade-in duration-200"
    >
      <div>
        <h5 className="text-xs font-semibold text-resort-charcoal-text uppercase tracking-wider mb-2.5">
          Popular Banks
        </h5>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {POPULAR_BANKS.map((bank) => {
            const isSelected = selectedBank === bank.id;
            return (
              <button
                key={bank.id}
                type="button"
                onClick={() => setSelectedBank(bank.id)}
                className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-medium text-left transition-all ${
                  isSelected
                    ? 'border-resort-forest bg-resort-forest/5 text-resort-forest ring-1 ring-resort-forest/20 shadow-xs'
                    : 'border-resort-sand/80 text-resort-charcoal-text hover:bg-resort-ivory/40'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <div className="w-6 h-6 rounded-md bg-resort-sand/30 flex items-center justify-center shrink-0">
                    <Building2 className="w-3.5 h-3.5 text-resort-muted" />
                  </div>
                  <span className="truncate">{bank.name}</span>
                </div>
                {isSelected && <Check className="w-3.5 h-3.5 text-resort-forest shrink-0 ml-1" />}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h5 className="text-xs font-semibold text-resort-charcoal-text uppercase tracking-wider mb-2">
          All Other Banks
        </h5>
        <div className="relative mb-2">
          <input
            type="text"
            placeholder="Search bank name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-resort-sand bg-resort-ivory/30 pl-9 pr-3 py-2 text-xs text-resort-charcoal-text placeholder:text-resort-muted/50 focus:ring-2 focus:ring-resort-gold/30 focus:border-resort-gold focus:outline-none transition-all"
          />
          <Search className="w-3.5 h-3.5 text-resort-muted absolute left-3 top-1/2 -translate-y-1/2" />
        </div>

        <select
          value={selectedBank}
          onChange={(e) => setSelectedBank(e.target.value)}
          className="w-full rounded-xl border border-resort-sand bg-resort-ivory/30 px-3 py-2.5 text-xs text-resort-charcoal-text focus:ring-2 focus:ring-resort-gold/30 focus:border-resort-gold focus:outline-none transition-all cursor-pointer"
        >
          <option value="" disabled>
            Select from all available banks
          </option>
          {filteredOtherBanks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      <div className="pt-2 border-t border-resort-sand/40 flex items-center justify-between text-[11px] text-resort-muted">
        <span>You will be redirected to your bank&apos;s highly secure portal to authorize</span>
        <span className="font-semibold text-resort-forest">{amountDueFormatted}</span>
      </div>
    </div>
  );
}
