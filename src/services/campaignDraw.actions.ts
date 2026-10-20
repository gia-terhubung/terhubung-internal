'use server';

import { requireInternalAdmin } from '@/services/auth.service';
import { createAdminClient } from '@/libs/supabase/admin';
import { isUuid, rpcErrorMessage } from '@/libs/campaign';
import { getPoolSample, getStageState } from '@/services/campaignDraw.service';
import type {
  DrawPrizeType,
  DrawResult,
  DrawWinner,
  FreezeResult,
  RedrawResult,
  ReelName,
  StageState,
} from '@/types/campaignDraw.types';

export async function freezePoolAction(campaignId: string): Promise<FreezeResult> {
  await requireInternalAdmin();
  if (!isUuid(campaignId)) return { ok: false, error: rpcErrorMessage('not_found') };

  const { data, error } = await createAdminClient()
    .schema('campaign')
    .rpc('freeze_pool', { p_campaign: campaignId });
  if (error) return { ok: false, error: rpcErrorMessage(error.message) };

  const counts = data as { normal: number; grand: number };
  return { ok: true, normal: counts.normal, grand: counts.grand };
}

// The winner is picked by campaign.draw_next (server-side random, FOR UPDATE on
// the prize row). This action only forwards the operator id for the audit trail.
export async function drawNextAction(campaignId: string, prizeId: string): Promise<DrawResult> {
  const { user } = await requireInternalAdmin();
  if (!isUuid(campaignId) || !isUuid(prizeId)) return { ok: false, error: rpcErrorMessage('not_found') };
  const db = createAdminClient().schema('campaign');

  // draw_next does not know the URL's campaign: make sure the prize belongs to it (plan-2 precedent).
  const { data: pz, error: pzErr } = await db
    .from('prizes').select('id').eq('id', prizeId).eq('campaign_id', campaignId).maybeSingle();
  if (pzErr) return { ok: false, error: pzErr.message };
  if (!pz) return { ok: false, error: rpcErrorMessage('not_found') };

  const { data, error } = await db.rpc('draw_next', { p_prize_id: prizeId, p_operator: user.id });
  if (error) return { ok: false, error: rpcErrorMessage(error.message) };

  // user_id is NULL (person_id set) for a non-app winner; neither is read here.
  const w = data as DrawWinner & { user_id: string | null; person_id: string | null };
  return {
    ok: true,
    winner: {
      id: w.id,
      prize_id: w.prize_id,
      prize_name: w.prize_name,
      prize_type: w.prize_type,
      display_name: w.display_name,
      church_name: w.church_name,
      drawn_at: String(w.drawn_at),
    },
  };
}

// Announce mode, before publish: campaign.redraw_winner removes the win(s), writes the audit rows and
// draws replacements in one transaction. pool_empty per prize is reported, not raised.
export async function redrawWinnerAction(
  campaignId: string,
  winnerId: string,
  reasonKind: 'unreachable' | 'ineligible',
  note: string
): Promise<RedrawResult> {
  const { user } = await requireInternalAdmin();
  if (!isUuid(campaignId) || !isUuid(winnerId)) return { ok: false, error: rpcErrorMessage('not_found') };
  if (reasonKind !== 'unreachable' && reasonKind !== 'ineligible') return { ok: false, error: rpcErrorMessage('invalid_reason') };
  if (typeof note !== 'string' || !note.trim()) return { ok: false, error: rpcErrorMessage('note_required') };
  const db = createAdminClient().schema('campaign');

  // redraw_winner does not know the URL's campaign: make sure the winner belongs to it (same as drawNextAction).
  const { data: win, error: winErr } = await db
    .from('winners').select('id').eq('id', winnerId).eq('campaign_id', campaignId).maybeSingle();
  if (winErr) return { ok: false, error: winErr.message };
  if (!win) return { ok: false, error: rpcErrorMessage('not_found') };

  const { data, error } = await db.rpc('redraw_winner', {
    p_winner_id: winnerId,
    p_reason_kind: reasonKind,
    p_note: note.trim(),
    p_operator: user.id,
  });
  if (error) return { ok: false, error: rpcErrorMessage(error.message) };

  const r = data as { removed: unknown[]; replacements: unknown[]; pool_empty: unknown[] };
  return { ok: true, replaced: r.replacements?.length ?? 0, poolEmpty: r.pool_empty?.length ?? 0 };
}

export async function getStageStateAction(campaignId: string): Promise<StageState | null> {
  return getStageState(campaignId);
}

export async function getPoolSampleAction(campaignId: string, prizeType: DrawPrizeType): Promise<ReelName[]> {
  if (prizeType !== 'grand' && prizeType !== 'normal') return [];
  return getPoolSample(campaignId, prizeType);
}
