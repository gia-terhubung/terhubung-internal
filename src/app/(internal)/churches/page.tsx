import { listChurchesPage, type ChurchSort } from '@/services/church.service';
import { ChurchesClient } from './client';

const SORTS: ChurchSort[] = ['recent', 'oldest', 'name'];

export default async function ChurchesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const search = typeof sp.q === 'string' ? sp.q : '';
  const sort: ChurchSort = SORTS.includes(sp.sort as ChurchSort) ? (sp.sort as ChurchSort) : 'recent';
  const requestedPage = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);

  const { rows, total, page } = await listChurchesPage({ page: requestedPage, search, sort });
  return <ChurchesClient rows={rows} total={total} page={page} search={search} sort={sort} />;
}
