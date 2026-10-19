import type { DrawPrizeType, ReelName } from '@/libs/campaignDraw';

export type { DrawPrizeType, ReelName };

export interface DrawConsoleCampaign {
  id: string;
  name: string;
  status: 'draft' | 'published' | 'archived';
  is_test: boolean;
  close_at: string;
  draw_at: string;
  frozen_at: string | null;
}

export interface DrawPrize {
  id: string;
  prize_type: DrawPrizeType;
  name: string;
  image_url: string | null;
  quantity: number;
  sort_order: number;
  drawn: number;
}

export interface DrawWinner extends ReelName {
  id: string;
  prize_id: string;
  prize_name: string;
  prize_type: DrawPrizeType;
  drawn_at: string;
}

/** One row of the frozen top N for the console (no phone: the winners page has it). */
export interface DrawTopRow {
  rank: number;
  full_name: string;
  display_name: string;
  church_name: string | null; // admin_top LEFT JOINs churches
  points: number;
}

/** Stage-safe top-N row: short name + church only. */
export interface StageTopRow {
  rank: number;
  display_name: string;
  church_name: string | null;
}

export interface DrawConsoleState {
  campaign: DrawConsoleCampaign;
  /** rules.grand_top_n */
  topN: number;
  /** campaign.admin_top: frozen list after freeze (topFrozen = frozen_at set), live preview before. */
  top: DrawTopRow[];
  topFrozen: boolean;
  pool: { normal: number; grand: number };
  /** pool minus users who already won that type (re-read every request, never cached). */
  poolLeft: { normal: number; grand: number };
  /** Live top-N count right now (compare with pool.grand at freeze time). */
  eligiblePreview: number;
  prizes: DrawPrize[]; // already in draw order; 'top' prizes excluded
  winners: DrawWinner[]; // oldest first
}

export interface StageTheme {
  title: string;
  subtitle: string;
  verse: string;
  colors: { background: string; primary: string; accent: string };
}

export interface StageWinner extends DrawWinner {
  prize_image_url: string | null;
}

export interface StageState {
  campaignId: string;
  name: string;
  draw_at: string;
  theme: StageTheme;
  /** Normal-pool size once frozen (includes non-app members); otherwise app members across participating churches. */
  participants: number;
  winners: StageWinner[]; // oldest first
  /** rules.grand_top_n (label of the "N besar" button before freeze) */
  topN: number;
  /** Frozen top N for the optional "10 besar" reveal; [] until frozen. */
  top: StageTopRow[];
}

export type FreezeResult = { ok: true; normal: number; grand: number } | { ok: false; error: string };
export type DrawResult = { ok: true; winner: DrawWinner } | { ok: false; error: string };
