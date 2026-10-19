import { notFound } from 'next/navigation';
import { getCampaignDetail } from '@/services/campaign.service';
import { CampaignSettingsClient } from './client';

export default async function CampaignSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getCampaignDetail(id);
  if (!detail) notFound();
  return <CampaignSettingsClient detail={detail} />;
}
