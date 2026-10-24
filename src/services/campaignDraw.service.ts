import 'server-only';
import { requireInternalAdmin } from '@/services/auth.service';
import { createAdminClient } from '@/libs/supabase/admin';
import { DEFAULT_THEME, drawModeOf, grandTopWeightOf, isUuid } from '@/libs/campaign';
import { orderPrizesForDraw, poolLeftByType } from '@/libs/campaignDraw';
import { getTop } from '@/services/campaign.service';
import type {
  DrawConsoleState,
  DrawPrize,
  DrawPrizeType,
  ReelName,
  StageState,
  StageTheme,
  StageWinner,
} from '@/types/campaignDraw.types';

type CampaignDb = ReturnType<ReturnType<typeof createAdminClient>['schema']>;

const WINNER_SELECT = 'id, prize_id, prize_type, display_name, church_name, drawn_at, prize:prizes(name, image_url)';

type WinnerRow = {
  id: string;
  prize_id: string;
  prize_type: DrawPrizeType;
  display_name: string;
  church_name: string;
  drawn_at: string;
  prize: { name: string; image_url: string | null } | null;
};

function toStageWinner(r: WinnerRow): StageWinner {
  return {
    id: r.id,
    prize_id: r.prize_id,
    prize_type: r.prize_type,
    prize_name: r.prize?.name ?? 'Hadiah',
    prize_image_url: r.prize?.image_url ?? null,
    display_name: r.display_name,
    church_name: r.church_name,
    drawn_at: String(r.drawn_at),
  };
}

async function listWinners(db: CampaignDb, campaignId: string): Promise<StageWinner[]> {
  const { data, error } = await db
    .from('winners')
    .select(WINNER_SELECT)
    .eq('campaign_id', campaignId)
    .order('drawn_at', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as WinnerRow[]).map(toStageWinner);
}

async function poolCount(db: CampaignDb, campaignId: string, type: DrawPrizeType): Promise<number> {
  const { count, error } = await db
    .from('draw_pool')
    .select('user_id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('prize_type', type);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

function mergeTheme(raw: unknown): StageTheme {
  const t = (raw ?? {}) as Partial<StageTheme> & { colors?: Partial<StageTheme['colors']> };
  return {
    title: t.title || DEFAULT_THEME.title,
    subtitle: t.subtitle ?? '',
    verse: t.verse ?? '',
    colors: { ...DEFAULT_THEME.colors, ...(t.colors ?? {}) },
  };
}

/**
 * Operator console: campaign, pool sizes, prize queue with drawn counts, winners.
 * Always a fresh read: quantities may be edited up to and during draw night.
 */
export async function getDrawConsoleState(campaignId: string): Promise<DrawConsoleState | null> {
  await requireInternalAdmin();
  if (!isUuid(campaignId)) return null;
  const db = createAdminClient().schema('campaign');

  const { data: campaign, error } = await db
    .from('campaigns')
    .select('id, name, status, is_test, close_at, draw_at, frozen_at, announced_at, sim_now, rules')
    .eq('id', campaignId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!campaign) return null;

  const [prizesRes, winners, normal, grand, eligibleRes, top] = await Promise.all([
    db.from('prizes').select('id, prize_type, name, image_url, quantity, sort_order').eq('campaign_id', campaignId),
    listWinners(db, campaignId),
    poolCount(db, campaignId, 'normal'),
    poolCount(db, campaignId, 'grand'),
    db.rpc('eligibility_table', { p_campaign: campaignId }, { count: 'exact', head: true }).eq('eligible', true),
    getTop(campaignId),
  ]);
  if (prizesRes.error) throw new Error(prizesRes.error.message);
  if (eligibleRes.error) throw new Error(eligibleRes.error.message);

  const drawnByPrize = new Map<string, number>();
  for (const w of winners) drawnByPrize.set(w.prize_id, (drawnByPrize.get(w.prize_id) ?? 0) + 1);

  // Rows include 'top' prizes; orderPrizesForDraw drops them (never drawn).
  const prizes: DrawPrize[] = orderPrizesForDraw(
    ((prizesRes.data ?? []) as (Omit<DrawPrize, 'drawn' | 'prize_type'> & { prize_type: string })[]).map((p) => ({
      ...p,
      drawn: drawnByPrize.get(p.id) ?? 0,
    }))
  );
  const { rules, ...campaignRow } = campaign as Omit<DrawConsoleState['campaign'], 'close_at' | 'draw_at' | 'draw_mode'> & {
    close_at: string;
    draw_at: string;
    rules: { grand_top_n?: number; draw_mode?: unknown; grand_top_weight?: unknown } | null;
  };

  return {
    campaign: {
      ...campaignRow,
      close_at: String(campaignRow.close_at),
      draw_at: String(campaignRow.draw_at),
      draw_mode: drawModeOf(rules),
    },
    topN: rules?.grand_top_n ?? 10,
    grandTopWeight: grandTopWeightOf(rules),
    top: top.map((t) => ({
      rank: t.rank, full_name: t.full_name, display_name: t.display_name, church_name: t.church_name, points: t.points,
    })),
    // From frozen_at, not top[0]: a frozen campaign with an empty grand pool is still "Dibekukan".
    topFrozen: campaignRow.frozen_at !== null,
    pool: { normal, grand },
    poolLeft: poolLeftByType({ normal, grand }, winners),
    eligiblePreview: eligibleRes.count ?? 0,
    prizes,
    winners: winners.map((w) => ({
      id: w.id, prize_id: w.prize_id, prize_name: w.prize_name, prize_type: w.prize_type,
      display_name: w.display_name, church_name: w.church_name, drawn_at: w.drawn_at,
    })),
  };
}

/** Stage: theme, countdown target, participant count, all winners (short names only). */
export async function getStageState(campaignId: string): Promise<StageState | null> {
  await requireInternalAdmin();
  if (!isUuid(campaignId)) return null;
  const db = createAdminClient().schema('campaign');

  const { data: campaign, error } = await db
    .from('campaigns')
    .select('id, name, draw_at, frozen_at, theme, rules')
    .eq('id', campaignId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!campaign) return null;

  // admin_top recomputes the whole ranking; before freeze the stage discards it, so skip the call.
  const [winners, topRows] = await Promise.all([
    listWinners(db, campaignId),
    campaign.frozen_at ? getTop(campaignId) : Promise.resolve([]),
  ]);
  // Stage privacy: short name + church only, and only the frozen list.
  const top = topRows
    .filter((t) => t.frozen)
    .map((t) => ({ rank: t.rank, display_name: t.display_name, church_name: t.church_name }));

  let participants: number;
  if (campaign.frozen_at) {
    participants = await poolCount(db, campaignId, 'normal');
  } else {
    const { data: stats, error: statsErr } = await db.rpc('admin_stats', { p_campaign: campaignId });
    if (statsErr) throw new Error(statsErr.message);
    participants = ((stats ?? []) as { members: number }[]).reduce((sum, s) => sum + (s.members ?? 0), 0);
  }

  return {
    campaignId: campaign.id,
    name: campaign.name,
    draw_at: String(campaign.draw_at),
    theme: mergeTheme(campaign.theme),
    participants,
    winners,
    topN: (campaign.rules as { grand_top_n?: number } | null)?.grand_top_n ?? 10,
    top,
  };
}

/** Random short names from the frozen pool for the slot reel (never the winner pick). */
export async function getPoolSample(campaignId: string, prizeType: DrawPrizeType): Promise<ReelName[]> {
  await requireInternalAdmin();
  if (!isUuid(campaignId)) return [];
  const { data, error } = await createAdminClient()
    .schema('campaign')
    .rpc('pool_sample', { p_campaign: campaignId, p_prize_type: prizeType, p_limit: 300 });
  if (error) throw new Error(error.message);
  return (data ?? []) as ReelName[];
}
