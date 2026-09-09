'use client';

import React from 'react';
import { formatCurrency } from '@/lib/utils';
import { RevenueTrendPoint, TopSellingDishItem, BookingStatusCount } from '@/lib/dashboard/executive';
import { TrendingUp, UtensilsCrossed, Calendar } from 'lucide-react';

interface RevenueChartProps {
  trend: RevenueTrendPoint[];
  hasData: boolean;
}

export function RevenuePerformanceChart({ trend, hasData }: RevenueChartProps) {
  if (!hasData || trend.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-center p-6 bg-neutral-50/50 rounded-lg border border-dashed border-neutral-200">
        <TrendingUp className="w-8 h-8 text-neutral-300 mb-2" />
        <p className="text-sm font-semibold text-neutral-700">No revenue transactions in this period</p>
        <p className="text-xs text-neutral-500 max-w-sm mt-1">
          Historical room charges and settled restaurant bills will automatically appear as transactions occur.
        </p>
      </div>
    );
  }

  // Calculate scales
  const maxTotal = Math.max(...trend.map((d) => d.totalRevenue), 100);
  const chartHeight = 220;
  const chartWidth = 700;
  const paddingLeft = 60;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 35;

  const innerWidth = chartWidth - paddingLeft - paddingRight;
  const innerHeight = chartHeight - paddingTop - paddingBottom;

  const pointsCount = trend.length;
  const getX = (index: number) => {
    if (pointsCount <= 1) return paddingLeft + innerWidth / 2;
    return paddingLeft + (index / (pointsCount - 1)) * innerWidth;
  };

  const getY = (val: number) => {
    return paddingTop + innerHeight - (val / maxTotal) * innerHeight;
  };

  // Generate SVG paths
  const totalPath = trend
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.totalRevenue)}`)
    .join(' ');

  const roomPath = trend
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.roomRevenue)}`)
    .join(' ');

  const restPath = trend
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.restaurantRevenue)}`)
    .join(' ');

  // Gradient area under total line
  const areaPath = `${totalPath} L ${getX(pointsCount - 1)} ${paddingTop + innerHeight} L ${getX(0)} ${paddingTop + innerHeight} Z`;

  // Y-axis ticks (4 ticks)
  const yTicks = [0, maxTotal * 0.33, maxTotal * 0.66, maxTotal];

  // X-axis label step (limit to at most 7-8 visible labels to avoid overcrowding)
  const step = Math.max(1, Math.ceil(pointsCount / 8));

  return (
    <div className="w-full">
      <div className="flex items-center gap-5 text-xs mb-3 flex-wrap">
        <span className="flex items-center gap-1.5 font-medium text-neutral-700">
          <span className="w-3 h-1.5 rounded-sm bg-[#173B2F]" /> Total Revenue
        </span>
        <span className="flex items-center gap-1.5 font-medium text-neutral-700">
          <span className="w-3 h-1.5 rounded-sm bg-[#C6A15B]" /> Room Revenue
        </span>
        <span className="flex items-center gap-1.5 font-medium text-neutral-700">
          <span className="w-3 h-1.5 rounded-sm bg-[#65745B]" /> Restaurant Revenue
        </span>
      </div>

      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full h-56 min-w-[500px]"
          aria-label="Revenue Performance Trend Chart"
          role="img"
        >
          <defs>
            <linearGradient id="revenueAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#173B2F" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#173B2F" stopOpacity="0.00" />
            </linearGradient>
          </defs>

          {/* Grid lines & Y-axis labels */}
          {yTicks.map((tick, idx) => {
            const yPos = getY(tick);
            return (
              <g key={idx}>
                <line
                  x1={paddingLeft}
                  y1={yPos}
                  x2={chartWidth - paddingRight}
                  y2={yPos}
                  stroke="#E5E5E5"
                  strokeDasharray="3 3"
                />
                <text
                  x={paddingLeft - 8}
                  y={yPos + 4}
                  textAnchor="end"
                  fontSize="10"
                  fill="#737373"
                  fontFamily="monospace"
                >
                  ₹{Math.round(tick).toLocaleString('en-IN')}
                </text>
              </g>
            );
          })}

          {/* Area fill for Total */}
          <path d={areaPath} fill="url(#revenueAreaGrad)" />

          {/* Room Revenue Line */}
          <path d={roomPath} fill="none" stroke="#C6A15B" strokeWidth="2" strokeDasharray="4 2" />

          {/* Restaurant Revenue Line */}
          <path d={restPath} fill="none" stroke="#65745B" strokeWidth="2" strokeDasharray="2 2" />

          {/* Total Revenue Line */}
          <path d={totalPath} fill="none" stroke="#173B2F" strokeWidth="2.5" />

          {/* Data Points */}
          {trend.map((d, i) => (
            <circle
              key={i}
              cx={getX(i)}
              cy={getY(d.totalRevenue)}
              r="3.5"
              fill="#FFFFFF"
              stroke="#173B2F"
              strokeWidth="2"
            >
              <title>{`${d.label}: Total ₹${d.totalRevenue.toLocaleString('en-IN')}, Room ₹${d.roomRevenue.toLocaleString('en-IN')}, Rest ₹${d.restaurantRevenue.toLocaleString('en-IN')}`}</title>
            </circle>
          ))}

          {/* X-axis labels */}
          {trend.map((d, i) => {
            if (i % step !== 0 && i !== pointsCount - 1) return null;
            return (
              <text
                key={i}
                x={getX(i)}
                y={chartHeight - 8}
                textAnchor="middle"
                fontSize="10"
                fill="#737373"
              >
                {d.label}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

interface BookingTrendChartProps {
  trend: Array<{ key: string; label: string; count: number }>;
}

export function BookingTrendChart({ trend }: BookingTrendChartProps) {
  const hasData = trend.some((d) => d.count > 0);
  if (!hasData || trend.length === 0) {
    return (
      <div className="h-44 flex flex-col items-center justify-center text-center p-4 bg-neutral-50/50 rounded-lg border border-dashed border-neutral-200">
        <Calendar className="w-6 h-6 text-neutral-300 mb-1.5" />
        <p className="text-xs font-semibold text-neutral-700">No bookings created in this period</p>
      </div>
    );
  }

  const maxCount = Math.max(...trend.map((d) => d.count), 5);
  const chartHeight = 150;
  const chartWidth = 600;
  const paddingLeft = 40;
  const paddingRight = 20;
  const paddingTop = 15;
  const paddingBottom = 25;

  const innerWidth = chartWidth - paddingLeft - paddingRight;
  const innerHeight = chartHeight - paddingTop - paddingBottom;
  const pointsCount = trend.length;

  const getX = (index: number) => {
    if (pointsCount <= 1) return paddingLeft + innerWidth / 2;
    return paddingLeft + (index / (pointsCount - 1)) * innerWidth;
  };

  const getY = (val: number) => {
    return paddingTop + innerHeight - (val / maxCount) * innerHeight;
  };

  const path = trend
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.count)}`)
    .join(' ');

  const step = Math.max(1, Math.ceil(pointsCount / 7));

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="w-full h-36 min-w-[420px]"
        aria-label="Booking Creation Trend"
        role="img"
      >
        <line
          x1={paddingLeft}
          y1={paddingTop + innerHeight}
          x2={chartWidth - paddingRight}
          y2={paddingTop + innerHeight}
          stroke="#E5E5E5"
        />
        <path d={path} fill="none" stroke="#2563EB" strokeWidth="2.5" />

        {trend.map((d, i) => (
          <circle
            key={i}
            cx={getX(i)}
            cy={getY(d.count)}
            r="3"
            fill="#FFFFFF"
            stroke="#2563EB"
            strokeWidth="2"
          >
            <title>{`${d.label}: ${d.count} bookings`}</title>
          </circle>
        ))}

        {trend.map((d, i) => {
          if (i % step !== 0 && i !== pointsCount - 1) return null;
          return (
            <text
              key={i}
              x={getX(i)}
              y={chartHeight - 6}
              textAnchor="middle"
              fontSize="9"
              fill="#737373"
            >
              {d.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

interface BookingStatusBarProps {
  statusBreakdown: BookingStatusCount[];
  total: number;
}

export function BookingStatusBar({ statusBreakdown, total }: BookingStatusBarProps) {
  if (total === 0) {
    return <p className="text-xs text-neutral-400 italic">No bookings recorded for period.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="w-full h-3.5 rounded-full overflow-hidden flex bg-neutral-100 shadow-inner">
        {statusBreakdown.map((s) => {
          if (s.count === 0) return null;
          const widthPct = (s.count / total) * 100;
          return (
            <div
              key={s.status}
              style={{ width: `${widthPct}%` }}
              className={`${s.color} transition-all duration-300`}
              title={`${s.label}: ${s.count} (${Math.round(widthPct)}%)`}
            />
          );
        })}
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs text-neutral-600">
        {statusBreakdown.map((s) => {
          if (s.count === 0) return null;
          return (
            <span key={s.status} className="inline-flex items-center gap-1">
              <span className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
              <span>{s.label}: <strong className="text-neutral-800">{s.count}</strong></span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

interface TopDishesChartProps {
  items: TopSellingDishItem[];
}

export function TopDishesChart({ items }: TopDishesChartProps) {
  if (!items || items.length === 0) {
    return (
      <div className="h-44 flex flex-col items-center justify-center text-center p-4 bg-neutral-50/50 rounded-lg border border-dashed border-neutral-200">
        <UtensilsCrossed className="w-6 h-6 text-neutral-300 mb-1.5" />
        <p className="text-xs font-semibold text-neutral-700">No dish sales recorded for this period</p>
        <p className="text-[11px] text-neutral-500 mt-0.5">Dishes ordered and settled will rank here automatically.</p>
      </div>
    );
  }

  const maxQty = Math.max(...items.map((i) => i.quantitySold), 1);

  return (
    <div className="space-y-2.5">
      {items.map((dish) => {
        const widthPct = Math.max(8, Math.round((dish.quantitySold / maxQty) * 100));
        return (
          <div key={dish.name} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-neutral-100 text-[10px] font-bold text-neutral-600">
                  {dish.rank}
                </span>
                <span className="font-semibold text-neutral-800 truncate max-w-[180px] sm:max-w-xs">
                  {dish.name}
                </span>
              </div>
              <div className="flex items-center gap-3 font-mono text-[11px]">
                <span className="font-bold text-neutral-900">{dish.quantitySold} sold</span>
                <span className="text-neutral-500">₹{dish.salesValue.toString()}</span>
              </div>
            </div>

            <div className="w-full bg-neutral-100 rounded-full h-2 overflow-hidden">
              <div
                className="bg-resort-gold h-2 rounded-full transition-all duration-300"
                style={{ width: `${widthPct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface RevenueMixBarProps {
  totalRevenue: string;
  roomRevenue: string;
  roomRevenuePct: number;
  restaurantRevenue: string;
  restaurantRevenuePct: number;
}

export function RevenueMixBar({
  totalRevenue,
  roomRevenue,
  roomRevenuePct,
  restaurantRevenue,
  restaurantRevenuePct,
}: RevenueMixBarProps) {
  const isZero = roomRevenuePct === 0 && restaurantRevenuePct === 0;

  return (
    <div className="p-4 bg-neutral-50/70 rounded-lg border border-neutral-200 space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-neutral-600 uppercase tracking-wider text-[10px]">
          Revenue Realization Mix
        </span>
        <span className="font-mono font-bold text-neutral-900 text-sm">
          Total: ₹{totalRevenue}
        </span>
      </div>

      {/* Dual Segment Split Bar */}
      <div className="w-full h-3 rounded-full overflow-hidden flex bg-neutral-200">
        {isZero ? (
          <div className="w-full bg-neutral-200" />
        ) : (
          <>
            <div
              style={{ width: `${roomRevenuePct}%` }}
              className="bg-[#C6A15B] transition-all duration-300"
              title={`Room Revenue: ${roomRevenuePct}%`}
            />
            <div
              style={{ width: `${restaurantRevenuePct}%` }}
              className="bg-[#65745B] transition-all duration-300"
              title={`Restaurant Revenue: ${restaurantRevenuePct}%`}
            />
          </>
        )}
      </div>

      {/* Split Details */}
      <div className="grid grid-cols-2 gap-4 pt-1 text-xs">
        <div className="flex items-center justify-between p-2 rounded bg-white border border-neutral-200">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#C6A15B]" />
            <span className="font-medium text-neutral-700">Room Revenue</span>
          </div>
          <div className="text-right font-mono">
            <span className="font-bold text-neutral-900">₹{roomRevenue}</span>
            <span className="text-[11px] text-neutral-500 ml-1.5 font-sans font-medium">({roomRevenuePct}%)</span>
          </div>
        </div>

        <div className="flex items-center justify-between p-2 rounded bg-white border border-neutral-200">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#65745B]" />
            <span className="font-medium text-neutral-700">Restaurant F&B</span>
          </div>
          <div className="text-right font-mono">
            <span className="font-bold text-neutral-900">₹{restaurantRevenue}</span>
            <span className="text-[11px] text-neutral-500 ml-1.5 font-sans font-medium">({restaurantRevenuePct}%)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

