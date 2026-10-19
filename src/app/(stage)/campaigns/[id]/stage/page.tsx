import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getStageState } from '@/services/campaignDraw.service';
import { StageClient } from './client';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Panggung Undian' };

export default async function StagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = await getStageState(id);
  if (!state) notFound();
  return <StageClient initial={state} />;
}
