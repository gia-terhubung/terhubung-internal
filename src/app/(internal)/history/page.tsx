import { listChurchCreationHistoryPage, type HistorySort } from '@/services/church.service';
import { HistoryClient } from './client';

const SORTS: HistorySort[] = ['recent', 'oldest', 'name'];

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const search = typeof sp.q === 'string' ? sp.q : '';
  const sort: HistorySort = SORTS.includes(sp.sort as HistorySort) ? (sp.sort as HistorySort) : 'recent';
  const requestedPage = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);

  const { rows, total, page } = await listChurchCreationHistoryPage({ page: requestedPage, search, sort });
  return <HistoryClient rows={rows} total={total} page={page} search={search} sort={sort} />;
}
