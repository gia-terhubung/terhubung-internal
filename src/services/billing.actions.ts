'use server';

import { revalidatePath } from 'next/cache';
import { requireInternalAdmin } from '@/services/auth.service';
import { createAdminClient } from '@/libs/supabase/admin';
import type { ActionResult, ApplySubscriptionChangeInput } from '@/types/internal.types';

// Tier ordering for deciding upgraded vs downgraded vs renewed.
const TIER_RANK: Record<string, number> = { free: 0, plus: 1, pro: 2, custom: 3 };

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
