import { listPrayerReports } from '@/services/moderation.service';
import { ModerationClient } from './client';

export default async function ModerationPage() {
  const groups = await listPrayerReports();
  return <ModerationClient groups={groups} />;
}
