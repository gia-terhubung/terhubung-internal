import { notFound } from 'next/navigation';
import { getCampaignDetail, getMonitor, listDrawExclusions } from '@/services/campaign.service';
import { MonitorClient } from './client';

export default async function MonitorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ church?: string; q?: string; page?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const church = typeof sp.church === 'string' ? sp.church : '';
  const search = typeof sp.q === 'string' ? sp.q : '';
  const requestedPage = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);

  const detail = await getCampaignDetail(id);
  if (!detail) notFound();
  const [data, exclusions] = await Promise.all([
    getMonitor(id, { church, search, page: requestedPage }),
    listDrawExclusions(id),
  ]);
  return (
    <MonitorClient campaignId={id} churches={detail.churches} data={data} church={church} search={search}
      topN={detail.campaign.rules.grand_top_n} frozen={detail.campaign.frozen_at !== null}
      exclusions={exclusions} />
  );
}
