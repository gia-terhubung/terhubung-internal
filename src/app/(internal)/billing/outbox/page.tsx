import { listOutbox } from '@/services/billing.service';
import { OutboxClient } from './client';

export default async function BillingOutboxPage() {
  const rows = await listOutbox();
  return <OutboxClient rows={rows} />;
}
