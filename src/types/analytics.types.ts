import type { BillingStatus } from '@/types/internal.types';

// Shape returned by getPlatformAnalytics() — derived from the
// internal_platform_analytics() jsonb payload plus TS-side status computation.

export interface PlatformMonthlyRow {
  month: string; // 'YYYY-MM'
  checkins: number;
  prayers: number;
  posts: number;
  visitations: number;
  new_churches: number;
  revenue_idr: number;
}

export interface DormantChurchRow {
  church_id: string;
  name: string;
  city: string | null;
  tier: string;
  status: BillingStatus;
  last_activity_at: string | null; // null = no activity in the last 12 months
  created_at: string;
}

export interface TierCount {
  tier: string;
  count: number;
}

export interface PlatformAnalytics {
  generated_at: string;
  totals: {
    churches: number;
    profiles: number;
    members: number;
    sympathizers: number;
    people: number;
    families: number;
    push_devices: number;
  };
  new_this_month: {
    churches: number;
    profiles: number;
  };
  billing: {
    by_tier: TierCount[];
    by_status: Record<BillingStatus, number>;
    revenue_30d_idr: number;
  };
  monthly: PlatformMonthlyRow[];
  dormant_churches: DormantChurchRow[];
}
