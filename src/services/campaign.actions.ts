'use server';

import { revalidatePath } from 'next/cache';
import { requireInternalAdmin } from '@/services/auth.service';
import { createAdminClient } from '@/libs/supabase/admin';
import { DEFAULT_RULES, addDays, campaignAssetPrefix, diffDays, isUuid, sanitizeCampaignInput, validateCampaignInput, wibDate } from '@/libs/campaign';
import type { ActionResult } from '@/types/internal.types';
import { orIlike } from '@/libs/pagination';
import type { ActionResultWith, CampaignInput, CampaignRow, ChurchOption } from '@/types/campaign.types';

const COLS =
  'id, name, status, is_test, sim_now, start_at, close_at, draw_at, frozen_at, theme, venue, modules, rules, created_at, updated_at';

function campaignDb() {
  return createAdminClient().schema('campaign');
}

function normalize(i: CampaignInput): CampaignInput {
  return sanitizeCampaignInput(i, campaignAssetPrefix(process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''));
}

async function loadCampaign(id: string): Promise<CampaignRow | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await campaignDb().from('campaigns').select(COLS).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CampaignRow) ?? null;
}

async function hasWinners(id: string): Promise<boolean> {
  const { count, error } = await campaignDb().from('winners').select('id', { count: 'exact', head: true }).eq('campaign_id', id);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

async function churchIdsOf(id: string): Promise<string[]> {
  const { data, error } = await campaignDb().from('campaign_churches').select('church_id').eq('campaign_id', id);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { church_id: string }[]).map((r) => r.church_id);
}

// campaign_get_my_active() shows ONE campaign per user (latest start). Two
// published campaigns whose visible windows [start, draw + 7 days] overlap on a
// shared church would hide one of them, so refuse with the church names.
async function overlapError(campaignId: string, churchIds: string[], startIso: string, drawIso: string): Promise<string | null> {
  if (churchIds.length === 0) return null;
  const db = campaignDb();
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  const { data: others, error } = await db
    .from('campaigns')
    .select('id, name, start_at, draw_at')
    .eq('status', 'published')
    .neq('id', campaignId);
  if (error) throw new Error(error.message);
  const overlapping = ((others ?? []) as { id: string; name: string; start_at: string; draw_at: string }[]).filter(
    (o) => Date.parse(o.start_at) < Date.parse(drawIso) + WEEK && Date.parse(startIso) < Date.parse(o.draw_at) + WEEK
  );
  if (overlapping.length === 0) return null;

  const { data: shared, error: sErr } = await db
    .from('campaign_churches')
    .select('campaign_id, church_id')
    .in('campaign_id', overlapping.map((o) => o.id))
    .in('church_id', churchIds);
  if (sErr) throw new Error(sErr.message);
  const rows = (shared ?? []) as { campaign_id: string; church_id: string }[];
  if (rows.length === 0) return null;

  const { data: churches, error: cErr } = await createAdminClient()
    .from('churches')
    .select('id, name')
    .in('id', [...new Set(rows.map((r) => r.church_id))]);
  if (cErr) throw new Error(cErr.message);
  const churchName = new Map(((churches ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const campaignName = new Map(overlapping.map((o) => [o.id, o.name]));
  const list = rows
    .slice(0, 5)
    .map((r) => `${churchName.get(r.church_id) ?? r.church_id} (${campaignName.get(r.campaign_id)})`)
    .join(', ');
  return `Jadwal bentrok dengan campaign lain yang sudah dipublikasikan untuk: ${list}.`;
}

export async function createCampaignAction(input: CampaignInput): Promise<ActionResultWith<{ id: string }>> {
  const { user } = await requireInternalAdmin();
  const data = normalize(input);
  const err = validateCampaignInput(data);
  if (err) return { ok: false, error: err };

  const { data: row, error } = await campaignDb()
    .from('campaigns')
    .insert({ ...data, status: 'draft', created_by: user.id })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath('/campaigns');
  return { ok: true, data: { id: (row as { id: string }).id } };
}

export async function updateCampaignAction(id: string, input: CampaignInput): Promise<ActionResult> {
  await requireInternalAdmin();
  const data = normalize(input);
  const err = validateCampaignInput(data);
  if (err) return { ok: false, error: err };

  const cur = await loadCampaign(id);
  if (!cur) return { ok: false, error: 'Campaign tidak ditemukan.' };
  const drawn = await hasWinners(id);
  const now = Date.now();
  const changed = (a: string, b: string) => Date.parse(a) !== Date.parse(b);

  // Server-side locks (the form only disables inputs).
  if (changed(cur.start_at, data.start_at) && !cur.is_test && now >= Date.parse(cur.start_at)) {
    return { ok: false, error: 'Tanggal mulai tidak bisa diubah setelah campaign dimulai.' };
  }
  if (changed(cur.close_at, data.close_at) && cur.frozen_at) {
    return { ok: false, error: 'Tanggal tutup tidak bisa diubah setelah peserta dibekukan.' };
  }
  if (changed(cur.draw_at, data.draw_at) && drawn) {
    return { ok: false, error: 'Tanggal undian tidak bisa diubah setelah pengundian dimulai.' };
  }
  if (data.is_test !== cur.is_test && cur.status !== 'draft') {
    return { ok: false, error: 'Jenis campaign (uji coba atau asli) hanya bisa diubah saat draft.' };
  }
  if (cur.status === 'published') {
    const overlap = await overlapError(id, await churchIdsOf(id), data.start_at, data.draw_at);
    if (overlap) return { ok: false, error: overlap };
  }

  const { error } = await campaignDb()
    .from('campaigns')
    .update({ ...data, ...(data.is_test ? {} : { sim_now: null }), updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/campaigns');
  revalidatePath('/campaigns/[id]', 'layout');
  return { ok: true };
}

export async function setCampaignStatusAction(id: string, next: 'published' | 'draft' | 'archived'): Promise<ActionResult> {
  await requireInternalAdmin();
  if (next !== 'published' && next !== 'draft' && next !== 'archived') return { ok: false, error: 'Status tidak dikenal.' };
  const cur = await loadCampaign(id);
  if (!cur) return { ok: false, error: 'Campaign tidak ditemukan.' };
  const allowed = next === 'archived' || (next === 'published' && cur.status === 'draft') || (next === 'draft' && cur.status !== 'draft');
  if (!allowed || cur.status === next) return { ok: false, error: 'Perubahan status tidak diizinkan.' };

  if (next === 'published') {
    const churchIds = await churchIdsOf(id);
    if (churchIds.length === 0) return { ok: false, error: 'Tambahkan minimal satu gereja peserta sebelum dipublikasikan.' };
    const overlap = await overlapError(id, churchIds, cur.start_at, cur.draw_at);
    if (overlap) return { ok: false, error: overlap };
  }
  if (next === 'draft' && cur.status === 'published' && !cur.is_test && Date.now() >= Date.parse(cur.start_at)) {
    return { ok: false, error: 'Campaign yang sudah berjalan tidak bisa dikembalikan ke draft. Arsipkan bila perlu.' };
  }

  const { error } = await campaignDb()
    .from('campaigns')
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/campaigns');
  revalidatePath('/campaigns/[id]', 'layout');
  return { ok: true };
}

// Copies settings, churches, prizes and question slots into a new draft.
// Dates shift by (newStart − oldStart); daily slots shift by the same number of
// WIB days, weekly slots keep their week_no. Not atomic: on any failure the new
// campaign is deleted (FK cascade removes its children).
export async function duplicateCampaignAction(id: string, newStartIso: string): Promise<ActionResultWith<{ id: string }>> {
  const { user } = await requireInternalAdmin();
  if (Number.isNaN(Date.parse(newStartIso))) return { ok: false, error: 'Tanggal mulai baru tidak valid.' };
  const cur = await loadCampaign(id);
  if (!cur) return { ok: false, error: 'Campaign tidak ditemukan.' };

  const db = campaignDb();
  const deltaMs = Date.parse(newStartIso) - Date.parse(cur.start_at);
  const shift = (iso: string) => new Date(Date.parse(iso) + deltaMs).toISOString();
  const deltaDays = diffDays(wibDate(newStartIso), wibDate(cur.start_at));

  const { data: created, error } = await db
    .from('campaigns')
    .insert({
      name: `${cur.name} (salinan)`.slice(0, 120),
      status: 'draft',
      is_test: cur.is_test,
      start_at: shift(cur.start_at),
      close_at: shift(cur.close_at),
      draw_at: shift(cur.draw_at),
      theme: cur.theme,
      venue: cur.venue,
      modules: cur.modules,
      rules: { ...DEFAULT_RULES, ...cur.rules },
      created_by: user.id,
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };
  const newId = (created as { id: string }).id;

  const rollback = async (message: string): Promise<ActionResultWith<{ id: string }>> => {
    const { error: delErr } = await db.from('campaigns').delete().eq('id', newId);
    return {
      ok: false,
      error: delErr ? `${message} Salinan setengah jadi gagal dihapus (${newId}): ${delErr.message}` : message,
    };
  };

  try {
    const churchIds = await churchIdsOf(id);
    if (churchIds.length > 0) {
      const { error: e } = await db.from('campaign_churches').insert(churchIds.map((c) => ({ campaign_id: newId, church_id: c })));
      if (e) return await rollback(e.message);
    }

    const { data: prizes, error: pErr } = await db
      .from('prizes')
      .select('prize_type, name, image_url, quantity, sort_order')
      .eq('campaign_id', id);
    if (pErr) return await rollback(pErr.message);
    if ((prizes ?? []).length > 0) {
      const { error: e } = await db.from('prizes').insert((prizes ?? []).map((p) => ({ ...p, campaign_id: newId })));
      if (e) return await rollback(e.message);
    }

    const { data: slots, error: sErr } = await db
      .from('question_slots')
      .select('kind, for_date, week_no, position, question_id')
      .eq('campaign_id', id);
    if (sErr) return await rollback(sErr.message);
    const shiftedSlots = ((slots ?? []) as { kind: string; for_date: string | null; week_no: number | null; position: number; question_id: string }[]).map(
      (s) => ({
        ...s,
        campaign_id: newId,
        for_date: s.for_date ? addDays(s.for_date, deltaDays) : null,
      })
    );
    if (shiftedSlots.length > 0) {
      const { error: e } = await db.from('question_slots').insert(shiftedSlots);
      if (e) return await rollback(e.message);
    }
  } catch (e) {
    return rollback(e instanceof Error ? e.message : 'Gagal menyalin campaign.');
  }

  revalidatePath('/campaigns');
  return { ok: true, data: { id: newId } };
}

const IMAGE_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const IMAGE_KINDS = ['banner', 'hero', 'prize'];

// Unique path + upsert:false (upsert would need a storage SELECT policy).
// A replaced image stays in the bucket as an orphan — acceptable at this volume.
export async function uploadCampaignImageAction(formData: FormData): Promise<ActionResultWith<{ url: string }>> {
  await requireInternalAdmin();
  const file = formData.get('file');
  const campaignId = String(formData.get('campaignId') ?? '');
  const kind = String(formData.get('kind') ?? '');
  if (!(file instanceof File)) return { ok: false, error: 'File tidak ditemukan.' };
  if (!IMAGE_KINDS.includes(kind)) return { ok: false, error: 'Jenis gambar tidak dikenal.' };
  const ext = IMAGE_EXT[file.type];
  if (!ext) return { ok: false, error: 'Format gambar harus JPG, PNG, atau WebP.' };
  if (file.size > 3 * 1024 * 1024) return { ok: false, error: 'Ukuran gambar maksimal 3 MB.' };
  if (!(await loadCampaign(campaignId))) return { ok: false, error: 'Campaign tidak ditemukan.' };

  const path = `${campaignId}/${kind}-${crypto.randomUUID()}.${ext}`;
  if (campaignAssetPrefix(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '') === null) {
    return { ok: false, error: 'Konfigurasi storage belum lengkap.' };
  }
  const storage = createAdminClient().storage.from('campaign-assets');
  const { error } = await storage.upload(path, file, { contentType: file.type, upsert: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { url: storage.getPublicUrl(path).data.publicUrl } };
}

export async function searchChurchesAction(query: string): Promise<ChurchOption[]> {
  await requireInternalAdmin();
  const q = query.trim();
  if (!q) return [];
  const { data, error } = await createAdminClient()
    .from('churches')
    .select('id, name, city')
    .or(orIlike(['name', 'city'], q))
    .order('name')
    .limit(10);
  if (error) throw new Error(error.message);
  return (data ?? []) as ChurchOption[];
}

// Replace the participating set. Removing a church mid-campaign is allowed
// (its members drop out of leaderboards; their ledger rows stay).
export async function setCampaignChurchesAction(id: string, churchIds: string[]): Promise<ActionResult> {
  await requireInternalAdmin();
  if (!Array.isArray(churchIds) || !churchIds.every((c) => typeof c === 'string' && isUuid(c))) {
    return { ok: false, error: 'Daftar gereja tidak valid.' };
  }
  const cur = await loadCampaign(id);
  if (!cur) return { ok: false, error: 'Campaign tidak ditemukan.' };
  const next = [...new Set(churchIds)];
  const existing = await churchIdsOf(id);
  const toRemove = existing.filter((c) => !next.includes(c));
  const toAdd = next.filter((c) => !existing.includes(c));
  if (cur.status === 'published') {
    if (next.length === 0) return { ok: false, error: 'Campaign yang dipublikasikan harus punya minimal satu gereja.' };
    // Only newly added churches can introduce a clash.
    const overlap = await overlapError(id, toAdd, cur.start_at, cur.draw_at);
    if (overlap) return { ok: false, error: overlap };
  }

  if (toAdd.length > 0) {
    const { data: found, error: fErr } = await createAdminClient().from('churches').select('id').in('id', toAdd);
    if (fErr) return { ok: false, error: fErr.message };
    if ((found ?? []).length !== toAdd.length) return { ok: false, error: 'Gereja tidak ditemukan.' };
  }

  // Insert before delete: a midway failure leaves a harmless superset.
  const db = campaignDb();
  if (toAdd.length > 0) {
    const { error } = await db.from('campaign_churches').insert(toAdd.map((c) => ({ campaign_id: id, church_id: c })));
    if (error) return { ok: false, error: error.message };
  }
  if (toRemove.length > 0) {
    const { error } = await db.from('campaign_churches').delete().eq('campaign_id', id).in('church_id', toRemove);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath('/campaigns');
  revalidatePath('/campaigns/[id]', 'layout');
  return { ok: true };
}
