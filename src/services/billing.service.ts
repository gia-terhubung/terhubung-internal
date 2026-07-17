import 'server-only';
import { requireInternalAdmin } from '@/services/auth.service';
import { createAdminClient } from '@/libs/supabase/admin';
import { clampPage, escapeLike, orIlike, pageRange, type Paged } from '@/libs/pagination';
import type {
  ChurchBillingRow,
  BillingStatus,
  ChurchBillingHistory,
  BillingEventRow,
  PaymentRow,
  ChurchSubscriptionInfo,
  ChurchPlanOption,
  PaymentAuditRow,
  EventAuditRow,
  OutboxRow,
  PlanRateRow,
  AddonPlanRow,
} from '@/types/internal.types';

// PostgREST can't embed public.churches from billing.* queries (cross-schema),
// so audit lists join church names in JS.
async function churchNameMap(ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (unique.length === 0) return new Map();
  const admin = createAdminClient();
  const { data, error } = await admin.from('churches').select('id, name').in('id', unique);
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
}

// Church-name search for billing.* lists (same cross-schema limitation): resolve
// matching church ids first, then filter with church_id.in.(...). Capped — a
// search matching >100 churches only surfaces rows for the first 100.
async function searchChurchIds(raw: string, cap = 100): Promise<string[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('churches')
    .select('id')
    .ilike('name', `%${escapeLike(raw)}%`)
    .limit(cap);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string }[]).map((c) => c.id);
}

// Combined .or() filter: local ILIKE columns + church-name matches by id.
async function billingSearchFilter(localColumns: string[], search: string): Promise<string> {
  let filter = orIlike(localColumns, search);
  const churchIds = await searchChurchIds(search);
  if (churchIds.length) filter += `,church_id.in.(${churchIds.join(',')})`;
  return filter;
}

const DAY_MS = 86_400_000;

export function computeStatus(currentPeriodEnd: string | null, graceDays: number): BillingStatus {
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
    .select(
      'tier, interval, current_period_end, grace_days, provider, cancel_at_period_end, started_at, features, plan_id, addon_count, pending_plan_id, pending_change_at, pending_apply_error'
    )
    .eq('church_id', churchId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!sub) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = sub as any;
  let price_idr: number | null = null;
  let member_limit: number | null = null;
  let admin_limit: number | null = null;
  let sympathizer_limit: number | null = null;
  if (s.plan_id) {
    const { data: plan } = await admin
      .schema('billing')
      .from('subscription_plans')
      .select('price_idr, member_limit, admin_limit, sympathizer_limit')
      .eq('id', s.plan_id)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = plan as any;
    price_idr = p?.price_idr ?? null;
    member_limit = p?.member_limit ?? null;
    admin_limit = p?.admin_limit ?? null;
    sympathizer_limit = p?.sympathizer_limit ?? null;
  }

  // Resolve the scheduled plan's tier/interval for the pending-change banner.
  let pending_tier: string | null = null;
  let pending_interval: string | null = null;
  if (s.pending_plan_id) {
    const { data: pendingPlan } = await admin
      .schema('billing')
      .from('subscription_plans')
      .select('tier, interval')
      .eq('id', s.pending_plan_id)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pp = pendingPlan as any;
    pending_tier = pp?.tier ?? null;
    pending_interval = pp?.interval ?? null;
  }

  const cpe = String(s.current_period_end);
  const status = computeStatus(cpe, s.grace_days ?? 0);

  // Effective caps: plan limit + addon_count × bonus while a plus/pro
  // subscription is active/grace. Null (unlimited) base limits stay null.
  const addon_count: number = s.addon_count ?? 0;
  let effective_member_limit = member_limit;
  let effective_sympathizer_limit = sympathizer_limit;
  if (
    addon_count > 0 &&
    (s.tier === 'plus' || s.tier === 'pro') &&
    (status === 'active' || status === 'grace')
  ) {
    const { data: addon } = await admin
      .schema('billing')
      .from('addon_plans')
      .select('member_bonus, sympathizer_bonus')
      .eq('code', 'cap_boost_50')
      .eq('interval', 'month')
      .is('effective_until', null)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = addon as any;
    if (a) {
      if (member_limit != null) effective_member_limit = member_limit + addon_count * a.member_bonus;
      if (sympathizer_limit != null) {
        effective_sympathizer_limit = sympathizer_limit + addon_count * a.sympathizer_bonus;
      }
    }
  }

  return {
    tier: s.tier,
    interval: s.interval,
    status,
    current_period_end: cpe,
    grace_days: s.grace_days ?? 0,
    provider: s.provider ?? null,
    cancel_at_period_end: !!s.cancel_at_period_end,
    started_at: String(s.started_at),
    features: s.features ?? {},
    price_idr,
    member_limit,
    admin_limit,
    sympathizer_limit,
    addon_count,
    effective_member_limit,
    effective_sympathizer_limit,
    pending_plan_id: s.pending_plan_id ?? null,
    pending_change_at: s.pending_change_at ? String(s.pending_change_at) : null,
    pending_apply_error: s.pending_apply_error ?? null,
    pending_tier,
    pending_interval,
  };
}

/** Global payments audit — server-paginated, newest first. */
export async function listRecentPaymentsPage(params: {
  page: number;
  search: string;
}): Promise<Paged<PaymentAuditRow>> {
  await requireInternalAdmin();
  const admin = createAdminClient();
  const { search } = params;

  const filter = search ? await billingSearchFilter(['provider', 'provider_payment_id'], search) : '';

  let countQuery = admin.schema('billing').from('payments').select('id', { count: 'exact', head: true });
  if (filter) countQuery = countQuery.or(filter);
  const { count, error: countError } = await countQuery;
  if (countError) throw new Error(countError.message);
  const total = count ?? 0;

  const page = clampPage(params.page, total);
  const { from, to } = pageRange(page);

  let rowsQuery = admin
    .schema('billing')
    .from('payments')
    .select('id, church_id, provider, provider_payment_id, amount_idr, currency, status, created_at');
  if (filter) rowsQuery = rowsQuery.or(filter);
  const { data, error } = await rowsQuery
    .order('created_at', { ascending: false })
    .order('id')
    .range(from, to);
  if (error) throw new Error(error.message);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[];
  const names = await churchNameMap(rows.map((r) => r.church_id));
  return {
    rows: rows.map((r) => ({
      id: r.id,
      church_id: r.church_id ?? null,
      church_name: r.church_id ? (names.get(r.church_id) ?? '—') : '—',
      provider: r.provider,
      provider_payment_id: r.provider_payment_id ?? null,
      amount_idr: r.amount_idr,
      currency: r.currency,
      status: r.status,
      created_at: String(r.created_at),
    })),
    total,
    page,
  };
}

/** Global subscription-events audit — server-paginated, newest first. */
export async function listRecentEventsPage(params: {
  page: number;
  search: string;
}): Promise<Paged<EventAuditRow>> {
  await requireInternalAdmin();
  const admin = createAdminClient();
  const { search } = params;

  const filter = search ? await billingSearchFilter(['event_type'], search) : '';

  let countQuery = admin
    .schema('billing')
    .from('subscription_events')
    .select('id', { count: 'exact', head: true })
    .not('church_id', 'is', null);
  if (filter) countQuery = countQuery.or(filter);
  const { count, error: countError } = await countQuery;
  if (countError) throw new Error(countError.message);
  const total = count ?? 0;

  const page = clampPage(params.page, total);
  const { from, to } = pageRange(page);

  let rowsQuery = admin
    .schema('billing')
    .from('subscription_events')
    .select('id, church_id, event_type, from_tier, to_tier, amount_idr, provider, event_occurred_at')
    .not('church_id', 'is', null);
  if (filter) rowsQuery = rowsQuery.or(filter);
  const { data, error } = await rowsQuery
    .order('event_occurred_at', { ascending: false })
    .order('id')
    .range(from, to);
  if (error) throw new Error(error.message);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[];
  const names = await churchNameMap(rows.map((r) => r.church_id));
  return {
    rows: rows.map((r) => ({
      id: r.id,
      church_id: r.church_id,
      church_name: names.get(r.church_id) ?? '—',
      event_type: r.event_type,
      from_tier: r.from_tier ?? null,
      to_tier: r.to_tier ?? null,
      amount_idr: r.amount_idr ?? null,
      provider: r.provider ?? null,
      event_occurred_at: String(r.event_occurred_at),
    })),
    total,
    page,
  };
}

/** Billing email outbox — pending + failed rows, server-paginated, newest first. */
export async function listOutboxPage(params: {
  page: number;
  search: string;
}): Promise<Paged<OutboxRow>> {
  await requireInternalAdmin();
  const admin = createAdminClient();
  const { search } = params;

  const filter = search ? await billingSearchFilter(['to_email', 'subject'], search) : '';

  let countQuery = admin
    .schema('billing')
    .from('email_outbox')
    .select('id', { count: 'exact', head: true })
    .in('status', ['pending', 'failed']);
  if (filter) countQuery = countQuery.or(filter);
  const { count, error: countError } = await countQuery;
  if (countError) throw new Error(countError.message);
  const total = count ?? 0;

  const page = clampPage(params.page, total);
  const { from, to } = pageRange(page);

  let rowsQuery = admin
    .schema('billing')
    .from('email_outbox')
    .select('id, to_email, church_id, subject, status, attempts, last_error, sent_at, created_at')
    .in('status', ['pending', 'failed']);
  if (filter) rowsQuery = rowsQuery.or(filter);
  const { data, error } = await rowsQuery
    .order('created_at', { ascending: false })
    .order('id')
    .range(from, to);
  if (error) throw new Error(error.message);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[];
  const names = await churchNameMap(rows.map((r) => r.church_id));
  return {
    rows: rows.map((r) => ({
      id: r.id,
      to_email: r.to_email,
      church_id: r.church_id ?? null,
      church_name: r.church_id ? (names.get(r.church_id) ?? null) : null,
      subject: r.subject,
      status: r.status,
      attempts: r.attempts,
      last_error: r.last_error ?? null,
      sent_at: r.sent_at ? String(r.sent_at) : null,
      created_at: String(r.created_at),
    })),
    total,
    page,
  };
}

/** Read-only rate card: active plans (both scopes). Editing stays SQL-only. */
export async function listPlanRateCard(): Promise<PlanRateRow[]> {
  await requireInternalAdmin();
  const admin = createAdminClient();

  const { data, error } = await admin
    .schema('billing')
    .from('subscription_plans')
    .select(
      'id, scope, tier, interval, price_idr, member_limit, sympathizer_limit, admin_limit, staff_limit, management_limit, finance_limit, features'
    )
    .is('effective_until', null)
    .order('scope', { ascending: true })
    .order('price_idr', { ascending: true, nullsFirst: true });
  if (error) throw new Error(error.message);

  return (data as PlanRateRow[]) ?? [];
}

/** Live capacity add-on plans. Read-only — add-on pricing edits stay SQL-only. */
export async function listAddonPlans(): Promise<AddonPlanRow[]> {
  await requireInternalAdmin();
  const admin = createAdminClient();

  const { data, error } = await admin
    .schema('billing')
    .from('addon_plans')
    .select('id, code, interval, price_idr, member_bonus, sympathizer_bonus')
    .is('effective_until', null)
    .order('interval', { ascending: true });
  if (error) throw new Error(error.message);

  return (data as AddonPlanRow[]) ?? [];
}

/** Active church plans, cheapest first — for the manual promote/demote picker. */
export async function listChurchPlans(): Promise<ChurchPlanOption[]> {
  await requireInternalAdmin();
  const admin = createAdminClient();

  const { data, error } = await admin
    .schema('billing')
    .from('subscription_plans')
    .select('id, tier, interval, price_idr')
    .eq('scope', 'church')
    .is('effective_until', null)
    .order('price_idr', { ascending: true, nullsFirst: true });
  if (error) throw new Error(error.message);

  return (data as ChurchPlanOption[]) ?? [];
}
