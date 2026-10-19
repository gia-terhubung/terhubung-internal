'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImageUploadField } from '@/components/molecules/ImageUploadField.molecule';
import { savePrizeAction } from '@/services/campaign.actions';
import type { PrizeInput, PrizeRow } from '@/types/campaign.types';

const inputCls =
  'mt-1 w-full rounded-lg border border-border-color bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-brand';

export function PrizeModal({
  campaignId,
  prize,
  nextSortOrder,
  topN,
  onClose,
}: {
  campaignId: string;
  prize: PrizeRow | null; // null = create
  nextSortOrder: number;
  topN: number; // rules.grand_top_n: default quantity of a new 'top' prize
  onClose: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<PrizeInput>(
    prize
      ? { id: prize.id, prize_type: prize.prize_type, name: prize.name, image_url: prize.image_url, quantity: prize.quantity, sort_order: prize.sort_order }
      : { prize_type: 'normal', name: '', image_url: null, quantity: 1, sort_order: nextSortOrder }
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await savePrizeAction(campaignId, form);
      if (!res.ok) return setError(res.error);
      onClose();
      router.refresh();
    } catch {
      setError('Gagal menyimpan hadiah. Coba lagi.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-border-color bg-bg-secondary shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-color p-5">
          <h2 className="text-lg font-bold text-text-primary">{prize ? 'Ubah hadiah' : 'Tambah hadiah'}</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary">&times;</button>
        </div>
        <div className="space-y-4 p-5">
          <label className="block">
            <span className="text-sm text-text-secondary">Jenis</span>
            <select
              value={form.prize_type}
              onChange={(e) => {
                const t = e.target.value as PrizeInput['prize_type'];
                // A new fixed prize defaults to one unit per top-N rank.
                setForm({ ...form, prize_type: t, quantity: !prize && t === 'top' ? topN : form.quantity });
              }}
              disabled={!!prize && prize.winner_count > 0}
              className={inputCls}
            >
              <option value="normal">Hadiah reguler — diundi dari semua jemaat gereja peserta</option>
              <option value="grand">Hadiah utama — diundi dari {topN} besar</option>
              <option value="top">Hadiah tetap ({topN} besar) — tidak diundi</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-text-secondary">Nama hadiah</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="mis. Sepeda lipat" />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm text-text-secondary">{form.prize_type === 'top' ? 'Jumlah penerima' : 'Jumlah pemenang'}</span>
              <input type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} className={inputCls} />
            </label>
            <label className="block">
              <span className="text-sm text-text-secondary">{form.prize_type === 'top' ? 'Urutan tampil' : 'Urutan undian'}</span>
              <input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} className={inputCls} />
            </label>
          </div>
          <ImageUploadField label="Foto hadiah" campaignId={campaignId} kind="prize" value={form.image_url}
            onChange={(url) => setForm({ ...form, image_url: url })} />
          {prize && prize.winner_count > 0 && (
            <p className="text-xs text-text-secondary">
              Sudah ada {prize.winner_count} pemenang: jenis hadiah terkunci dan jumlah tidak boleh kurang dari {prize.winner_count}.
            </p>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 border-t border-border-color p-5">
          <button onClick={onClose} disabled={busy} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary">Batal</button>
          <button onClick={save} disabled={busy} className="rounded-lg bg-brand px-5 py-2 text-sm font-bold text-brand-content hover:bg-brand-hover disabled:opacity-50">
            {busy ? 'Menyimpan…' : 'Simpan hadiah'}
          </button>
        </div>
      </div>
    </div>
  );
}
