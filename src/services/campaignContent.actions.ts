'use server';

import { revalidatePath } from 'next/cache';
import { requireInternalAdmin } from '@/services/auth.service';
import { createAdminClient } from '@/libs/supabase/admin';
import { isUuid, parseQuestionCsv, rpcErrorMessage, validateQuestion } from '@/libs/campaign';
import type { ActionResult } from '@/types/internal.types';
import type { ActionResultWith, QuestionDraft } from '@/types/campaign.types';

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
