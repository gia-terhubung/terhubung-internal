'use client';

import { useState } from 'react';

export interface MonthlyPoint {
  month: string; // 'YYYY-MM'
  value: number;
}

const MONTH_INITIALS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

function monthInitial(month: string): string {
  const m = Number(month.slice(5, 7));
  return MONTH_INITIALS[m - 1] ?? '·';
}

function monthLabel(month: string): string {
  const d = new Date(`${month}-01T00:00:00`);
  return Number.isNaN(d.getTime())
    ? month
    : d.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });
}

// Minimal single-series column chart (12 month buckets) — pure divs, no chart
// dependency. Single series: the card title names it, so no legend.
export function MonthlyBarChart({
  points,
  formatValue = (n) => new Intl.NumberFormat('id-ID').format(n),
  height = 64,
}: {
  points: MonthlyPoint[];
  formatValue?: (n: number) => string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...points.map((p) => p.value), 0);

  return (
    <div>
      <div className="relative flex items-end gap-0.5" style={{ height }}>
        {hover != null && points[hover] && (
          <div className="pointer-events-none absolute -top-7 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-border-color bg-bg-primary px-2 py-0.5 text-xs text-text-primary shadow-md">
            {monthLabel(points[hover].month)} · {formatValue(points[hover].value)}
          </div>
        )}
        {points.map((p, i) => (
          <div
            key={p.month}
            className="group flex h-full flex-1 cursor-default items-end"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <div
              className={`w-full rounded-t ${hover === i ? 'bg-brand-hover' : 'bg-brand'} ${
                p.value === 0 ? 'opacity-25' : ''
              }`}
              style={{
                // Zero months keep a 2px stub so the timeline stays readable.
                height: max > 0 && p.value > 0 ? `${Math.max((p.value / max) * 100, 4)}%` : 2,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-0.5">
        {points.map((p) => (
          <div key={p.month} className="flex-1 text-center text-[10px] text-text-secondary">
            {monthInitial(p.month)}
          </div>
        ))}
      </div>
    </div>
  );
}
