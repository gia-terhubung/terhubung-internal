import { listQuotes } from '@/services/billing.service';
import { QuotesClient } from './client';

export default async function BillingQuotesPage() {
  const rows = await listQuotes();
  return <QuotesClient rows={rows} />;
}
