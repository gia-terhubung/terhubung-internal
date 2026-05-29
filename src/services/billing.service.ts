import 'server-only';
import { requireInternalAdmin } from '@/services/auth.service';
import { createAdminClient } from '@/libs/supabase/admin';
import type {
  ChurchBillingRow,
  BillingStatus,
  ChurchBillingHistory,
  BillingEventRow,
  PaymentRow,
  ChurchSubscriptionInfo,
} from '@/types/internal.types';

const DAY_MS = 86_400_000;

function computeStatus(currentPeriodEnd: string | null, graceDays: number): BillingStatus {
  if (!currentPeriodEnd) return 'none';
  if (currentPeriodEnd.startsWith('infinity')) return 'active'; // free tier
  const end = new Date(currentPeriodEnd).getTime();
  if (Number.isNaN(end)) return 'none';
  const now = Date.now();
  if (now <= end) return 'active';
  if (now <= end + graceDays * DAY_MS) return 'grace';
  return 'expired';
}

/**
 * Feature C — billing status across ALL churches. Uses service-role because
 * an internal admin is NOT a `user_roles.superadmin`, so `can_view_billing`
 * RLS would otherwise return nothing. Iterates churches so every church shows,
 * even one missing a subscription row.
 */
export async function listAllChurchBilling(): Promise<ChurchBillingRow[]> {
  await requireInternalAdmin();
  const admin = createAdminClient();

  const [{ data: churches, error: chErr }, { data: subs, error: subErr }] = await Promise.all([
    admin.from('churches').select('id, name, city'),
    admin
      .schema('billing')
      .from('church_subscriptions')
      .select('church_id, tier, interval, provider, current_period_end, grace_days'),
  ]);
  if (chErr) throw new Error(chErr.message);
  if (subErr) throw new Error(subErr.message);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subMap = new Map((subs ?? []).map((s: any) => [s.church_id, s]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((churches ?? []) as any[])
    .map((c): ChurchBillingRow => {
      const s = subMap.get(c.id);
      const cpe = s ? String(s.current_period_end) : null;
      const grace = s?.grace_days ?? 0;
      return {
        church_id: c.id,
        church_name: c.name,
        city: c.city ?? null,
        tier: s?.tier ?? '—',
        interval: s?.interval ?? '—',
        provider: s?.provider ?? null,
        current_period_end: cpe ?? '',
        grace_days: grace,
        status: computeStatus(cpe, grace),
      };
    })
    .sort((a, b) => a.church_name.localeCompare(b.church_name));
}

/** Per-church billing history: subscription events + payments. */
export async function getChurchBillingHistory(churchId: string): Promise<ChurchBillingHistory> {
  await requireInternalAdmin();
  const admin = createAdminClient();

  const [{ data: events, error: evErr }, { data: payments, error: payErr }] = await Promise.all([
    admin
      .schema('billing')
      .from('subscription_events')
      .select('id, event_type, from_tier, to_tier, amount_idr, provider, event_occurred_at')
      .eq('church_id', churchId)
      .order('event_occurred_at', { ascending: false })
      .limit(50),
    admin
      .schema('billing')
      .from('payments')
      .select('id, amount_idr, currency, status, provider, created_at')
      .eq('church_id', churchId)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);
  if (evErr) throw new Error(evErr.message);
  if (payErr) throw new Error(payErr.message);

  return {
    events: (events as BillingEventRow[]) ?? [],
    payments: (payments as PaymentRow[]) ?? [],
  };
}

/** Current subscription summary for one church (tier, status, plan price/limits). */
export async function getChurchSubscription(churchId: string): Promise<ChurchSubscriptionInfo | null> {
  await requireInternalAdmin();
  const admin = createAdminClient();

  const { data: sub, error } = await admin
    .schema('billing')
    .from('church_subscriptions')
    .select('tier, interval, current_period_end, grace_days, provider, cancel_at_period_end, started_at, features, plan_id')
    .eq('church_id', churchId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!sub) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = sub as any;
  let price_idr: number | null = null;
  let member_limit: number | null = null;
  let admin_limit: number | null = null;
  if (s.plan_id) {
    const { data: plan } = await admin
      .schema('billing')
      .from('subscription_plans')
      .select('price_idr, member_limit, admin_limit')
      .eq('id', s.plan_id)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = plan as any;
    price_idr = p?.price_idr ?? null;
    member_limit = p?.member_limit ?? null;
    admin_limit = p?.admin_limit ?? null;
  }

  const cpe = String(s.current_period_end);
  return {
    tier: s.tier,
    interval: s.interval,
    status: computeStatus(cpe, s.grace_days ?? 0),
    current_period_end: cpe,
    grace_days: s.grace_days ?? 0,
    provider: s.provider ?? null,
    cancel_at_period_end: !!s.cancel_at_period_end,
    started_at: String(s.started_at),
    features: s.features ?? {},
    price_idr,
    member_limit,
    admin_limit,
  };
}
