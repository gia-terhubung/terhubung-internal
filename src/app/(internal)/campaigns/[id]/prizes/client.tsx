'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog.molecule';
import { PrizeModal } from '@/components/organisms/PrizeModal.organism';
import { deletePrizeAction } from '@/services/campaign.actions';
import type { DrawMode, PrizeRow, PrizeType } from '@/types/campaign.types';

function groups(topN: number, grandTopWeight: number | null, drawMode: DrawMode): { type: PrizeType; title: string; hint: string }[] {
  const handover = drawMode === 'announce' ? 'Tim Terhubung akan menghubungi penerima.' : 'diserahkan di lokasi acara.';
  return [
    { type: 'top', title: `Hadiah tetap (${topN} besar)`, hint: `Tidak diundi. Untuk peringkat 1–${topN} dari semua gereja, ${handover}` },
    { type: 'normal', title: 'Hadiah reguler', hint: `Diundi lebih dulu dari semua jemaat gereja peserta, termasuk yang tanpa aplikasi dan ${topN} besar.` },
    { type: 'grand', title: 'Hadiah utama', hint: grandTopWeight !== null ? `Diundi terakhir dari semua jemaat (${topN} besar ${grandTopWeight}× kesempatan).` : `Diundi terakhir dari ${topN} besar.` },
  ];
}

export function PrizesClient({
  campaignId, prizes, topN, grandTopWeight, drawMode,
}: {
  campaignId: string; prizes: PrizeRow[]; topN: number; grandTopWeight: number | null; drawMode: DrawMode;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<PrizeRow | null | undefined>(undefined); // undefined = closed, null = create
  const [deleting, setDeleting] = useState<PrizeRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(p: PrizeRow) {
    setError(null);
    try {
      const res = await deletePrizeAction(campaignId, p.id);
      if (!res.ok) return setError(res.error);
      router.refresh();
    } catch {
      setError('Gagal menghapus hadiah. Coba lagi.');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-secondary">
          Satu orang bisa menang maksimal 1 hadiah reguler dan 1 hadiah utama. Jumlah hadiah bisa diubah kapan saja, termasuk saat malam undian.
        </p>
        <button onClick={() => setEditing(null)} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-brand-content hover:bg-brand-hover">
          + Tambah hadiah
        </button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}

      {groups(topN, grandTopWeight, drawMode).map((g) => {
        const rows = prizes.filter((p) => p.prize_type === g.type);
        return (
          <section key={g.type} className="rounded-xl border border-border-color bg-bg-secondary p-5">
            <h2 className="font-semibold text-text-primary">{g.title}</h2>
            <p className="mt-1 text-sm text-text-secondary">{g.hint}</p>
            {rows.length === 0 ? (
              <p className="mt-4 text-sm text-text-secondary">Belum ada hadiah.</p>
            ) : (
              <ul className="mt-4 divide-y divide-border-color">
                {rows.map((p) => (
                  <li key={p.id} className="flex items-center gap-4 py-3">
                    {p.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image_url} alt="" className="h-12 w-12 rounded-lg object-cover" />
                    ) : (
                      <div className="h-12 w-12 rounded-lg bg-bg-hover" />
                    )}
                    <div className="flex-1">
                      <div className="text-sm font-medium text-text-primary">{p.name}</div>
                      <div className="text-xs text-text-secondary">
                        {p.prize_type === 'top'
                          ? `${p.quantity} penerima · urutan tampil ${p.sort_order}`
                          : `diundi ${p.winner_count} / ${p.quantity} · urutan undian ${p.sort_order}`}
                      </div>
                    </div>
                    <button onClick={() => setEditing(p)} className="text-sm text-text-secondary hover:text-text-primary">Ubah</button>
                    <button onClick={() => setDeleting(p)} disabled={p.winner_count > 0}
                      className="text-sm text-text-secondary hover:text-danger disabled:opacity-40">Hapus</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {editing !== undefined && (
        <PrizeModal
          campaignId={campaignId}
          prize={editing}
          nextSortOrder={prizes.length + 1}
          topN={topN}
          onClose={() => setEditing(undefined)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Hapus hadiah?"
          message={`“${deleting.name}” akan dihapus dari campaign ini.`}
          confirmLabel="Hapus"
          danger
          onConfirm={() => remove(deleting)}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
