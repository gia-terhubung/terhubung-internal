import { listRecentPayments } from '@/services/billing.service';
import { PaymentsClient } from './client';

export default async function BillingPaymentsPage() {
  const rows = await listRecentPayments();
  return <PaymentsClient rows={rows} />;
}
