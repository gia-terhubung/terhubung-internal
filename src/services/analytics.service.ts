import 'server-only';
import { unstable_cache } from 'next/cache';
import { requireInternalAdmin } from '@/services/auth.service';
import { createAdminClient } from '@/libs/supabase/admin';
import { computeStatus } from '@/services/billing.service';
import type { BillingStatus } from '@/types/internal.types';
import type { DormantChurchRow, PlatformAnalytics, TierCount } from '@/types/analytics.types';

// Raw jsonb payload from internal_platform_analytics().
interface RawAnalytics {
  generated_at: string;
  totals: PlatformAnalytics['totals'];
  new_this_month: PlatformAnalytics['new_this_month'];
  subscriptions: { tier: string; current_period_end: string | null; grace_days: number | null }[];
  revenue_30d_idr: number;
  monthly: PlatformAnalytics['monthly'];
  dormant_churches: {
    church_id: string;
    name: string;
    city: string | null;
    tier: string;
    current_period_end: string | null;
    grace_days: number;
    last_activity_at: string | null;
    created_at: string;
  }[];
}

// Fallback ranking so the tier bar reads cheap → expensive even though tier
// strings are free text in the DB; unknown tiers sort last, alphabetically.
const TIER_ORDER: Record<string, number> = { free: 0, plus: 1, pro: 2 };

// Analytics are aggregate queries over the whole DB — cache for 5 minutes.
// requireInternalAdmin() must stay OUTSIDE this wrapper (cookies are illegal
// inside unstable_cache).
const getCachedAnalytics = unstable_cache(
  async (): Promise<PlatformAnalytics> => {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('internal_platform_analytics');
    if (error) throw new Error(error.message);

    const raw = data as unknown as RawAnalytics;

    const by_status: Record<BillingStatus, number> = { active: 0, grace: 0, expired: 0, none: 0 };
    const tierCounts = new Map<string, number>();
    for (const s of raw.subscriptions ?? []) {
      by_status[computeStatus(s.current_period_end, s.grace_days ?? 0)] += 1;
      tierCounts.set(s.tier, (tierCounts.get(s.tier) ?? 0) + 1);
    }
    // Churches without a subscription row don't appear in `subscriptions`.
    by_status.none += Math.max(0, (raw.totals?.churches ?? 0) - (raw.subscriptions?.length ?? 0));

    const by_tier: TierCount[] = [...tierCounts.entries()]
      .map(([tier, count]) => ({ tier, count }))
      .sort(
        (a, b) =>
          (TIER_ORDER[a.tier] ?? 99) - (TIER_ORDER[b.tier] ?? 99) || a.tier.localeCompare(b.tier)
      );

    const dormant_churches: DormantChurchRow[] = (raw.dormant_churches ?? []).map((d) => ({
      church_id: d.church_id,
      name: d.name,
      city: d.city,
      tier: d.tier,
      status: computeStatus(d.current_period_end, d.grace_days ?? 0),
      last_activity_at: d.last_activity_at,
      created_at: d.created_at,
    }));

    return {
      generated_at: raw.generated_at,
      totals: raw.totals,
      new_this_month: raw.new_this_month,
      billing: { by_tier, by_status, revenue_30d_idr: raw.revenue_30d_idr ?? 0 },
      monthly: raw.monthly ?? [],
      dormant_churches,
    };
  },
  ['platform-analytics'],
  { revalidate: 300, tags: ['platform-analytics'] }
);

export async function getPlatformAnalytics(): Promise<PlatformAnalytics> {
  await requireInternalAdmin();
  return getCachedAnalytics();
}
