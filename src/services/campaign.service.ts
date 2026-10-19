import 'server-only';
import { cache } from 'react';
import { requireInternalAdmin } from '@/services/auth.service';
import { createAdminClient } from '@/libs/supabase/admin';
import { computeStatus, defaultCampaignInput } from '@/libs/campaign';
import type {
  CampaignDetail, CampaignInput, CampaignListItem, CampaignRow, ChurchOption,
} from '@/types/campaign.types';

export const CAMPAIGN_COLS =
  'id, name, status, is_test, sim_now, start_at, close_at, draw_at, frozen_at, theme, venue, modules, rules, created_at, updated_at';

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
  }));
}

/** Campaign + churches + lifecycle + server-enforced edit locks. Cached per request (layout + page). */
export const getCampaignDetail = cache(async (id: string): Promise<CampaignDetail | null> => {
  await requireInternalAdmin();
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
    // Same rules updateCampaignAction enforces server-side.
    locks: {
      start: !campaign.is_test && now >= Date.parse(campaign.start_at),
      close: campaign.frozen_at !== null,
      draw: hasWinners,
      isTest: campaign.status !== 'draft',
    },
  };
});

export async function getNewCampaignDefaults(): Promise<CampaignInput> {
  await requireInternalAdmin();
  return defaultCampaignInput(Date.now());
}
