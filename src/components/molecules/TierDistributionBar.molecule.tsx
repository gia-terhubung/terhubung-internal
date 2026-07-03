import React from 'react';
import type { TierCount } from '@/types/analytics.types';

// Single-hue sequential ramp (brand teal, light → dark) — tiers are ordered
// cheap → expensive, and the legend below carries identity, so one hue is
// correct. Opacity steps against the card surface keep it valid in both themes.
const SEGMENT_OPACITY = [0.3, 0.55, 0.8, 1];

// Horizontal stacked distribution bar + legend with counts. Tier strings are
// free text in the DB — everything renders from data, nothing hardcoded.
export function TierDistributionBar({ tiers }: { tiers: TierCount[] }) {
  const total = tiers.reduce((sum, t) => sum + t.count, 0);
  if (total === 0) {
    return <p className="text-sm text-text-secondary">Belum ada langganan.</p>;
  }

  return (
    <div>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
        {tiers.map(
          (t, i) =>
            t.count > 0 && (
              <div
                key={t.tier}
                title={`${t.tier}: ${t.count}`}
                className="h-full bg-brand first:rounded-l-full last:rounded-r-full"
                style={{
                  width: `${(t.count / total) * 100}%`,
                  opacity: SEGMENT_OPACITY[Math.min(i, SEGMENT_OPACITY.length - 1)],
                }}
              />
            )
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {tiers.map((t, i) => (
          <div key={t.tier} className="flex items-center gap-1.5 text-xs">
            <span
              className="h-2.5 w-2.5 rounded-sm bg-brand"
              style={{ opacity: SEGMENT_OPACITY[Math.min(i, SEGMENT_OPACITY.length - 1)] }}
            />
            <span className="capitalize text-text-secondary">{t.tier}</span>
            <span className="font-medium text-text-primary">{t.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
