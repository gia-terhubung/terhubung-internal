import { listChurchCreationHistory } from '@/services/church.service';
import { HistoryClient } from './client';

export default async function HistoryPage() {
  const rows = await listChurchCreationHistory();
  return <HistoryClient rows={rows} />;
}
