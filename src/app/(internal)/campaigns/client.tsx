'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/atoms/Badge.atom';
import { DuplicateCampaignModal } from '@/components/organisms/DuplicateCampaignModal.organism';
import { STATUS_LABEL, STATUS_VARIANT, formatWib } from '@/libs/campaign';
import type { CampaignListItem } from '@/types/campaign.types';

export function CampaignsClient({ campaigns }: { campaigns: CampaignListItem[] }) {
  const [duplicating, setDuplicating] = useState<CampaignListItem | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Campaign</h1>
          <p className="mt-1 text-sm text-text-secondary">Kuis, side quest, peringkat, dan undian hadiah untuk gereja terpilih.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/campaigns/questions" className="rounded-lg bg-bg-hover px-4 py-2 text-sm text-text-primary hover:bg-bg-tertiary">
            Bank soal
          </Link>
          <Link href="/campaigns/new" className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-brand-content hover:bg-brand-hover">
            + Buat campaign
          </Link>
        </div>
      </div>

      {campaigns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-color p-10 text-center text-sm text-text-secondary">
          Belum ada campaign. Buat campaign uji coba dulu untuk latihan sebelum acara.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border-color">
          <table className="w-full text-sm">
            <thead className="bg-bg-secondary text-left text-text-secondary">
              <tr>
                <th className="px-4 py-3 font-medium">Nama</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Mulai</th>
                <th className="px-4 py-3 font-medium">Undian</th>
                <th className="px-4 py-3 font-medium">Gereja</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="border-t border-border-color">
                  <td className="px-4 py-3">
                    <Link href={`/campaigns/${c.id}`} className="font-medium text-text-primary hover:text-brand">{c.name}</Link>
                    {c.is_test && <span className="ml-2"><Badge variant="warning">Uji coba</Badge></span>}
                  </td>
                  <td className="px-4 py-3"><Badge variant={STATUS_VARIANT[c.computed_status]}>{STATUS_LABEL[c.computed_status]}</Badge></td>
                  <td className="px-4 py-3 text-text-secondary">{formatWib(c.start_at)}</td>
                  <td className="px-4 py-3 text-text-secondary">{formatWib(c.draw_at)}</td>
                  <td className="px-4 py-3 text-text-secondary">{c.church_count}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setDuplicating(c)} className="text-sm text-text-secondary hover:text-text-primary">Duplikat</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {duplicating && <DuplicateCampaignModal campaign={duplicating} onClose={() => setDuplicating(null)} />}
    </div>
  );
}
