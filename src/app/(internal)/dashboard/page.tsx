import { requireInternalAdmin } from '@/services/auth.service';
import { getPlatformAnalytics } from '@/services/analytics.service';
import { DashboardClient } from './client';

export default async function DashboardPage() {
  const { user } = await requireInternalAdmin();
  const data = await getPlatformAnalytics();
  return <DashboardClient data={data} email={user.email} />;
}
