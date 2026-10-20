import { notFound } from 'next/navigation';
import { getCampaignDetail, getTop, getWinnerRemovals, getWinners } from '@/services/campaign.service';
import { WinnersClient } from './client';

export default async function WinnersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [detail, winners, top, removals] = await Promise.all([
    getCampaignDetail(id), getWinners(id), getTop(id), getWinnerRemovals(id),
  ]);
  if (!detail) notFound();
  return <WinnersClient campaign={detail.campaign} winners={winners} top={top} removals={removals} />;
}
