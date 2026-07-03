import { listRecentEvents } from '@/services/billing.service';
import { EventsClient } from './client';

export default async function BillingEventsPage() {
  const rows = await listRecentEvents();
  return <EventsClient rows={rows} />;
}
