'use server';

import { revalidatePath } from 'next/cache';
import { requireInternalAdmin } from '@/services/auth.service';
import { createAdminClient } from '@/libs/supabase/admin';
import { DEFAULT_RULES, addDays, campaignAssetPrefix, diffDays, isUuid, rpcErrorMessage, sanitizeAssetUrl, sanitizeCampaignInput, validateCampaignInput, wibDate } from '@/libs/campaign';
import type { ActionResult } from '@/types/internal.types';
import { orIlike } from '@/libs/pagination';
import type { ActionResultWith, CampaignInput, CampaignRow, ChurchOption, PrizeInput } from '@/types/campaign.types';

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

const TEST_DATA_TABLES = ['point_events', 'attempts', 'consents', 'dummy_users', 'draw_pool', 'winners'];

async function hasTestData(id: string): Promise<boolean> {
  const db = campaignDb();
  const res = await Promise.all(
    TEST_DATA_TABLES.map((t) => db.from(t).select('*', { count: 'exact', head: true }).eq('campaign_id', id))
  );
  for (const r of res) if (r.error) throw new Error(r.error.message);
  return res.some((r) => (r.count ?? 0) > 0);
}

async function hasPointEvents(id: string): Promise<boolean> {
  const { count, error } = await campaignDb().from('point_events').select('*', { count: 'exact', head: true }).eq('campaign_id', id);
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
  try {
    return await updateCampaign(id, input);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Gagal menyimpan campaign.' };
  }
}

async function updateCampaign(id: string, input: CampaignInput): Promise<ActionResult> {
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
  if (data.is_test !== cur.is_test && (await hasTestData(id))) {
    return {
      ok: false,
      error: 'Data uji coba/peserta sudah ada. Reset data uji dulu (hanya untuk campaign uji coba) sebelum mengubah jenis campaign.',
    };
  }
  if (cur.frozen_at && data.rules.grand_top_n !== cur.rules.grand_top_n) {
    return { ok: false, error: 'Jumlah peringkat teratas terkunci setelah peserta dibekukan.' };
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
  try {
    return await setCampaignStatus(id, next);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Gagal mengubah status.' };
  }
}

async function setCampaignStatus(id: string, next: 'published' | 'draft' | 'archived'): Promise<ActionResult> {
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
  // Same rule for a restore: a real campaign that started (or has points) must not become editable again.
  if (next === 'draft' && cur.status === 'archived' && !cur.is_test && (Date.now() >= Date.parse(cur.start_at) || (await hasPointEvents(id)))) {
    return { ok: false, error: 'Campaign yang sudah berjalan tidak bisa dikembalikan ke draft.' };
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
  try {
    return await duplicateCampaign(id, newStartIso, user.id);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Gagal menduplikat campaign.' };
  }
}

async function duplicateCampaign(id: string, newStartIso: string, userId: string): Promise<ActionResultWith<{ id: string }>> {
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
      created_by: userId,
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
export async function setCampaignChurchesAction(
  id: string,
  churchIds: string[],
  expectedChurchIds: string[]
): Promise<ActionResult> {
  await requireInternalAdmin();
  try {
    return await setCampaignChurches(id, churchIds, expectedChurchIds);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Gagal menyimpan gereja peserta.' };
  }
}

async function setCampaignChurches(id: string, churchIds: string[], expectedChurchIds: string[]): Promise<ActionResult> {
  const validIds = (a: unknown) => Array.isArray(a) && a.every((c) => typeof c === 'string' && isUuid(c));
  if (!validIds(churchIds) || !validIds(expectedChurchIds)) {
    return { ok: false, error: 'Daftar gereja tidak valid.' };
  }
  const cur = await loadCampaign(id);
  if (!cur) return { ok: false, error: 'Campaign tidak ditemukan.' };
  const next = [...new Set(churchIds)];
  const existing = await churchIdsOf(id);
  const expected = new Set(expectedChurchIds);
  if (existing.length !== expected.size || existing.some((c) => !expected.has(c))) {
    return { ok: false, error: 'Daftar gereja sudah berubah. Muat ulang halaman lalu coba lagi.' };
  }
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

const PRIZE_TYPES = ['grand', 'normal', 'top'];
const WINNERS_BLOCK_DELETE = 'Hadiah sudah punya pemenang, tidak bisa dihapus.';

async function prizeWinnerCount(prizeId: string): Promise<number> {
  const { count, error } = await campaignDb().from('winners').select('id', { count: 'exact', head: true }).eq('prize_id', prizeId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

// Quantity is editable at any time (also after freeze / on draw night). The only
// floor is this prize's current winner count.
export async function savePrizeAction(campaignId: string, input: PrizeInput): Promise<ActionResult> {
  await requireInternalAdmin();
  try {
    return await savePrize(campaignId, input);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Gagal menyimpan hadiah.' };
  }
}

async function savePrize(campaignId: string, input: PrizeInput): Promise<ActionResult> {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Data hadiah tidak valid.' };
  if (typeof input.name !== 'string') return { ok: false, error: 'Nama hadiah harus 2–120 karakter.' };
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120) return { ok: false, error: 'Nama hadiah harus 2–120 karakter.' };
  if (!PRIZE_TYPES.includes(input.prize_type)) return { ok: false, error: 'Jenis hadiah tidak dikenal.' };
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 1000) {
    return { ok: false, error: 'Jumlah hadiah harus 1–1000.' };
  }
  if (!Number.isInteger(input.sort_order) || Math.abs(input.sort_order) > 100000) {
    return { ok: false, error: 'Urutan harus angka bulat.' };
  }
  if (input.id !== undefined && (typeof input.id !== 'string' || !isUuid(input.id))) {
    return { ok: false, error: 'Hadiah tidak ditemukan.' };
  }
  if (!(await loadCampaign(campaignId))) return { ok: false, error: 'Campaign tidak ditemukan.' };

  const db = campaignDb();
  const row = {
    prize_type: input.prize_type,
    name,
    image_url: sanitizeAssetUrl(input.image_url, campaignAssetPrefix(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')),
    quantity: input.quantity,
    sort_order: input.sort_order,
  };

  if (input.id) {
    const { data: cur, error: cErr } = await db
      .from('prizes').select('prize_type').eq('id', input.id).eq('campaign_id', campaignId).maybeSingle();
    if (cErr) return { ok: false, error: cErr.message };
    if (!cur) return { ok: false, error: 'Hadiah tidak ditemukan.' };
    const winners = await prizeWinnerCount(input.id);
    if (winners > 0 && (cur as { prize_type: string }).prize_type !== input.prize_type) {
      return { ok: false, error: 'Jenis hadiah tidak bisa diubah setelah ada pemenang.' };
    }
    if (input.quantity < winners) {
      return { ok: false, error: `Jumlah tidak boleh kurang dari pemenang yang sudah diundi (${winners}).` };
    }
    const { error } = await db.from('prizes').update(row).eq('id', input.id).eq('campaign_id', campaignId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await db.from('prizes').insert({ ...row, campaign_id: campaignId });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath('/campaigns/[id]', 'layout');
  return { ok: true };
}

export async function deletePrizeAction(campaignId: string, prizeId: string): Promise<ActionResult> {
  await requireInternalAdmin();
  try {
    if (!isUuid(campaignId) || !isUuid(prizeId)) return { ok: false, error: 'Hadiah tidak ditemukan.' };
    if ((await prizeWinnerCount(prizeId)) > 0) return { ok: false, error: WINNERS_BLOCK_DELETE };
    const { error } = await campaignDb().from('prizes').delete().eq('id', prizeId).eq('campaign_id', campaignId);
    // 23503 = winners.prize_id FK (ON DELETE RESTRICT): a winner was drawn between the check and the delete.
    if (error) return { ok: false, error: error.code === '23503' ? WINNERS_BLOCK_DELETE : error.message };
    revalidatePath('/campaigns/[id]', 'layout');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Gagal menghapus hadiah.' };
  }
}

export async function setSimNowAction(id: string, iso: string | null): Promise<ActionResult> {
  await requireInternalAdmin();
  try {
    if (!isUuid(id)) return { ok: false, error: 'Campaign tidak ditemukan.' };
    const cur = await loadCampaign(id);
    if (!cur) return { ok: false, error: 'Campaign tidak ditemukan.' };
    if (!cur.is_test) return { ok: false, error: 'Waktu simulasi hanya untuk campaign uji coba.' };
    let normalized: string | null = null;
    if (iso !== null) {
      const d = typeof iso === 'string' ? new Date(iso) : null;
      if (!d || Number.isNaN(d.getTime())) return { ok: false, error: 'Waktu simulasi tidak valid.' };
      normalized = d.toISOString();
    }
    const { error } = await campaignDb().from('campaigns').update({ sim_now: normalized, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) {
      return { ok: false, error: error.code === '23514' ? 'Waktu simulasi hanya untuk campaign uji coba.' : error.message };
    }
    revalidatePath('/campaigns/[id]', 'layout');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Gagal menyimpan waktu simulasi.' };
  }
}

export async function seedDummyAction(id: string, count: number): Promise<ActionResultWith<{ seeded: number }>> {
  await requireInternalAdmin();
  try {
    if (!isUuid(id)) return { ok: false, error: 'Campaign tidak ditemukan.' };
    if (!Number.isInteger(count) || count < 1 || count > 2000) return { ok: false, error: 'Jumlah peserta dummy 1–2000.' };
    const cur = await loadCampaign(id);
    if (!cur) return { ok: false, error: 'Campaign tidak ditemukan.' };
    if (!cur.is_test) return { ok: false, error: rpcErrorMessage('not_test') };
    const { data, error } = await campaignDb().rpc('seed_dummy', { p_campaign: id, p_count: count });
    if (error) return { ok: false, error: rpcErrorMessage(error.message) };
    revalidatePath('/campaigns/[id]', 'layout');
    return { ok: true, data: { seeded: Number(data) } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Gagal membuat data dummy.' };
  }
}

export async function resetTestAction(id: string): Promise<ActionResult> {
  await requireInternalAdmin();
  try {
    if (!isUuid(id)) return { ok: false, error: 'Campaign tidak ditemukan.' };
    const cur = await loadCampaign(id);
    if (!cur) return { ok: false, error: 'Campaign tidak ditemukan.' };
    if (!cur.is_test) return { ok: false, error: rpcErrorMessage('not_test') };
    const { error } = await campaignDb().rpc('reset_test', { p_campaign: id });
    if (error) return { ok: false, error: rpcErrorMessage(error.message) };
    revalidatePath('/campaigns/[id]', 'layout');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Gagal mereset data.' };
  }
}
