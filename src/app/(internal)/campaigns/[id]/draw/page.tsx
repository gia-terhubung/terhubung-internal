import { notFound } from 'next/navigation';
import { getDrawConsoleState } from '@/services/campaignDraw.service';
import { DrawConsoleClient } from './client';

export const dynamic = 'force-dynamic';

export default async function CampaignDrawPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = await getDrawConsoleState(id);
  if (!state) notFound();
  return <DrawConsoleClient state={state} />;
}
