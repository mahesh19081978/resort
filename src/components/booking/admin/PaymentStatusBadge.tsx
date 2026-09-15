import React from 'react';
import { DerivedPaymentStatus } from '@/lib/booking/admin-reservation-service';

const paymentConfig: Record<
  DerivedPaymentStatus,
  { label: string; bg: string; text: string; border: string; dot: string }
> = {
  PAID: {
    label: 'PAID',
    bg: 'bg-emerald-50',
    text: 'text-emerald-800',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500',
  },
  PARTIALLY_PAID: {
    label: 'PARTIALLY PAID',
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
  },
  UNPAID: {
    label: 'UNPAID',
    bg: 'bg-neutral-50',
    text: 'text-neutral-700',
    border: 'border-neutral-200',
    dot: 'bg-neutral-400',
  },
  REFUND_PENDING: {
    label: 'REFUND PENDING',
    bg: 'bg-orange-50',
    text: 'text-orange-800',
    border: 'border-orange-200',
    dot: 'bg-orange-500',
  },
  REFUNDED: {
    label: 'REFUNDED',
    bg: 'bg-sky-50',
    text: 'text-sky-800',
    border: 'border-sky-200',
    dot: 'bg-sky-500',
  },
};

export function PaymentStatusBadge({ status }: { status: DerivedPaymentStatus }) {
  const config = paymentConfig[status] || {
    label: status,
    bg: 'bg-neutral-50',
    text: 'text-neutral-700',
    border: 'border-neutral-200',
    dot: 'bg-neutral-400',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase border ${config.bg} ${config.text} ${config.border}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}
