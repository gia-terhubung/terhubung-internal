'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { duplicateCampaignAction } from '@/services/campaign.actions';
import { isoToWibInput, wibInputToIso } from '@/libs/campaign';

export function DuplicateCampaignModal({
  campaign,
  onClose,
}: {
  campaign: { id: string; name: string; start_at: string };
  onClose: () => void;
}) {
  const router = useRouter();
  const startLocal = isoToWibInput(campaign.start_at); // 'YYYY-MM-DDTHH:mm' WIB
  const [day, setDay] = useState(startLocal.slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await duplicateCampaignAction(campaign.id, wibInputToIso(`${day}T${startLocal.slice(11)}`));
      if (!res.ok) return setError(res.error);
      router.push(`/campaigns/${res.data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menduplikat campaign.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border border-border-color bg-bg-secondary shadow-2xl">
        <div className="border-b border-border-color p-5">
          <h2 className="text-lg font-bold text-text-primary">Duplikat “{campaign.name}”</h2>
        </div>
        <div className="space-y-3 p-5 text-sm text-text-secondary">
          <p>Pengaturan, gereja, hadiah, dan jadwal soal disalin ke draft baru. Semua tanggal bergeser mengikuti tanggal mulai baru.</p>
          <label className="block">
            <span>Tanggal mulai baru (WIB)</span>
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border-color bg-bg-primary px-3 py-2 text-text-primary outline-none focus:border-brand" />
          </label>
          {error && <p className="text-danger">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 border-t border-border-color p-5">
          <button onClick={onClose} disabled={busy} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary">Batal</button>
          <button onClick={submit} disabled={busy || !day}
            className="rounded-lg bg-brand px-5 py-2 text-sm font-bold text-brand-content hover:bg-brand-hover disabled:opacity-50">
            {busy ? 'Menyalin…' : 'Duplikat'}
          </button>
        </div>
      </div>
    </div>
  );
}
