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
