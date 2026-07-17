import { listRecentPaymentsPage } from '@/services/billing.service';
import { PaymentsClient } from './client';

export default async function BillingPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const search = typeof sp.q === 'string' ? sp.q : '';
  const requestedPage = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);

  const { rows, total, page } = await listRecentPaymentsPage({ page: requestedPage, search });
  return <PaymentsClient rows={rows} total={total} page={page} search={search} />;
}
