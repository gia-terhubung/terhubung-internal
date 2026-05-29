import { listAllChurchBilling } from '@/services/billing.service';
import { BillingClient } from './client';

export default async function BillingPage() {
  const rows = await listAllChurchBilling();
  return <BillingClient rows={rows} />;
}
