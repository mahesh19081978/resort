'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Calendar, Filter, ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PERIOD_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this-week', label: 'This Week' },
  { value: 'this-month', label: 'This Month' },
  { value: 'last-month', label: 'Last Month' },
  { value: 'last-3-months', label: 'Last 3 Months' },
  { value: 'last-6-months', label: 'Last 6 Months' },
  { value: 'this-year', label: 'This Year' },
  { value: 'custom', label: 'Custom Range...' },
] as const;

interface PeriodSelectorProps {
  currentPeriod: string;
  startDateStr?: string;
  endDateStr?: string;
}

export function PeriodSelector({
  currentPeriod,
  startDateStr,
  endDateStr,
}: PeriodSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [isOpen, setIsOpen] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(currentPeriod === 'custom');
  const [customStart, setCustomStart] = useState(startDateStr || '');
  const [customEnd, setCustomEnd] = useState(endDateStr || '');

  const activeOption = PERIOD_OPTIONS.find((p) => p.value === currentPeriod) || PERIOD_OPTIONS[3];

  const handleSelect = (period: string) => {
    setIsOpen(false);
    if (period === 'custom') {
      setShowCustomModal(true);
      return;
    }
    setShowCustomModal(false);

    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('period', period);
      params.delete('start');
      params.delete('end');
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const applyCustomRange = () => {
    if (!customStart || !customEnd || customStart > customEnd) return;
    setShowCustomModal(false);

    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('period', 'custom');
      params.set('start', customStart);
      params.set('end', customEnd);
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  return (
    <div className="relative inline-flex items-center gap-2">
      {/* Dropdown button */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          disabled={isPending}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-md border border-neutral-300 bg-white hover:bg-neutral-50 shadow-sm text-resort-charcoal transition-colors disabled:opacity-60"
          aria-haspopup="true"
          aria-expanded={isOpen}
        >
          <Calendar className="w-3.5 h-3.5 text-resort-gold" />
          <span>Period: <strong className="text-resort-charcoal font-bold">{activeOption.label}</strong></span>
          <ChevronDown className="w-3.5 h-3.5 text-neutral-400 ml-1" />
        </button>

        {isOpen && (
          <div
            className="absolute right-0 mt-1.5 w-52 bg-white rounded-md shadow-lg border border-neutral-200 py-1.5 z-50 animate-in fade-in-80"
            role="menu"
          >
            <div className="px-3 py-1.5 text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
              Select Reporting Period
            </div>
            {PERIOD_OPTIONS.map((opt) => {
              const isSelected = opt.value === currentPeriod;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelect(opt.value)}
                  className={`w-full text-left px-3.5 py-2 text-xs flex items-center justify-between transition-colors ${
                    isSelected
                      ? 'bg-resort-sand/40 font-semibold text-resort-forest'
                      : 'text-neutral-700 hover:bg-neutral-50'
                  }`}
                  role="menuitem"
                >
                  <span>{opt.label}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-resort-forest" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Custom Date Range Popover / Inputs */}
      {showCustomModal && (
        <div className="flex items-center gap-1.5 bg-white px-3 py-1 rounded-md border border-neutral-300 shadow-sm text-xs">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="border border-neutral-200 rounded px-1.5 py-1 text-xs text-neutral-800"
            aria-label="Start Date"
          />
          <span className="text-neutral-400">to</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="border border-neutral-200 rounded px-1.5 py-1 text-xs text-neutral-800"
            aria-label="End Date"
          />
          <Button
            size="sm"
            onClick={applyCustomRange}
            disabled={!customStart || !customEnd || customStart > customEnd || isPending}
            className="h-7 text-xs bg-resort-gold hover:bg-resort-sand text-white px-2.5 ml-1"
          >
            Apply
          </Button>
        </div>
      )}

      {isPending && (
        <span className="text-[11px] text-resort-gold animate-pulse font-medium">
          Updating...
        </span>
      )}
    </div>
  );
}
