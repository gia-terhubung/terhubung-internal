import { listRecentEventsPage } from '@/services/billing.service';
import { EventsClient } from './client';

export default async function BillingEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const search = typeof sp.q === 'string' ? sp.q : '';
  const requestedPage = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);

  const { rows, total, page } = await listRecentEventsPage({ page: requestedPage, search });
  return <EventsClient rows={rows} total={total} page={page} search={search} />;
}
