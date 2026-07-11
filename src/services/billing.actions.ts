'use server';

import { revalidatePath } from 'next/cache';
import { requireInternalAdmin } from '@/services/auth.service';
import { createAdminClient } from '@/libs/supabase/admin';
import type {
  ActionResult,
  ApplyAddonChangeInput,
  ApplySubscriptionChangeInput,
  RenewSubscriptionInput,
} from '@/types/internal.types';

// Tier ordering for deciding upgraded vs downgraded vs renewed.
const TIER_RANK: Record<string, number> = { free: 0, plus: 1, pro: 2 };

// Manually move a church up or down a tier. Wraps the
// billing.apply_manual_subscription_change RPC, which swaps the plan, clears any
// pending change, optionally records a payment, and logs a subscription event.
export async function applyManualSubscriptionChangeAction(
  input: ApplySubscriptionChangeInput
): Promise<ActionResult> {
  await requireInternalAdmin();

  if (!input.churchId || !input.planId) return { ok: false, error: 'Data tidak lengkap.' };

  let amountIdr: number | null = null;
  if (input.amountIdr != null) {
    if (!Number.isInteger(input.amountIdr) || input.amountIdr <= 0) {
      return { ok: false, error: 'Jumlah pembayaran tidak valid.' };
    }
    amountIdr = input.amountIdr;
  }

  const admin = createAdminClient();

  // Target plan tier/interval drives the period end + event type.
  const { data: plan, error: planErr } = await admin
    .schema('billing')
    .from('subscription_plans')
    .select('tier, interval')
    .eq('id', input.planId)
    .maybeSingle();
  if (planErr) return { ok: false, error: planErr.message };
  if (!plan) return { ok: false, error: 'Paket tidak ditemukan.' };

  // Current tier to classify the change direction.
  const { data: sub, error: subErr } = await admin
    .schema('billing')
    .from('church_subscriptions')
    .select('tier')
    .eq('church_id', input.churchId)
    .maybeSingle();
  if (subErr) return { ok: false, error: subErr.message };
  if (!sub) return { ok: false, error: 'Gereja belum punya baris langganan.' };

  const newTier = (plan as { tier: string }).tier;
  const interval = (plan as { interval: string }).interval;
  const currentTier = (sub as { tier: string }).tier;

  // Period end: free is open-ended, else now + one interval (mirrors apply_pending_changes).
  let periodEnd: string;
  if (newTier === 'free') {
    periodEnd = 'infinity';
  } else {
    const end = new Date();
    if (interval === 'year') end.setFullYear(end.getFullYear() + 1);
    else end.setMonth(end.getMonth() + 1);
    periodEnd = end.toISOString();
  }

  const newRank = TIER_RANK[newTier] ?? 0;
  const curRank = TIER_RANK[currentTier] ?? 0;
  const eventType = newRank > curRank ? 'upgraded' : newRank < curRank ? 'downgraded' : 'renewed';

  const { error } = await admin.schema('billing').rpc('apply_manual_subscription_change', {
    p_church_id: input.churchId,
    p_plan_id: input.planId,
    p_period_end: periodEnd,
    p_amount_idr: amountIdr,
    p_provider: 'manual',
    p_event_type: eventType,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/churches/${input.churchId}`);
  revalidatePath('/billing');
  return { ok: true };
}

// Renew the current plan: keep tier, extend one interval. Uses the same atomic
// RPC (payment + event + reset of cancel/pending markers — the modal copy warns
// about the resets).
export async function renewSubscriptionAction(input: RenewSubscriptionInput): Promise<ActionResult> {
  await requireInternalAdmin();

  if (!input.churchId) return { ok: false, error: 'Data tidak lengkap.' };

  let amountIdr: number | null = null;
  if (input.amountIdr != null) {
    if (!Number.isInteger(input.amountIdr) || input.amountIdr <= 0) {
      return { ok: false, error: 'Jumlah pembayaran tidak valid.' };
    }
    amountIdr = input.amountIdr;
  }
  const paymentRef = input.paymentRef?.trim() || null;

  const admin = createAdminClient();
  const { data: sub, error: subErr } = await admin
    .schema('billing')
    .from('church_subscriptions')
    .select('plan_id, tier, interval, current_period_end')
    .eq('church_id', input.churchId)
    .maybeSingle();
  if (subErr) return { ok: false, error: subErr.message };
  if (!sub) return { ok: false, error: 'Gereja belum punya baris langganan.' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = sub as any;
  const cpe = String(s.current_period_end);
  if (s.tier === 'free' || cpe.startsWith('infinity')) {
    return { ok: false, error: 'Paket gratis tidak perlu diperpanjang.' };
  }

  // Base = max(now, current period end): a long-expired church renews from
  // today, not from a period end that is already in the past. (Deliberate
  // hardening vs the raw SQL template.)
  const currentEnd = new Date(cpe).getTime();
  const base = new Date(Math.max(Date.now(), Number.isNaN(currentEnd) ? 0 : currentEnd));
  if (s.interval === 'year') base.setFullYear(base.getFullYear() + 1);
  else base.setMonth(base.getMonth() + 1);

  const { error } = await admin.schema('billing').rpc('apply_manual_subscription_change', {
    p_church_id: input.churchId,
    p_plan_id: s.plan_id,
    p_period_end: base.toISOString(),
    p_amount_idr: amountIdr,
    p_payment_ref: paymentRef,
    p_provider: 'manual',
    p_event_type: 'renewed',
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/churches/${input.churchId}`);
  revalidatePath('/billing');
  return { ok: true };
}

// Marker only: the billing cron downgrades to free when the period ends.
export async function setCancelAtPeriodEndAction(input: {
  churchId: string;
  cancel: boolean;
}): Promise<ActionResult> {
  await requireInternalAdmin();
  if (!input.churchId) return { ok: false, error: 'Data tidak lengkap.' };

  const admin = createAdminClient();
  if (input.cancel) {
    const { data: sub } = await admin
      .schema('billing')
      .from('church_subscriptions')
      .select('tier')
      .eq('church_id', input.churchId)
      .maybeSingle();
    if ((sub as { tier: string } | null)?.tier === 'free') {
      return { ok: false, error: 'Paket gratis tidak punya periode untuk dibatalkan.' };
    }
  }

  // No touch trigger on church_subscriptions — set updated_at explicitly.
  const { error } = await admin
    .schema('billing')
    .from('church_subscriptions')
    .update({ cancel_at_period_end: input.cancel, updated_at: new Date().toISOString() })
    .eq('church_id', input.churchId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/churches/${input.churchId}`);
  revalidatePath('/billing');
  return { ok: true };
}

// Schedule a downgrade to the active free plan at the end of the period.
export async function scheduleDowngradeToFreeAction(input: {
  churchId: string;
}): Promise<ActionResult> {
  await requireInternalAdmin();
  if (!input.churchId) return { ok: false, error: 'Data tidak lengkap.' };

  const admin = createAdminClient();
  const { data: sub, error: subErr } = await admin
    .schema('billing')
    .from('church_subscriptions')
    .select('tier, current_period_end')
    .eq('church_id', input.churchId)
    .maybeSingle();
  if (subErr) return { ok: false, error: subErr.message };
  if (!sub) return { ok: false, error: 'Gereja belum punya baris langganan.' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = sub as any;
  const cpe = String(s.current_period_end);
  if (s.tier === 'free' || cpe.startsWith('infinity')) {
    return { ok: false, error: 'Gereja sudah di paket gratis.' };
  }

  const { data: freePlan, error: planErr } = await admin
    .schema('billing')
    .from('subscription_plans')
    .select('id')
    .eq('scope', 'church')
    .eq('tier', 'free')
    .eq('interval', 'month')
    .is('effective_until', null)
    .maybeSingle();
  if (planErr) return { ok: false, error: planErr.message };
  if (!freePlan) return { ok: false, error: 'Paket free tidak ditemukan.' };

  const { error } = await admin
    .schema('billing')
    .from('church_subscriptions')
    .update({
      pending_plan_id: (freePlan as { id: string }).id,
      pending_change_at: cpe,
      updated_at: new Date().toISOString(),
    })
    .eq('church_id', input.churchId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/churches/${input.churchId}`);
  revalidatePath('/billing');
  return { ok: true };
}

// Clear a stuck/mistaken scheduled change.
export async function resetPendingChangeAction(input: { churchId: string }): Promise<ActionResult> {
  await requireInternalAdmin();
  if (!input.churchId) return { ok: false, error: 'Data tidak lengkap.' };

  const admin = createAdminClient();
  const { error } = await admin
    .schema('billing')
    .from('church_subscriptions')
    .update({
      pending_plan_id: null,
      pending_change_at: null,
      pending_apply_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('church_id', input.churchId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/churches/${input.churchId}`);
  revalidatePath('/billing');
  return { ok: true };
}

// Re-queue a FAILED outbox email. Guarded to failed rows only — resetting a
// sent row would re-send it.
export async function retryOutboxEmailAction(input: { outboxId: string }): Promise<ActionResult> {
  await requireInternalAdmin();
  if (!input.outboxId) return { ok: false, error: 'Data tidak lengkap.' };

  const admin = createAdminClient();
  const { data, error } = await admin
    .schema('billing')
    .from('email_outbox')
    .update({ status: 'pending', attempts: 0, last_error: null })
    .eq('id', input.outboxId)
    .eq('status', 'failed')
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: 'Hanya email berstatus gagal yang bisa diulang.' };
  }

  revalidatePath('/billing/outbox');
  return { ok: true };
}

// Set a church's TOTAL capacity add-on count (absolute-set semantics, not a
// delta). Wraps the billing.apply_addon_change RPC, which validates the tier
// and subscription status, optionally records a payment, and logs an
// addon_changed event.
export async function applyAddonChangeAction(input: ApplyAddonChangeInput): Promise<ActionResult> {
  await requireInternalAdmin();

  if (!input.churchId) return { ok: false, error: 'Data tidak lengkap.' };
  if (!Number.isInteger(input.addonCount) || input.addonCount < 0) {
    return { ok: false, error: 'Jumlah add-on harus angka bulat ≥ 0.' };
  }

  let amountIdr: number | null = null;
  if (input.amountIdr != null) {
    if (!Number.isInteger(input.amountIdr) || input.amountIdr <= 0) {
      return { ok: false, error: 'Jumlah pembayaran tidak valid.' };
    }
    amountIdr = input.amountIdr;
  }
  const paymentRef = input.paymentRef?.trim() || null;

  const admin = createAdminClient();
  const { error } = await admin.schema('billing').rpc('apply_addon_change', {
    p_church_id: input.churchId,
    p_addon_count: input.addonCount,
    p_amount_idr: amountIdr,
    p_payment_ref: paymentRef,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/churches/${input.churchId}`);
  revalidatePath('/billing');
  return { ok: true };
}
