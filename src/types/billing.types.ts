export type SubscriptionInterval = 'month' | 'year';
export type SubscriptionScope = 'church' | 'user';
export type PaymentProvider = 'midtrans' | 'iap_apple' | 'iap_google' | 'manual';
export type ChurchTier = 'free' | 'plus' | 'pro';

export interface ChurchSubscription {
  church_id: string;
  plan_id: string;
  tier: string;
  interval: SubscriptionInterval;
  features: Record<string, unknown>;
  current_period_end: string;
  cancel_at_period_end: boolean;
  pending_plan_id: string | null;
  pending_change_at: string | null;
  pending_apply_error: string | null;
  provider: PaymentProvider | null;
  provider_subscription_id: string | null;
  provider_customer_id: string | null;
  grace_days: number;
  started_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
}
