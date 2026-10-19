'use server';

import { revalidatePath } from 'next/cache';
import { requireInternalAdmin } from '@/services/auth.service';
import { createAdminClient } from '@/libs/supabase/admin';
import {
  campaignDays, isUuid, lastDay, parseQuestionCsv, rpcErrorMessage, slotWriteErrorMessage, validateQuestion, weekNo, wibDate,
} from '@/libs/campaign';
import { escapeLike } from '@/libs/pagination';
import type { ActionResult } from '@/types/internal.types';
import type { ActionResultWith, CampaignRow, QuestionCategory, QuestionDraft, QuestionOption } from '@/types/campaign.types';

const MAX_CSV_CHARS = 1_000_000;
const FETCH_PAGE = 1000; // PostgREST default max-rows

function campaignDb() {
  return createAdminClient().schema('campaign');
}

function clean(d: QuestionDraft): QuestionDraft {
  return {
    prompt: d.prompt.trim(),
    option_a: d.option_a.trim(),
    option_b: d.option_b.trim(),
    correct: d.correct,
    category: d.category,
    difficulty: d.difficulty,
  };
}

/** Server actions take untrusted input: reject wrong shapes before validateQuestion calls string methods. */
function isDraftShape(d: unknown): d is QuestionDraft {
  if (typeof d !== 'object' || d === null) return false;
  const x = d as Record<string, unknown>;
  return typeof x.prompt === 'string' && typeof x.option_a === 'string' && typeof x.option_b === 'string'
    && typeof x.correct === 'string' && typeof x.category === 'string' && typeof x.difficulty === 'number';
}

/** True when any slot using this question has an attempt (users already saw/answered it). Throws on query errors. */
async function questionAnswered(questionId: string): Promise<boolean> {
  const db = campaignDb();
  const { data: slots, error } = await db.from('question_slots').select('id').eq('question_id', questionId);
  if (error) throw new Error(error.message);
  const slotIds = ((slots ?? []) as { id: string }[]).map((s) => s.id);
  if (slotIds.length === 0) return false;
  const { count, error: aErr } = await db.from('attempts').select('id', { count: 'exact', head: true }).in('slot_id', slotIds);
  if (aErr) throw new Error(aErr.message);
  return (count ?? 0) > 0;
}

export async function saveQuestionAction(input: QuestionDraft & { id?: string }): Promise<ActionResult> {
  await requireInternalAdmin();
  try {
    if (!isDraftShape(input)) return { ok: false, error: 'Data soal tidak valid.' };
    if (input.id !== undefined && !isUuid(input.id)) return { ok: false, error: 'ID soal tidak valid.' };
    const d = clean(input);
    const err = validateQuestion(d);
    if (err) return { ok: false, error: err };
    const db = campaignDb();

    if (input.id) {
      // Fairness: once anyone opened it, the wording/answer is frozen.
      // App pre-check for UX; the plan 1 trigger raises question_in_use as the real guard.
      if (await questionAnswered(input.id)) {
        return { ok: false, error: rpcErrorMessage('question_in_use') };
      }
      const { error } = await db.from('questions').update(d).eq('id', input.id);
      if (error) return { ok: false, error: rpcErrorMessage(error.message) };
    } else {
      const { error } = await db.from('questions').insert(d);
      if (error) return { ok: false, error: error.message };
    }
    revalidatePath('/campaigns/questions');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Gagal menyimpan soal.' };
  }
}

// Archive hides a question from pickers/auto-fill; existing slots keep it. Always allowed.
export async function archiveQuestionAction(id: string, archive: boolean): Promise<ActionResult> {
  await requireInternalAdmin();
  if (!isUuid(id)) return { ok: false, error: 'ID soal tidak valid.' };
  try {
    const { error } = await campaignDb()
      .from('questions')
      .update({ archived_at: archive === true ? new Date().toISOString() : null })
      .eq('id', id);
    if (error) return { ok: false, error: error.message };
    revalidatePath('/campaigns/questions');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Gagal mengarsipkan soal.' };
  }
}

// All-or-nothing validation: any bad row rejects the file (first 10 errors shown).
export async function importQuestionsCsvAction(csv: string): Promise<ActionResultWith<{ inserted: number; skipped: number }>> {
  await requireInternalAdmin();
  if (typeof csv !== 'string') return { ok: false, error: 'File tidak valid.' };
  if (csv.length > MAX_CSV_CHARS) return { ok: false, error: 'File terlalu besar.' };
  const { rows, errors } = parseQuestionCsv(csv);
  if (errors.length > 0) {
    const more = errors.length > 10 ? `\n…dan ${errors.length - 10} kesalahan lain.` : '';
    return { ok: false, error: errors.slice(0, 10).join('\n') + more };
  }
  if (rows.length === 0) return { ok: false, error: 'Tidak ada baris soal.' };
  if (rows.length > 500) return { ok: false, error: 'Maksimal 500 soal per file.' };

  try {
    const db = campaignDb();
    const key = (p: string) => p.trim().toLowerCase();
    // Page through the whole library (PostgREST caps a single response at 1000 rows).
    const seen = new Set<string>();
    for (let from = 0; ; from += FETCH_PAGE) {
      const { data, error } = await db.from('questions').select('prompt').order('id').range(from, from + FETCH_PAGE - 1);
      if (error) return { ok: false, error: error.message };
      const batch = (data ?? []) as { prompt: string }[];
      for (const r of batch) seen.add(key(r.prompt));
      if (batch.length < FETCH_PAGE) break;
    }

    const fresh: QuestionDraft[] = [];
    for (const r of rows) {
      if (seen.has(key(r.prompt))) continue;
      seen.add(key(r.prompt));
      fresh.push(clean(r));
    }
    if (fresh.length > 0) {
      const { error } = await db.from('questions').insert(fresh);
      if (error) return { ok: false, error: error.message };
    }
    revalidatePath('/campaigns/questions');
    return { ok: true, data: { inserted: fresh.length, skipped: rows.length - fresh.length } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Gagal mengimpor soal.' };
  }
}

export async function searchQuestionsAction(params: {
  query: string;
  category: QuestionCategory | '';
  campaignId: string;
}): Promise<QuestionOption[]> {
  await requireInternalAdmin();
  if (!isUuid(params.campaignId)) throw new Error('Campaign tidak valid.');
  const db = campaignDb();
  let q = db.from('questions')
    .select('id, prompt, option_a, option_b, correct, category, difficulty')
    .is('archived_at', null);
  if (params.query.trim()) q = q.ilike('prompt', `%${escapeLike(params.query.trim())}%`);
  if (params.category) q = q.eq('category', params.category);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(20);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as (QuestionDraft & { id: string })[];
  if (rows.length === 0) return [];

  const { data: slots, error: sErr } = await db.from('question_slots').select('question_id, campaign_id').in('question_id', rows.map((r) => r.id));
  if (sErr) throw new Error(sErr.message);
  const used = (slots ?? []) as { question_id: string; campaign_id: string }[];
  return rows.map((r) => ({
    ...r,
    used_count: used.filter((s) => s.question_id === r.id).length,
    used_here: used.some((s) => s.question_id === r.id && s.campaign_id === params.campaignId),
  }));
}

async function loadCampaignRow(id: string): Promise<CampaignRow | null> {
  const { data, error } = await campaignDb()
    .from('campaigns')
    .select('id, name, status, is_test, sim_now, start_at, close_at, draw_at, frozen_at, theme, venue, modules, rules, created_at, updated_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CampaignRow) ?? null;
}

async function slotAnswered(slotId: string): Promise<boolean> {
  const { count, error } = await campaignDb().from('attempts').select('id', { count: 'exact', head: true }).eq('slot_id', slotId);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

export async function assignSlotAction(input: {
  campaignId: string;
  kind: 'daily' | 'weekly';
  forDate?: string;
  weekNo?: number;
  position: number;
  questionId: string | null;
}): Promise<ActionResult> {
  await requireInternalAdmin();
  try {
    if (!isUuid(input.campaignId)) return { ok: false, error: 'Campaign tidak valid.' };
    if (input.questionId !== null && !isUuid(input.questionId)) return { ok: false, error: 'Soal tidak valid.' };
    if (input.kind !== 'daily' && input.kind !== 'weekly') return { ok: false, error: 'Jenis soal tidak valid.' };
    const c = await loadCampaignRow(input.campaignId);
    if (!c) return { ok: false, error: 'Campaign tidak ditemukan.' };
    const db = campaignDb();

    let existingQ = db.from('question_slots').select('id').eq('campaign_id', c.id).eq('kind', input.kind);
    // Range checks apply to assigning only; clearing a slot outside the period
    // (left behind after close_at moved earlier) is always allowed.
    const assigning = input.questionId !== null;
    if (input.kind === 'daily') {
      const first = wibDate(c.start_at);
      const last = lastDay(c.close_at);
      if (!input.forDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.forDate)) return { ok: false, error: 'Tanggal wajib diisi.' };
      if (assigning && (input.forDate < first || input.forDate > last)) {
        return { ok: false, error: 'Tanggal di luar periode campaign.' };
      }
      existingQ = existingQ.eq('for_date', input.forDate);
    } else {
      const maxWeek = weekNo(c.start_at, lastDay(c.close_at));
      if (!Number.isInteger(input.weekNo) || !input.weekNo || input.weekNo < 1) return { ok: false, error: 'Minggu tidak valid.' };
      if (assigning && input.weekNo > maxWeek) return { ok: false, error: 'Minggu di luar periode campaign.' };
      if (!Number.isInteger(input.position) || input.position < 1 || input.position > 5) return { ok: false, error: 'Posisi soal mingguan harus 1–5.' };
      existingQ = existingQ.eq('week_no', input.weekNo).eq('position', input.position);
    }
    const { data: existing, error: exErr } = await existingQ.maybeSingle();
    if (exErr) return { ok: false, error: exErr.message };
    const slotId = (existing as { id: string } | null)?.id ?? null;

    // Fairness: never swap a question someone already opened. App pre-check for
    // UX; plan 1's slot_locked trigger / attempts FK RESTRICT are the real guard.
    if (slotId && (await slotAnswered(slotId))) {
      return { ok: false, error: rpcErrorMessage('slot_locked') };
    }

    if (input.questionId === null) {
      if (slotId) {
        const { error } = await db.from('question_slots').delete().eq('id', slotId);
        if (error) return { ok: false, error: slotWriteErrorMessage(error) };
      }
    } else {
      const { data: q, error: qErr } = await db.from('questions').select('archived_at').eq('id', input.questionId).maybeSingle();
      if (qErr) return { ok: false, error: qErr.message };
      if (!q) return { ok: false, error: 'Soal tidak ditemukan.' };
      if ((q as { archived_at: string | null }).archived_at) return { ok: false, error: 'Soal ini diarsipkan.' };
      const { error } = slotId
        ? await db.from('question_slots').update({ question_id: input.questionId }).eq('id', slotId)
        : await db.from('question_slots').insert({
            campaign_id: c.id,
            kind: input.kind,
            for_date: input.kind === 'daily' ? input.forDate : null,
            week_no: input.kind === 'weekly' ? input.weekNo : null,
            position: input.kind === 'daily' ? 1 : input.position,
            question_id: input.questionId,
          });
      if (error) return { ok: false, error: slotWriteErrorMessage(error) };
    }

    revalidatePath('/campaigns/[id]', 'layout');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Gagal menyimpan jadwal.' };
  }
}

// Fill empty daily dates with 'umum' questions never used in ANY campaign
// (oldest first). Never reuses — reports how many days stay empty instead.
export async function autofillDailyAction(campaignId: string): Promise<ActionResultWith<{ filled: number; missing: number }>> {
  await requireInternalAdmin();
  try {
    if (!isUuid(campaignId)) return { ok: false, error: 'Campaign tidak valid.' };
    const c = await loadCampaignRow(campaignId);
    if (!c) return { ok: false, error: 'Campaign tidak ditemukan.' };
    const db = campaignDb();

    const { data: daily, error: dErr } = await db.from('question_slots').select('for_date').eq('campaign_id', c.id).eq('kind', 'daily');
    if (dErr) return { ok: false, error: dErr.message };

    // Page through (PostgREST caps a single response at 1000 rows).
    const usedIds = new Set<string>();
    for (let from = 0; ; from += FETCH_PAGE) {
      const { data, error } = await db.from('question_slots').select('id, question_id').order('id').range(from, from + FETCH_PAGE - 1);
      if (error) return { ok: false, error: error.message };
      const batch = (data ?? []) as { question_id: string }[];
      for (const r of batch) usedIds.add(r.question_id);
      if (batch.length < FETCH_PAGE) break;
    }
    const pool: string[] = [];
    for (let from = 0; ; from += FETCH_PAGE) {
      const { data, error } = await db.from('questions').select('id')
        .eq('category', 'umum').is('archived_at', null).order('created_at').order('id').range(from, from + FETCH_PAGE - 1);
      if (error) return { ok: false, error: error.message };
      const batch = (data ?? []) as { id: string }[];
      for (const r of batch) pool.push(r.id);
      if (batch.length < FETCH_PAGE) break;
    }

    const filledDates = new Set(((daily ?? []) as { for_date: string }[]).map((r) => r.for_date));
    const empty = campaignDays(c.start_at, c.close_at).filter((d) => !filledDates.has(d));
    const fresh = pool.filter((id) => !usedIds.has(id));

    const rows = empty.slice(0, fresh.length).map((d, i) => ({
      campaign_id: c.id, kind: 'daily', for_date: d, week_no: null, position: 1, question_id: fresh[i],
    }));
    if (rows.length > 0) {
      const { error } = await db.from('question_slots').insert(rows);
      if (error) return { ok: false, error: slotWriteErrorMessage(error) };
    }
    revalidatePath('/campaigns/[id]', 'layout');
    return { ok: true, data: { filled: rows.length, missing: empty.length - rows.length } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Gagal mengisi otomatis.' };
  }
}

// One-click cleanup for slots outside the period (daily after last_day, weekly
// weeks whose Monday is after last_day). Locked slots (already opened) stay.
export async function removeSlotsAction(campaignId: string, slotIds: string[]): Promise<ActionResultWith<{ removed: number; kept: number }>> {
  await requireInternalAdmin();
  try {
    if (!isUuid(campaignId)) return { ok: false, error: 'Campaign tidak valid.' };
    if (!Array.isArray(slotIds) || slotIds.length > 500 || !slotIds.every(isUuid)) return { ok: false, error: 'Slot tidak valid.' };
    if (slotIds.length === 0) return { ok: true, data: { removed: 0, kept: 0 } };
    const db = campaignDb();
    const { data: lockedRows, error: lErr } = await db.rpc('locked_slots', { p_campaign: campaignId });
    if (lErr) return { ok: false, error: lErr.message };
    const locked = new Set(((lockedRows ?? []) as { slot_id: string }[]).map((r) => r.slot_id));
    const removable = slotIds.filter((id) => !locked.has(id));
    let removed = 0;
    if (removable.length > 0) {
      const { data, error } = await db.from('question_slots').delete().eq('campaign_id', campaignId).in('id', removable).select('id');
      if (error) return { ok: false, error: slotWriteErrorMessage(error) };
      removed = (data ?? []).length;
    }
    revalidatePath('/campaigns/[id]', 'layout');
    return { ok: true, data: { removed, kept: slotIds.length - removed } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Gagal menghapus soal.' };
  }
}
