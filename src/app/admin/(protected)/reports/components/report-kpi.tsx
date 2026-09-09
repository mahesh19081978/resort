import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

interface ReportKpiProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    label: string;
  };
  variant?: 'default' | 'success' | 'warning' | 'danger';
}

const variantStyles = {
  default: {
    iconBg: 'bg-resort-sand',
    iconColor: 'text-resort-forest',
  },
  success: {
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-700',
  },
  warning: {
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-700',
  },
  danger: {
    iconBg: 'bg-red-50',
    iconColor: 'text-red-700',
  },
};

export function ReportKpi({
  label,
  value,
  subtitle,
  icon,
  trend,
  variant = 'default',
}: ReportKpiProps) {
  const styles = variantStyles[variant];

  const trendColor =
    trend && trend.value > 0
      ? 'text-emerald-700'
      : trend && trend.value < 0
        ? 'text-red-600'
        : 'text-resort-muted';

  const TrendIcon =
    trend && trend.value > 0
      ? TrendingUp
      : trend && trend.value < 0
        ? TrendingDown
        : Minus;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-resort-muted">
              {label}
            </p>
            <p className="mt-2 text-2xl font-bold text-resort-charcoal font-display">
              {value}
            </p>
            {subtitle && (
              <p className="mt-1 text-[11px] text-resort-muted">{subtitle}</p>
            )}
          </div>

          {icon && (
            <div className={cn('flex-shrink-0 p-2.5 rounded-lg', styles.iconBg)}>
              <div className={cn('w-5 h-5', styles.iconColor)}>{icon}</div>
            </div>
          )}
        </div>

        {trend && (
          <div className="mt-3 flex items-center gap-1.5">
            <TrendIcon className={cn('w-3.5 h-3.5', trendColor)} />
            <span className={cn('text-xs font-semibold', trendColor)}>
              {trend.value > 0 ? '+' : ''}
              {trend.value}%
            </span>
            <span className="text-[11px] text-resort-muted">{trend.label}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
