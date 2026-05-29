import { listChurches } from '@/services/church.service';
import { ChurchesClient } from './client';

export default async function ChurchesPage() {
  const churches = await listChurches();
  return <ChurchesClient initialChurches={churches} />;
}
