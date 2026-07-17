import { listOutboxPage } from '@/services/billing.service';
import { OutboxClient } from './client';

export default async function BillingOutboxPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const search = typeof sp.q === 'string' ? sp.q : '';
  const requestedPage = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);

  const { rows, total, page } = await listOutboxPage({ page: requestedPage, search });
  return <OutboxClient rows={rows} total={total} page={page} search={search} />;
}
