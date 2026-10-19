import { listCampaigns } from '@/services/campaign.service';
import { CampaignsClient } from './client';

export default async function CampaignsPage() {
  const campaigns = await listCampaigns();
  return <CampaignsClient campaigns={campaigns} />;
}
