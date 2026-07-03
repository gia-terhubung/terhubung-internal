import React from 'react';

// KPI stat tile for the dashboard — same card styling as the nav cards.
export function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border-color bg-bg-secondary p-5">
      <div className="text-xs uppercase tracking-wider text-text-secondary">{label}</div>
      <div className="mt-1 text-2xl font-bold text-text-primary">{value}</div>
      {sub != null && <div className="mt-1 text-xs text-text-secondary">{sub}</div>}
    </div>
  );
}
