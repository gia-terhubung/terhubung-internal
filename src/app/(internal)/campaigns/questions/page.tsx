import { requireInternalAdmin } from '@/services/auth.service';
import { listQuestionsPage } from '@/services/campaign.service';
import type { QuestionCategory } from '@/types/campaign.types';
import { QuestionsClient } from './client';

const CATEGORIES: QuestionCategory[] = ['umum', 'alkitab', 'gereja'];

export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; difficulty?: string; archived?: string; page?: string }>;
}) {
  await requireInternalAdmin();
  const sp = await searchParams;
  const search = typeof sp.q === 'string' ? sp.q.trim().slice(0, 100) : '';
  const category = CATEGORIES.includes(sp.category as QuestionCategory) ? (sp.category as QuestionCategory) : '';
  const d = Number(sp.difficulty);
  const difficulty = (d === 1 || d === 2 || d === 3 ? d : 0) as 0 | 1 | 2 | 3;
  const archived = sp.archived === '1';
  const requestedPage = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);

  const { rows, total, page } = await listQuestionsPage({ page: requestedPage, search, category, difficulty, archived });
  return (
    <QuestionsClient rows={rows} total={total} page={page} search={search} category={category} difficulty={difficulty} archived={archived} />
  );
}
