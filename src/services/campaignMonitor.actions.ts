'use server';

import { requireInternalAdmin } from '@/services/auth.service';
import { createAdminClient } from '@/libs/supabase/admin';
import { isUuid, rpcErrorMessage } from '@/libs/campaign';
import type { ActionResult } from '@/types/internal.types';
import type { DrawCandidateRow, PointEventRow } from '@/types/campaign.types';

function campaignDb() {
  return createAdminClient().schema('campaign');
}

export async function listUserEventsAction(campaignId: string, userId: string): Promise<PointEventRow[]> {
  await requireInternalAdmin();
  if (!isUuid(campaignId) || !isUuid(userId)) throw new Error('ID tidak valid.');
  const { data, error } = await campaignDb()
    .from('point_events')
    .select('id, created_at, source, points, status, reason_code, day_wib, note')
    .eq('campaign_id', campaignId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as PointEventRow[];
}

export async function adjustPointsAction(input: {
  campaignId: string;
  userId: string;
  points: number;
  note: string;
}): Promise<ActionResult> {
  const { user } = await requireInternalAdmin();
  try {
    if (!isUuid(input.campaignId) || !isUuid(input.userId)) return { ok: false, error: 'ID tidak valid.' };
    if (!Number.isInteger(input.points) || input.points === 0 || Math.abs(input.points) > 1000) {
      return { ok: false, error: 'Poin harus angka bulat bukan nol, maksimal ±1000.' };
    }
    const note = typeof input.note === 'string' ? input.note.trim() : '';
    if (note.length < 3) return { ok: false, error: 'Catatan alasan wajib diisi (minimal 3 karakter).' };
    const { error } = await campaignDb().rpc('adjust_points', {
      p_campaign: input.campaignId,
      p_user: input.userId,
      p_points: input.points,
      p_note: note,
      p_operator: user.id,
    });
    if (error) return { ok: false, error: rpcErrorMessage(error.message) };
      return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Gagal menyimpan penyesuaian.' };
  }
}

export async function revokeEventAction(input: { campaignId: string; eventId: number; note: string }): Promise<ActionResult> {
  const { user } = await requireInternalAdmin();
  try {
    if (!isUuid(input.campaignId)) return { ok: false, error: 'ID tidak valid.' };
    if (!Number.isInteger(input.eventId) || input.eventId <= 0) return { ok: false, error: 'Poin tidak valid.' };
    const note = typeof input.note === 'string' ? input.note.trim() : '';
    if (note.length < 3) return { ok: false, error: 'Catatan alasan wajib diisi (minimal 3 karakter).' };
    // Ensure the event belongs to this campaign before revoking.
    const { data: ev, error: evErr } = await campaignDb()
      .from('point_events').select('id').eq('id', input.eventId).eq('campaign_id', input.campaignId).maybeSingle();
    if (evErr) return { ok: false, error: evErr.message };
    if (!ev) return { ok: false, error: 'Poin tidak ditemukan di campaign ini.' };
    const { error } = await campaignDb().rpc('revoke_event', { p_event_id: input.eventId, p_note: note, p_operator: user.id });
    if (error) return { ok: false, error: rpcErrorMessage(error.message) };
      return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Gagal membatalkan poin.' };
  }
}

export async function searchDrawCandidatesAction(campaignId: string, search: string): Promise<DrawCandidateRow[]> {
  await requireInternalAdmin();
  if (!isUuid(campaignId)) throw new Error('ID tidak valid.');
  const q = typeof search === 'string' ? search.trim().slice(0, 100) : '';
  if (q.length < 2) return [];
  const { data, error } = await campaignDb().rpc('search_draw_candidates', { p_campaign: campaignId, p_search: q, p_limit: 20 });
  if (error) throw new Error(error.message);
  return (data ?? []) as DrawCandidateRow[];
}

export async function addDrawExclusionAction(input: {
  campaignId: string;
  userId: string | null;
  personId: string | null;
  note: string;
}): Promise<ActionResult> {
  const { user } = await requireInternalAdmin();
  try {
    if (!isUuid(input.campaignId)) return { ok: false, error: 'ID tidak valid.' };
    const userId = isUuid(input.userId) ? input.userId : null;
    const personId = isUuid(input.personId) ? input.personId : null;
    if ((userId === null) === (personId === null)) return { ok: false, error: 'Pilih satu orang dari hasil pencarian.' };
    const note = typeof input.note === 'string' ? input.note.trim() : '';
    if (note.length < 3) return { ok: false, error: 'Catatan alasan wajib diisi (minimal 3 karakter).' };
    const { error } = await campaignDb().rpc('exclude_from_draw', {
      p_campaign: input.campaignId,
      p_user: userId,
      p_person: personId,
      p_note: note,
      p_operator: user.id,
    });
    if (error) return { ok: false, error: rpcErrorMessage(error.message) };
      return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Gagal menyimpan pengecualian.' };
  }
}

export async function removeDrawExclusionAction(input: { campaignId: string; exclusionId: string }): Promise<ActionResult> {
  await requireInternalAdmin();
  try {
    if (!isUuid(input.campaignId) || !isUuid(input.exclusionId)) return { ok: false, error: 'ID tidak valid.' };
    // Ensure the exclusion belongs to this campaign before removing.
    const { data: ex, error: exErr } = await campaignDb()
      .from('draw_exclusions').select('id').eq('id', input.exclusionId).eq('campaign_id', input.campaignId).maybeSingle();
    if (exErr) return { ok: false, error: exErr.message };
    if (!ex) return { ok: false, error: rpcErrorMessage('not_found') };
    const { error } = await campaignDb().rpc('remove_draw_exclusion', { p_exclusion_id: input.exclusionId });
    if (error) return { ok: false, error: rpcErrorMessage(error.message) };
      return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Gagal menghapus pengecualian.' };
  }
}
