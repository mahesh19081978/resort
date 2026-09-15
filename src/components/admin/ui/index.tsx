import React from 'react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

// -------------------------------------------------------------
// 1. AdminPageHeader
// -------------------------------------------------------------
export interface AdminPageHeaderProps {
  title: string;
  subtitle?: string;
  badge?: string;
  breadcrumbs?: { label: string; href?: string }[];
  actions?: React.ReactNode;
  className?: string;
}

export function AdminPageHeader({
  title,
  subtitle,
  badge,
  breadcrumbs,
  actions,
  className,
}: AdminPageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-resort-sand/80 pb-5', className)}>
      <div className="space-y-1">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-resort-muted mb-1">
            {breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <React.Fragment key={idx}>
                  {idx > 0 && <span className="text-resort-sand-light select-none">/</span>}
                  {crumb.href && !isLast ? (
                    <Link href={crumb.href} className="hover:text-resort-forest transition-colors">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className={isLast ? 'text-resort-charcoal font-medium' : ''}>{crumb.label}</span>
                  )}
                </React.Fragment>
              );
            })}
          </nav>
        )}
        <div className="flex items-center gap-3">
          <h1 className="font-serif text-2xl lg:text-3xl font-bold tracking-tight text-resort-charcoal">
            {title}
          </h1>
          {badge && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-semibold tracking-wide bg-resort-forest/10 text-resort-forest border border-resort-forest/20">
              {badge}
            </span>
          )}
        </div>
        {subtitle && (
          <p className="text-xs lg:text-sm text-resort-muted max-w-2xl leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>

      {actions && (
        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// 2. AdminKpiCard
// -------------------------------------------------------------
export interface AdminKpiCardProps {
  label: string;
  value: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  trend?: string;
  subtext?: string;
  variant?: 'forest' | 'champagne' | 'olive' | 'neutral' | 'alert';
  onClick?: () => void;
  className?: string;
}

export function AdminKpiCard({
  label,
  value,
  icon: Icon,
  trend,
  subtext,
  variant = 'neutral',
  onClick,
  className,
}: AdminKpiCardProps) {
  const borderVariants = {
    forest: 'border-l-4 border-l-resort-forest hover:border-resort-forest',
    champagne: 'border-l-4 border-l-resort-gold hover:border-resort-gold',
    olive: 'border-l-4 border-l-resort-olive hover:border-resort-olive',
    neutral: 'border-l-4 border-l-resort-sand hover:border-resort-forest/40',
    alert: 'border-l-4 border-l-rose-500 hover:border-rose-600',
  };

  const iconVariants = {
    forest: 'text-resort-forest bg-resort-forest/10',
    champagne: 'text-resort-gold-dark bg-resort-gold/15',
    olive: 'text-resort-olive bg-resort-olive/15',
    neutral: 'text-resort-muted bg-resort-sand/50',
    alert: 'text-rose-600 bg-rose-50',
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        'relative bg-white rounded-lg border border-resort-sand/80 p-4 shadow-sm transition-all duration-200 hover:shadow-md flex flex-col justify-between',
        borderVariants[variant],
        onClick && 'cursor-pointer hover:bg-resort-ivory/30',
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-wider font-semibold text-resort-muted">
            {label}
          </p>
          <div className="font-serif text-2xl font-bold text-resort-charcoal mt-1 tracking-tight">
            {value}
          </div>
        </div>
        {Icon && (
          <div className={cn('p-2 rounded-md shrink-0 flex items-center justify-center', iconVariants[variant])}>
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>

      {(trend || subtext) && (
        <div className="mt-3 pt-2.5 border-t border-resort-sand/40 flex items-center justify-between text-[11px] text-resort-muted">
          {subtext && <span>{subtext}</span>}
          {trend && <span className="font-medium text-resort-forest">{trend}</span>}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// 3. AdminStatusBadge
// -------------------------------------------------------------
export type AdminBadgeSemanticType =
  | 'AVAILABLE'
  | 'CONFIRMED'
  | 'SUCCESS'
  | 'OCCUPIED'
  | 'IN_HOUSE'
  | 'ACTIVE'
  | 'PAID'
  | 'PENDING'
  | 'RESERVED'
  | 'PARTIALLY_PAID'
  | 'CLEANING'
  | 'MAINTENANCE'
  | 'WARNING'
  | 'DIRTY'
  | 'CANCELLED'
  | 'OUT_OF_ORDER'
  | 'ERROR'
  | 'DANGER'
  | 'EXPIRED'
  | 'NO_SHOW'
  | 'NEUTRAL'
  | 'REFUNDED'
  | string;

export interface AdminStatusBadgeProps {
  status: AdminBadgeSemanticType;
  label?: string;
  className?: string;
}

export function AdminStatusBadge({ status, label, className }: AdminStatusBadgeProps) {
  const norm = String(status).toUpperCase().replace(/[\s-]/g, '_');
  const displayLabel = label || norm.replace(/_/g, ' ');

  let style = 'bg-stone-100 text-stone-700 border-stone-200 [&&_span]:bg-stone-400';

  if (['AVAILABLE', 'CONFIRMED', 'SUCCESS', 'OCCUPIED', 'IN_HOUSE', 'ACTIVE', 'PAID', 'SETTLED'].includes(norm)) {
    // Forest / Green
    style = 'bg-emerald-50/80 text-emerald-900 border-emerald-200/90 [&&_span]:bg-emerald-600';
  } else if (['PENDING', 'RESERVED', 'PARTIALLY_PAID', 'PREPARING', 'SENT', 'IN_TRANSIT'].includes(norm)) {
    // Champagne / Amber
    style = 'bg-amber-50/80 text-amber-900 border-amber-200/90 [&&_span]:bg-amber-500';
  } else if (['CLEANING', 'WARNING', 'EXTENSION_REQUESTED', 'DIRTY', 'CHECKED_IN'].includes(norm)) {
    // Olive / Warm
    style = 'bg-[#65745B]/10 text-[#2C3B24] border-[#65745B]/30 [&&_span]:bg-[#65745B]';
  } else if (['CANCELLED', 'OUT_OF_ORDER', 'ERROR', 'DANGER', 'VOIDED'].includes(norm)) {
    // Coral / Red
    style = 'bg-rose-50 text-rose-900 border-rose-200 [&&_span]:bg-rose-500';
  } else if (['REFUNDED', 'MAINTENANCE', 'COMPLETED', 'SERVED'].includes(norm)) {
    // Soft Blue / Teal
    style = 'bg-sky-50 text-sky-900 border-sky-200 [&&_span]:bg-sky-500';
  } else {
    // Neutral
    style = 'bg-resort-sand/60 text-resort-charcoal border-resort-sand [&&_span]:bg-resort-muted';
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase border shadow-2xs',
        style,
        className
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" />
      {displayLabel}
    </span>
  );
}

// -------------------------------------------------------------
// 4. AdminCard
// -------------------------------------------------------------
export function AdminCard({
  children,
  className,
  title,
  subtitle,
  headerAction,
}: {
  children: React.ReactNode;
  className?: string;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  headerAction?: React.ReactNode;
}) {
  return (
    <div className={cn('bg-white rounded-lg border border-resort-sand/80 shadow-sm overflow-hidden', className)}>
      {(title || subtitle || headerAction) && (
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-resort-sand/60 bg-resort-ivory/25">
          <div>
            {title && (
              <h3 className="font-serif text-base font-bold text-resort-charcoal">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-xs text-resort-muted mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
          {headerAction && <div>{headerAction}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

// -------------------------------------------------------------
// 5. AdminEmptyState
// -------------------------------------------------------------
export function AdminEmptyState({
  title,
  description,
  icon: Icon,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center p-12 bg-white rounded-lg border border-dashed border-resort-sand/90 shadow-2xs',
        className
      )}
    >
      {Icon && (
        <div className="p-3 bg-resort-sand/30 text-resort-forest rounded-full mb-3">
          <Icon className="w-6 h-6" />
        </div>
      )}
      <h4 className="font-serif text-base font-bold text-resort-charcoal mb-1">
        {title}
      </h4>
      {description && (
        <p className="text-xs text-resort-muted max-w-sm mb-4 leading-relaxed">
          {description}
        </p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
}
