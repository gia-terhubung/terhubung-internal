// Internal staff identity (mirrors internal.staff_accounts).
export interface StaffAccount {
  user_id: string;
  email: string;
  is_active: boolean;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
}

// Minimal authenticated principal for the internal app.
export interface InternalSessionUser {
  id: string;
  email: string;
}

// Generic server-action result.
export type ActionResult = { ok: true } | { ok: false; error: string };

// Create-church form payload (Feature A). Church contact is required.
export interface CreateChurchInput {
  name: string;
  synod?: string;
  timezone?: string;
  // location (provinsi → kelurahan + alamat)
  province?: string;
  province_id?: string;
  city?: string;
  city_id?: string;
  district?: string;
  district_id?: string;
  sub_district?: string;
  sub_district_id?: string;
  address?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  billingSameAsContact?: boolean;
  billingName?: string;
  billingEmail?: string;
  billingPhone?: string;
}

// Billing dashboard row (Feature C) — computed server-side.
// 'none' = church has no subscription row at all.
export type BillingStatus = 'active' | 'grace' | 'expired' | 'none';

export interface ChurchBillingRow {
  church_id: string;
  church_name: string;
  city: string | null;
  tier: string;
  interval: string;
  provider: string | null;
  current_period_end: string; // ISO or 'infinity'
  grace_days: number;
  status: BillingStatus;
}

// Billing history (per church).
export interface BillingEventRow {
  id: string;
  event_type: string;
  from_tier: string | null;
  to_tier: string | null;
  amount_idr: number | null;
  provider: string | null;
  event_occurred_at: string;
}

export interface PaymentRow {
  id: string;
  amount_idr: number;
  currency: string;
  status: string;
  provider: string;
  created_at: string;
}

export interface ChurchBillingHistory {
  events: BillingEventRow[];
  payments: PaymentRow[];
}

// Current subscription summary for a church (Feature C, detail page).
export interface ChurchSubscriptionInfo {
  tier: string;
  interval: string;
  status: BillingStatus;
  current_period_end: string;
  grace_days: number;
  provider: string | null;
  cancel_at_period_end: boolean;
  started_at: string;
  features: Record<string, unknown>;
  price_idr: number | null;
  member_limit: number | null;
  admin_limit: number | null;
  // Scheduled change (applied by the billing cron at pending_change_at).
  pending_plan_id: string | null;
  pending_change_at: string | null;
  pending_apply_error: string | null;
  pending_tier: string | null;
  pending_interval: string | null;
}

// Selectable church plan (manual promote/demote picker).
export interface ChurchPlanOption {
  id: string;
  tier: string;
  interval: 'month' | 'year';
  price_idr: number | null;
}

// Manual subscription change payload (internal staff promote/demote).
export interface ApplySubscriptionChangeInput {
  churchId: string;
  planId: string;
  amountIdr?: number | null; // optional manually-collected payment
}

// Manual renewal payload (keep tier, extend one interval).
export interface RenewSubscriptionInput {
  churchId: string;
  amountIdr?: number | null;
  paymentRef?: string | null;
}

// Global billing audit rows (payments / events across all churches).
export interface PaymentAuditRow {
  id: string;
  church_id: string | null;
  church_name: string;
  provider: string;
  provider_payment_id: string | null;
  amount_idr: number;
  currency: string;
  status: string;
  created_at: string;
}

export interface EventAuditRow {
  id: string;
  church_id: string;
  church_name: string;
  event_type: string;
  from_tier: string | null;
  to_tier: string | null;
  amount_idr: number | null;
  provider: string | null;
  event_occurred_at: string;
}

// Custom subscription quotes (billing.custom_subscription_quotes).
export type QuoteStatus = 'pending' | 'quoted' | 'accepted' | 'rejected' | 'obsolete' | 'expired';

export interface QuoteRow {
  id: string;
  church_id: string;
  church_name: string;
  member_count: number;
  quoted_price_idr: number | null;
  status: QuoteStatus;
  expires_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpdateQuoteInput {
  quoteId: string;
  status: 'quoted' | 'accepted' | 'rejected';
  quotedPriceIdr?: number | null;
  expiresAt?: string | null;
  notes?: string | null;
}

// Billing email outbox monitor (pending/failed only).
export interface OutboxRow {
  id: string;
  to_email: string;
  church_id: string | null;
  church_name: string | null;
  subject: string;
  status: string;
  attempts: number;
  last_error: string | null;
  sent_at: string | null;
  created_at: string;
}

// Read-only plan rate card row (active plans, both scopes).
export interface PlanRateRow {
  id: string;
  scope: string;
  tier: string;
  interval: string;
  price_idr: number | null;
  member_limit: number | null;
  admin_limit: number | null;
  staff_limit: number | null;
  management_limit: number | null;
  finance_limit: number | null;
  features: Record<string, unknown>;
}

// Mobile force-update control (public.app_version_config).
export interface AppVersionConfig {
  platform: 'ios' | 'android';
  latest_version: string;
  min_version: string;
  update_message: string | null;
  store_url: string | null;
  updated_at: string;
  updated_by: string | null;
  updated_by_label: string | null; // staff email, resolved server-side
}

export interface UpdateAppVersionConfigInput {
  platform: 'ios' | 'android';
  latestVersion: string;
  minVersion: string;
  updateMessage: string | null;
  storeUrl: string | null;
  // Required acknowledgement when RAISING min_version (locks out old clients).
  confirmForceUpdate: boolean;
}

// Church creation history (global).
export interface ChurchCreationRow {
  id: string;
  name: string;
  created_at: string;
  creator: string;
}

// App user search result (Feature B).
export interface AppUserResult {
  id: string;
  full_name: string;
  email: string | null;
  avatar_url: string | null;
  current_church_id: string | null;
  current_role: string | null;
}
