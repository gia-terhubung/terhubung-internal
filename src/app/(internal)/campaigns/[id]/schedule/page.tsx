import { notFound } from 'next/navigation';
import { getCampaignDetail, getSchedule } from '@/services/campaign.service';
import { ScheduleClient } from './client';

export default async function SchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [detail, slots] = await Promise.all([getCampaignDetail(id), getSchedule(id)]);
  if (!detail) notFound();
  return <ScheduleClient campaign={detail.campaign} slots={slots} />;
}
