import { notFound } from 'next/navigation';
import { getCampaignDetail, getTop, getWinners } from '@/services/campaign.service';
import { WinnersClient } from './client';

export default async function WinnersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [detail, winners, top] = await Promise.all([getCampaignDetail(id), getWinners(id), getTop(id)]);
  if (!detail) notFound();
  return <WinnersClient campaign={detail.campaign} winners={winners} top={top} />;
}
