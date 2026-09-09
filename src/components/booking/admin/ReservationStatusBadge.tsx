import React from 'react';
import { ReservationStatus } from '@prisma/client';

const statusConfig: Record<
  ReservationStatus,
  { label: string; bg: string; text: string; border: string; dot: string }
> = {
  CONFIRMED: {
    label: 'CONFIRMED',
    bg: 'bg-emerald-50',
    text: 'text-emerald-800',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500',
  },
  PENDING: {
    label: 'PENDING',
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
  },
  CANCELLED: {
    label: 'CANCELLED',
    bg: 'bg-rose-50',
    text: 'text-rose-800',
    border: 'border-rose-200',
    dot: 'bg-rose-500',
  },
  EXPIRED: {
    label: 'EXPIRED',
    bg: 'bg-neutral-100',
    text: 'text-neutral-700',
    border: 'border-neutral-200',
    dot: 'bg-neutral-400',
  },
  NO_SHOW: {
    label: 'NO SHOW',
    bg: 'bg-purple-50',
    text: 'text-purple-800',
    border: 'border-purple-200',
    dot: 'bg-purple-500',
  },
  COMPLETED: {
    label: 'COMPLETED',
    bg: 'bg-blue-50',
    text: 'text-blue-800',
    border: 'border-blue-200',
    dot: 'bg-blue-500',
  },
};

export function ReservationStatusBadge({ status }: { status: ReservationStatus }) {
  const config = statusConfig[status] || {
    label: status,
    bg: 'bg-neutral-100',
    text: 'text-neutral-700',
    border: 'border-neutral-200',
    dot: 'bg-neutral-400',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wider border ${config.bg} ${config.text} ${config.border}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}
