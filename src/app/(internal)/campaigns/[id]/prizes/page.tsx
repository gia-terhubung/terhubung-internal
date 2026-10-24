import { notFound } from 'next/navigation';
import { getCampaignDetail, listPrizes } from '@/services/campaign.service';
import { drawModeOf, grandTopWeightOf } from '@/libs/campaign';
import { PrizesClient } from './client';

export default async function PrizesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [prizes, detail] = await Promise.all([listPrizes(id), getCampaignDetail(id)]);
  if (!detail) notFound();
  return (
    <PrizesClient
      campaignId={id}
      prizes={prizes}
      topN={detail.campaign.rules.grand_top_n}
      grandTopWeight={grandTopWeightOf(detail.campaign.rules)}
      drawMode={drawModeOf(detail.campaign.rules)}
    />
  );
}
