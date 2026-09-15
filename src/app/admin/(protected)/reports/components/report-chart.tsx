'use client';

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface DataPoint {
  label: string;
  value: number;
}

interface Series {
  key: string;
  color: string;
  label: string;
}

interface ReportChartProps {
  data: DataPoint[][];
  series?: Series[];
  height?: number;
  title?: string;
  type?: 'bar' | 'line';
}

const CHART_PADDING = { top: 20, right: 20, bottom: 40, left: 60 };

export function ReportChart({
  data,
  series,
  height = 260,
  title,
  type = 'bar',
}: ReportChartProps) {
  const chartWidth = 600;
  const chartHeight = height - CHART_PADDING.top - CHART_PADDING.bottom;

  const allValues = useMemo(
    () => data.flatMap((d) => d.map((p) => p.value)),
    [data]
  );
  const maxValue = Math.max(...allValues, 1);

  const labels = useMemo(
    () => (data[0] ?? []).map((p) => p.label),
    [data]
  );

  const seriesColors = useMemo(() => {
    if (series && series.length > 0) return series.map((s) => s.color);
    return ['#173B2F', '#C6A15B', '#65745B', '#1E4D3A', '#D4B77A'];
  }, [series]);

  const totalSeries = data.length;
  const groupCount = labels.length;
  const groupWidth = (chartWidth - CHART_PADDING.left - CHART_PADDING.right) / groupCount;
  const barWidth = Math.min(groupWidth / (totalSeries + 1), 24);

  if (groupCount === 0 || allValues.length === 0) {
    return (
      <Card>
        {title && (
          <CardHeader>
            <CardTitle>{title}</CardTitle>
          </CardHeader>
        )}
        <CardContent>
          <div
            className="flex items-center justify-center text-resort-muted text-xs"
            style={{ height }}
          >
            No data available
          </div>
        </CardContent>
      </Card>
    );
  }

  const yTicks = 5;
  const yStep = maxValue / yTicks;

  const scaleX = (i: number) =>
    CHART_PADDING.left + i * groupWidth + groupWidth / 2;

  const scaleY = (v: number) =>
    CHART_PADDING.top + chartHeight - (v / maxValue) * chartHeight;

  const barY = (seriesIdx: number, groupIdx: number) => {
    const value = data[seriesIdx]?.[groupIdx]?.value ?? 0;
    return scaleY(value);
  };

  const linePath = (seriesIdx: number) => {
    const points = labels.map((_, i) => {
      const x = scaleX(i);
      const y = barY(seriesIdx, i);
      return `${x},${y}`;
    });
    return `M${points.join(' L')}`;
  };

  const areaPath = (seriesIdx: number) => {
    const baseline = CHART_PADDING.top + chartHeight;
    const points = labels.map((_, i) => `${scaleX(i)},${barY(seriesIdx, i)}`);
    return `M${scaleX(0)},${baseline} L${points.join(' L')} L${scaleX(labels.length - 1)},${baseline} Z`;
  };

  const fullWidth = chartWidth;
  const fullHeight = height;

  return (
    <Card>
      {title && (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent>
        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${fullWidth} ${fullHeight}`}
            className="w-full"
            style={{ height: fullHeight }}
          >
            {/* Grid lines */}
            {Array.from({ length: yTicks + 1 }).map((_, i) => {
              const y = CHART_PADDING.top + (i / yTicks) * chartHeight;
              const val = Math.round((yTicks - i) * yStep);
              return (
                <g key={`grid-${i}`}>
                  <line
                    x1={CHART_PADDING.left}
                    y1={y}
                    x2={fullWidth - CHART_PADDING.right}
                    y2={y}
                    stroke="#EDE7DA"
                    strokeWidth={1}
                  />
                  <text
                    x={CHART_PADDING.left - 8}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-resort-muted"
                    fontSize={10}
                  >
                    {val}
                  </text>
                </g>
              );
            })}

            {/* X axis labels */}
            {labels.map((label, i) => (
              <text
                key={`label-${i}`}
                x={scaleX(i)}
                y={fullHeight - 8}
                textAnchor="middle"
                className="fill-resort-muted"
                fontSize={10}
              >
                {label}
              </text>
            ))}

            {type === 'bar' ? (
              /* Bars */
              data.map((seriesData, si) =>
                seriesData.map((point, gi) => {
                  const x = scaleX(gi) - (totalSeries * barWidth) / 2 + si * barWidth;
                  const y = barY(si, gi);
                  const barH = CHART_PADDING.top + chartHeight - y;
                  if (barH <= 0) return null;
                  return (
                    <rect
                      key={`bar-${si}-${gi}`}
                      x={x}
                      y={y}
                      width={barWidth - 2}
                      height={barH}
                      rx={2}
                      fill={seriesColors[si % seriesColors.length]}
                      className="opacity-80 hover:opacity-100 transition-opacity"
                    />
                  );
                })
              )
            ) : (
              /* Line + area */
              data.map((_, si) => (
                <g key={`line-${si}`}>
                  <path
                    d={areaPath(si)}
                    fill={seriesColors[si % seriesColors.length]}
                    opacity={0.1}
                  />
                  <path
                    d={linePath(si)}
                    fill="none"
                    stroke={seriesColors[si % seriesColors.length]}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {labels.map((_, gi) => (
                    <circle
                      key={`dot-${si}-${gi}`}
                      cx={scaleX(gi)}
                      cy={barY(si, gi)}
                      r={3}
                      fill={seriesColors[si % seriesColors.length]}
                      className="hover:r-4 transition-all"
                    />
                  ))}
                </g>
              ))
            )}
          </svg>
        </div>

        {series && series.length > 1 && (
          <div className="flex items-center justify-center gap-4 mt-3">
            {series.map((s, i) => (
              <div key={s.key} className="flex items-center gap-1.5">
                <div
                  className="w-2.5 h-2.5 rounded-sm"
                  style={{ backgroundColor: s.color }}
                />
                <span className="text-[11px] text-resort-muted">{s.label}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
