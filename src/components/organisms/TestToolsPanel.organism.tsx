'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog.molecule';
import { resetTestAction, seedDummyAction, setSimNowAction } from '@/services/campaign.actions';
import { formatWib, isoToWibInput, wibInputToIso } from '@/libs/campaign';
import type { CampaignRow } from '@/types/campaign.types';

const inputCls =
  'mt-1 rounded-lg border border-border-color bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-brand';
const btn = 'rounded-lg bg-bg-hover px-3 py-2 text-sm text-text-primary hover:bg-bg-tertiary disabled:opacity-50';

export function TestToolsPanel({ campaign }: { campaign: CampaignRow }) {
  const router = useRouter();
  const [sim, setSim] = useState(campaign.sim_now ? isoToWibInput(campaign.sim_now) : isoToWibInput(campaign.start_at));
  const [count, setCount] = useState('200');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fn();
      setMsg(res.ok ? { ok: true, text: success } : { ok: false, text: res.error ?? 'Gagal.' });
      if (res.ok) router.refresh();
      return res.ok;
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Gagal.' });
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-amber-500/40 bg-bg-secondary p-5">
      <h2 className="font-semibold text-text-primary">Alat uji coba</h2>
      <p className="mt-1 text-sm text-text-secondary">
        Hanya untuk campaign uji coba. Waktu simulasi menggeser jam campaign (hari, minggu, pengingat, pembekuan), tetapi timer soal tetap waktu nyata.
        Peringatan: waktu simulasi juga memicu notifikasi dan pengingat sungguhan ke HP peserta di gereja uji coba. Waktu simulasi setelah tanggal tutup akan membekukan peserta dan mengunci tanggal tutup sampai Reset.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-sm text-text-secondary">Waktu simulasi (WIB)</span>
          <input type="datetime-local" value={sim} onChange={(e) => setSim(e.target.value)} className={`block ${inputCls}`} />
        </label>
        <button disabled={busy || !sim} className={btn}
          onClick={() => run(() => setSimNowAction(campaign.id, wibInputToIso(sim)), 'Waktu simulasi disimpan.')}>
          Pakai waktu ini
        </button>
        <button disabled={busy || !campaign.sim_now} className={btn}
          onClick={() => run(() => setSimNowAction(campaign.id, null), 'Kembali ke waktu nyata.')}>
          Pakai waktu nyata
        </button>
        <span className="text-sm text-text-secondary">
          Sekarang: {campaign.sim_now ? `simulasi ${formatWib(campaign.sim_now)}` : 'waktu nyata'}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-sm text-text-secondary">Peserta dummy</span>
          <input type="number" min={1} max={2000} value={count} onChange={(e) => setCount(e.target.value)} className={`block w-32 ${inputCls}`} />
        </label>
        <button disabled={busy} className={btn}
          onClick={() => run(() => seedDummyAction(campaign.id, Number(count)), `${count} peserta dummy dibuat di gereja pertama.`)}>
          Buat data dummy
        </button>
        <button disabled={busy} onClick={() => setConfirmReset(true)}
          className="rounded-lg bg-danger px-3 py-2 text-sm font-bold text-white hover:bg-danger-hover disabled:opacity-50">
          Reset semua data
        </button>
      </div>

      {msg && <p className={`mt-3 text-sm ${msg.ok ? 'text-text-secondary' : 'text-danger'}`}>{msg.text}</p>}

      {confirmReset && (
        <ConfirmDialog
          title="Reset data uji coba?"
          message="Semua jawaban, poin, persetujuan aturan, peserta dummy, pembekuan, dan pemenang campaign ini dihapus. Pengaturan, hadiah, dan jadwal soal tetap."
          confirmLabel="Reset"
          danger
          onConfirm={async () => {
            await run(() => resetTestAction(campaign.id), 'Data uji coba direset.');
            setConfirmReset(false);
          }}
          onClose={() => setConfirmReset(false)}
        />
      )}
    </section>
  );
}
