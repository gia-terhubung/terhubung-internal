import 'server-only';
import { cache } from 'react';
import { requireInternalAdmin } from '@/services/auth.service';
import { createAdminClient } from '@/libs/supabase/admin';
import { computeStatus, defaultCampaignInput, drawAtLocked, drawModeOf, isUuid, statusLabel } from '@/libs/campaign';
import { PAGE_SIZE, clampPage, escapeLike, pageRange, type Paged } from '@/libs/pagination';
import type {
  AdminStatsRow, AdminTopRow, AdminWinnerRow, CampaignDetail, CampaignInput, CampaignListItem, CampaignRow, ChurchOption, DrawExclusionRow, MonitorData, WinnerRemovalRow, ParticipantRow, PrizeRow, QuestionCategory, QuestionRow, SlotRow,
} from '@/types/campaign.types';

const CAMPAIGN_COLS =
  'id, name, status, is_test, sim_now, start_at, close_at, draw_at, frozen_at, announced_at, theme, venue, modules, rules, created_at, updated_at';

function campaignDb() {
  return createAdminClient().schema('campaign');
}

export async function listCampaigns(): Promise<CampaignListItem[]> {
  await requireInternalAdmin();
  const db = campaignDb();
  const [cRes, ccRes, wRes] = await Promise.all([
    db.from('campaigns').select(CAMPAIGN_COLS).order('start_at', { ascending: false }),
    db.from('campaign_churches').select('campaign_id'),
    db.from('winners').select('campaign_id'),
  ]);
  if (cRes.error) throw new Error(cRes.error.message);
  if (ccRes.error) throw new Error(ccRes.error.message);
  if (wRes.error) throw new Error(wRes.error.message);

  const churchCount = new Map<string, number>();
  for (const r of (ccRes.data ?? []) as { campaign_id: string }[]) {
    churchCount.set(r.campaign_id, (churchCount.get(r.campaign_id) ?? 0) + 1);
  }
  const drawn = new Set(((wRes.data ?? []) as { campaign_id: string }[]).map((r) => r.campaign_id));
  const now = Date.now();

  return ((cRes.data ?? []) as CampaignRow[]).map((c) => ({
    ...c,
    church_count: churchCount.get(c.id) ?? 0,
    has_winners: drawn.has(c.id),
    computed_status: computeStatus(c, drawn.has(c.id), now),
    status_label: statusLabel(c, computeStatus(c, drawn.has(c.id), now), now),
  }));
}

/** Campaign + churches + lifecycle + server-enforced edit locks. Cached per request (layout + page). */
export const getCampaignDetail = cache(async (id: string): Promise<CampaignDetail | null> => {
  await requireInternalAdmin();
  if (!isUuid(id)) return null;
  const admin = createAdminClient();
  const db = admin.schema('campaign');

  const { data, error } = await db.from('campaigns').select(CAMPAIGN_COLS).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const campaign = data as CampaignRow;

  const [ccRes, wRes, wkRes] = await Promise.all([
    db.from('campaign_churches').select('church_id').eq('campaign_id', id),
    db.from('winners').select('id', { count: 'exact', head: true }).eq('campaign_id', id),
    db.from('question_slots').select('kind, week_no, for_date').eq('campaign_id', id),
  ]);
  if (ccRes.error) throw new Error(ccRes.error.message);
  if (wRes.error) throw new Error(wRes.error.message);
  if (wkRes.error) throw new Error(wkRes.error.message);

  const ids = ((ccRes.data ?? []) as { church_id: string }[]).map((r) => r.church_id);
  let churches: ChurchOption[] = [];
  if (ids.length > 0) {
    const { data: ch, error: chErr } = await admin.from('churches').select('id, name, city').in('id', ids).order('name');
    if (chErr) throw new Error(chErr.message);
    churches = (ch ?? []) as ChurchOption[];
  }

  const hasWinners = (wRes.count ?? 0) > 0;
  const now = Date.now();
  return {
    campaign,
    churches,
    has_winners: hasWinners,
    weekly_weeks: [...new Set(((wkRes.data ?? []) as { kind: string; week_no: number | null }[])
      .filter((r) => r.kind === 'weekly' && r.week_no !== null).map((r) => r.week_no as number))],
    daily_dates: ((wkRes.data ?? []) as { kind: string; for_date: string | null }[])
      .filter((r) => r.kind === 'daily' && r.for_date !== null).map((r) => r.for_date as string),
    status: computeStatus(campaign, hasWinners, now),
    status_label: statusLabel(campaign, computeStatus(campaign, hasWinners, now), now),
    // Same rules updateCampaignAction enforces server-side.
    locks: {
      start: !campaign.is_test && now >= Date.parse(campaign.start_at),
      close: campaign.frozen_at !== null,
      draw: drawAtLocked({ ...campaign, draw_mode: drawModeOf(campaign.rules) }, hasWinners, now),
      isTest: campaign.status !== 'draft',
      topN: campaign.frozen_at !== null,
      drawMode: campaign.frozen_at !== null || hasWinners,
    },
  };
});

export async function getNewCampaignDefaults(): Promise<CampaignInput> {
  await requireInternalAdmin();
  return defaultCampaignInput(Date.now());
}

export async function listPrizes(campaignId: string): Promise<PrizeRow[]> {
  await requireInternalAdmin();
  if (!isUuid(campaignId)) return [];
  const db = campaignDb();
  const [pRes, wRes] = await Promise.all([
    db.from('prizes').select('id, campaign_id, prize_type, name, image_url, quantity, sort_order')
      .eq('campaign_id', campaignId).order('sort_order'),
    db.from('winners').select('prize_id').eq('campaign_id', campaignId),
  ]);
  if (pRes.error) throw new Error(pRes.error.message);
  if (wRes.error) throw new Error(wRes.error.message);
  const won = new Map<string, number>();
  for (const w of (wRes.data ?? []) as { prize_id: string }[]) won.set(w.prize_id, (won.get(w.prize_id) ?? 0) + 1);
  return ((pRes.data ?? []) as Omit<PrizeRow, 'winner_count'>[]).map((p) => ({ ...p, winner_count: won.get(p.id) ?? 0 }));
}

const QUESTION_COLS = 'id, prompt, option_a, option_b, correct, category, difficulty, archived_at, created_at';

export async function listQuestionsPage(params: {
  page: number;
  search: string;
  category: QuestionCategory | '';
  difficulty: 0 | 1 | 2 | 3;
  archived: boolean;
}): Promise<Paged<QuestionRow>> {
  await requireInternalAdmin();
  const db = campaignDb();
  const { search, category, difficulty, archived } = params;

  let countQ = db.from('questions').select('id', { count: 'exact', head: true });
  countQ = archived ? countQ.not('archived_at', 'is', null) : countQ.is('archived_at', null);
  if (search) countQ = countQ.ilike('prompt', `%${escapeLike(search)}%`);
  if (category) countQ = countQ.eq('category', category);
  if (difficulty) countQ = countQ.eq('difficulty', difficulty);
  const { count, error: cErr } = await countQ;
  if (cErr) throw new Error(cErr.message);
  const total = count ?? 0;
  const page = clampPage(params.page, total);
  const { from, to } = pageRange(page);

  let rowsQ = db.from('questions').select(QUESTION_COLS);
  rowsQ = archived ? rowsQ.not('archived_at', 'is', null) : rowsQ.is('archived_at', null);
  if (search) rowsQ = rowsQ.ilike('prompt', `%${escapeLike(search)}%`);
  if (category) rowsQ = rowsQ.eq('category', category);
  if (difficulty) rowsQ = rowsQ.eq('difficulty', difficulty);
  const { data, error } = await rowsQ.order('created_at', { ascending: false }).order('id').range(from, to);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Omit<QuestionRow, 'used_in'>[];

  const ids = rows.map((r) => r.id);
  const usage = new Map<string, QuestionRow['used_in']>();
  if (ids.length > 0) {
    const { data: slots, error: sErr } = await db
      .from('question_slots')
      .select('question_id, campaign_id, kind, for_date, week_no, campaigns(name)')
      .in('question_id', ids);
    if (sErr) throw new Error(sErr.message);
    for (const s of (slots ?? []) as unknown as {
      question_id: string; campaign_id: string; kind: string; for_date: string | null; week_no: number | null;
      campaigns: { name: string } | null;
    }[]) {
      const list = usage.get(s.question_id) ?? [];
      list.push({
        campaign_id: s.campaign_id,
        campaign_name: s.campaigns?.name ?? '-',
        label: s.kind === 'daily' ? `Harian ${s.for_date}` : `Minggu ${s.week_no}`,
      });
      usage.set(s.question_id, list);
    }
  }

  return { rows: rows.map((r) => ({ ...r, used_in: usage.get(r.id) ?? [] })), total, page };
}

// Slots that already have attempts come from one plan 1 RPC (campaign.locked_slots).
export async function getSchedule(campaignId: string): Promise<SlotRow[]> {
  await requireInternalAdmin();
  if (!isUuid(campaignId)) return [];
  const db = campaignDb();
  const [sRes, lRes] = await Promise.all([
    db.from('question_slots')
      .select('id, kind, for_date, week_no, position, question_id, questions(prompt, category)')
      .eq('campaign_id', campaignId),
    db.rpc('locked_slots', { p_campaign: campaignId }),
  ]);
  if (sRes.error) throw new Error(sRes.error.message);
  if (lRes.error) throw new Error(lRes.error.message);

  const rows = (sRes.data ?? []) as unknown as {
    id: string; kind: 'daily' | 'weekly'; for_date: string | null; week_no: number | null; position: number;
    question_id: string; questions: { prompt: string; category: SlotRow['category'] } | null;
  }[];

  const locked = new Set(((lRes.data ?? []) as { slot_id: string }[]).map((r) => r.slot_id));

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    for_date: r.for_date,
    week_no: r.week_no,
    position: r.position,
    question_id: r.question_id,
    prompt: r.questions?.prompt ?? '-',
    category: r.questions?.category ?? 'umum',
    locked: locked.has(r.id),
  }));
}

/** Top N overall (plan 1B): live before freeze (frozen = false), the frozen list after. */
export async function getTop(campaignId: string): Promise<AdminTopRow[]> {
  await requireInternalAdmin();
  if (!isUuid(campaignId)) return [];
  const { data, error } = await campaignDb().rpc('admin_top', { p_campaign: campaignId });
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminTopRow[];
}

export async function getMonitor(
  campaignId: string,
  params: { church: string; search: string; page: number }
): Promise<MonitorData> {
  await requireInternalAdmin();
  if (!isUuid(campaignId)) throw new Error('Campaign tidak valid.');
  const church = isUuid(params.church) ? params.church : '';
  const db = campaignDb();
  const fetchPage = (page: number) =>
    db.rpc('admin_participants', {
      p_campaign: campaignId,
      p_church: church || null,
      p_search: params.search || null,
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    });

  const [statsRes, partRes, grandRes, top] = await Promise.all([
    db.rpc('admin_stats', { p_campaign: campaignId }),
    fetchPage(params.page),
    db.from('prizes').select('quantity').eq('campaign_id', campaignId).eq('prize_type', 'grand'),
    getTop(campaignId),
  ]);
  if (statsRes.error) throw new Error(statsRes.error.message);
  if (partRes.error) throw new Error(partRes.error.message);
  if (grandRes.error) throw new Error(grandRes.error.message);

  let page = params.page;
  let rows = (partRes.data ?? []) as ParticipantRow[];
  // Stale ?page beyond the end: fall back to page 1.
  if (rows.length === 0 && page > 1) {
    page = 1;
    const retry = await fetchPage(1);
    if (retry.error) throw new Error(retry.error.message);
    rows = (retry.data ?? []) as ParticipantRow[];
  }

  const stats = (statsRes.data ?? []) as AdminStatsRow[];
  return {
    stats,
    grandQuantity: ((grandRes.data ?? []) as { quantity: number }[]).reduce((n, p) => n + p.quantity, 0),
    participants: rows,
    total: Number(rows[0]?.total_count ?? 0),
    page,
    top,
  };
}

export async function getWinners(campaignId: string): Promise<AdminWinnerRow[]> {
  await requireInternalAdmin();
  if (!isUuid(campaignId)) return [];
  const { data, error } = await campaignDb().rpc('admin_winners', { p_campaign: campaignId });
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminWinnerRow[];
}

/** Announce-mode "Undi ulang" history (campaign.admin_winner_removals), oldest first. */
export async function getWinnerRemovals(campaignId: string): Promise<WinnerRemovalRow[]> {
  await requireInternalAdmin();
  if (!isUuid(campaignId)) return [];
  const { data, error } = await campaignDb().rpc('admin_winner_removals', { p_campaign: campaignId });
  if (error) throw new Error(error.message);
  return (data ?? []) as WinnerRemovalRow[];
}

/** Draw opt-out list (plan 4 Task 5), oldest first. */
export async function listDrawExclusions(campaignId: string): Promise<DrawExclusionRow[]> {
  await requireInternalAdmin();
  if (!isUuid(campaignId)) return [];
  const { data, error } = await campaignDb().rpc('admin_draw_exclusions', { p_campaign: campaignId });
  if (error) throw new Error(error.message);
  return (data ?? []) as DrawExclusionRow[];
}
