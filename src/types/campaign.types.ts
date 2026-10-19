// Hand-written mirrors of the `campaign` schema (no type-gen).
// Contract: docs/plans/CAMPAIGN_IMPL_1_DB_PLAN.md — keep field names identical.

export interface CampaignRules {
  daily_checkin_points: number;
  daily_correct_bonus: number;
  streak_days: number;
  streak_bonus: number;
  weekly_correct_points: number;
  prayer_points: number;
  prayer_daily_cap: number;
  comment_points: number;
  comment_daily_cap: number;
  comment_min_chars: number;
  daily_timer_sec: number;
  weekly_timer_sec: number;
  timer_grace_sec: number;
  grand_top_n: number; // top N overall (all churches): fixed prize; the grand prize is drawn from them
}

export interface CampaignTheme {
  title: string;
  subtitle: string;
  verse: string;
  banner_url: string | null;
  hero_url: string | null;
  colors: { background: string; primary: string; accent: string };
}

export interface CampaignVenue {
  name: string;
  address: string;
  maps_url: string;
  note: string;
}

export interface CampaignModules {
  daily: boolean;
  weekly: boolean;
  prayer: boolean;
  comment: boolean;
}

export type CampaignDbStatus = 'draft' | 'published' | 'archived';

export interface CampaignRow {
  id: string;
  name: string;
  status: CampaignDbStatus;
  is_test: boolean;
  sim_now: string | null;
  start_at: string;
  close_at: string;
  draw_at: string;
  frozen_at: string | null;
  theme: CampaignTheme;
  venue: CampaignVenue;
  modules: CampaignModules;
  rules: CampaignRules;
  created_at: string;
  updated_at: string;
}

// Lifecycle shown in the UI, derived from status + dates + freeze + winners.
export type CampaignStatus = 'draft' | 'scheduled' | 'running' | 'closed' | 'drawn' | 'archived';

export interface CampaignListItem extends CampaignRow {
  church_count: number;
  has_winners: boolean;
  computed_status: CampaignStatus;
}

// Which date fields the server will refuse to change (mirrors updateCampaignAction).
export interface CampaignLocks {
  start: boolean;
  close: boolean;
  draw: boolean;
  isTest: boolean;
  topN: boolean; // rules.grand_top_n locked once participants are frozen
}

export interface ChurchOption {
  id: string;
  name: string;
  city: string | null;
}

export interface CampaignDetail {
  campaign: CampaignRow;
  churches: ChurchOption[];
  has_winners: boolean;
  weekly_weeks: number[]; // distinct week_no that have weekly slots (any range)
  daily_dates: string[]; // for_date of every daily slot (any range)
  status: CampaignStatus;
  locks: CampaignLocks;
}

// Editable campaign fields. sim_now is edited only via TestToolsPanel.
export interface CampaignInput {
  name: string;
  start_at: string;
  close_at: string;
  draw_at: string;
  is_test: boolean;
  theme: CampaignTheme;
  venue: CampaignVenue;
  modules: CampaignModules;
  rules: CampaignRules;
}

// 'top' = fixed prize for the top N overall: listed only, never drawn (draw_next raises prize_not_drawable).
// Winners and draw_pool rows are only ever 'grand' | 'normal'.
export type PrizeType = 'grand' | 'normal' | 'top';

export interface PrizeRow {
  id: string;
  campaign_id: string;
  prize_type: PrizeType;
  name: string;
  image_url: string | null;
  quantity: number;
  sort_order: number;
  winner_count: number;
}

export interface PrizeInput {
  id?: string;
  prize_type: PrizeType;
  name: string;
  image_url: string | null;
  quantity: number;
  sort_order: number;
}

export type QuestionCategory = 'umum' | 'alkitab' | 'gereja';

export interface QuestionDraft {
  prompt: string;
  option_a: string;
  option_b: string;
  correct: 'a' | 'b';
  category: QuestionCategory;
  difficulty: 1 | 2 | 3;
}

export interface QuestionRow extends QuestionDraft {
  id: string;
  archived_at: string | null;
  created_at: string;
  used_in: { campaign_id: string; campaign_name: string; label: string }[];
}

export interface QuestionOption extends QuestionDraft {
  id: string;
  used_count: number;
  used_here: boolean;
}

export interface SlotRow {
  id: string;
  kind: 'daily' | 'weekly';
  for_date: string | null;
  week_no: number | null;
  position: number;
  question_id: string;
  prompt: string;
  category: QuestionCategory;
  locked: boolean; // attempts exist → server refuses changes
}

export interface AdminStatsRow {
  church_id: string;
  church_name: string;
  members: number;
  consented: number;
  participants: number;
  checkins_today: number;
  grand_eligible: number;
}

export interface ParticipantRow {
  user_id: string;
  full_name: string;
  church_name: string | null;
  points: number;
  overall_rank: number; // rank across all participating churches (decides the top N)
  church_rank: number;
  checkins: number;
  weekly_done: number;
  prayers: number;
  comments: number;
  eligible: boolean;
  total_count: number; // window count of all rows matching the filter (bigint: coerce with Number)
}

export interface MonitorData {
  stats: AdminStatsRow[];
  eligibleTotal: number;
  grandQuantity: number; // sum of grand prize quantities
  participants: ParticipantRow[];
  total: number;
  page: number;
  top: AdminTopRow[]; // campaign.admin_top: frozen list after freeze, live preview before
}

// One row of campaign.admin_top(p_campaign). Before freeze the list is live (frozen = false);
// after freeze it is the draw_pool grand rows (frozen = true). phone is NULL for dummies.
export interface AdminTopRow {
  rank: number;
  user_id: string;
  full_name: string;
  display_name: string;
  church_name: string | null;
  points: number;
  phone: string | null;
  frozen: boolean;
}

export interface PointEventRow {
  id: number;
  created_at: string;
  source: string;
  points: number;
  status: 'awarded' | 'rejected' | 'revoked';
  reason_code: string;
  day_wib: string;
  note: string | null;
}

export interface AdminWinnerRow {
  id: string;
  prize_name: string;
  prize_type: PrizeType;
  full_name: string;
  display_name: string;
  church_name: string;
  phone: string | null;
  has_app: boolean; // false = non-app member (people row, no account): normal prizes only, no push — reach them by phone
  drawn_at: string;
}

export type ActionResultWith<T> = { ok: true; data: T } | { ok: false; error: string };
