'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { applyManualSubscriptionChangeAction } from '@/services/billing.actions';
import type { ChurchPlanOption } from '@/types/internal.types';

const TIER_RANK: Record<string, number> = { free: 0, plus: 1, pro: 2 };
const idr = (n: number | null) =>
  n == null ? 'Gratis' : 'Rp' + new Intl.NumberFormat('id-ID').format(n);
const intervalLabel = (i: string) => (i === 'year' ? 'tahun' : 'bulan');
const planLabel = (p: ChurchPlanOption) =>
  `${p.tier} · ${intervalLabel(p.interval)} · ${idr(p.price_idr)}`;

export function ChangeSubscriptionModal({
  churchId,
  currentTier,
  currentInterval,
  plans,
  onClose,
}: {
  churchId: string;
  currentTier: string;
  currentInterval: string;
  plans: ChurchPlanOption[];
  onClose: () => void;
}) {
  const router = useRouter();

  // Default to the plan that matches the church's current tier + interval.
  const initialId = useMemo(() => {
    const match = plans.find((p) => p.tier === currentTier && p.interval === currentInterval);
    return match?.id ?? plans[0]?.id ?? '';
  }, [plans, currentTier, currentInterval]);

  const [planId, setPlanId] = useState(initialId);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = plans.find((p) => p.id === planId) ?? null;
  const isDowngrade =
    selected != null && (TIER_RANK[selected.tier] ?? 0) < (TIER_RANK[currentTier] ?? 0);

  async function apply() {
    if (!planId) return;
    const trimmed = amount.trim();
    let amountIdr: number | null = null;
    if (trimmed) {
      const n = Number(trimmed);
      if (!Number.isInteger(n) || n <= 0) {
        setError('Jumlah pembayaran harus angka bulat positif.');
        return;
      }
      amountIdr = n;
    }

    setSaving(true);
    setError(null);
    const res = await applyManualSubscriptionChangeAction({ churchId, planId, amountIdr });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex w-full max-w-md flex-col rounded-xl border border-border-color bg-bg-secondary shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-color p-5">
          <h2 className="text-lg font-bold text-text-primary">Ubah Paket Langganan</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary">&times;</button>
        </div>

        <div className="space-y-4 p-5">
          <div className="text-sm text-text-secondary">
            Saat ini: <span className="capitalize text-text-primary">{currentTier}</span> ·{' '}
            {intervalLabel(currentInterval)}
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-text-secondary">Paket baru</label>
            <select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border-color bg-bg-primary px-3 py-2 text-sm capitalize text-text-primary outline-none focus:border-brand"
            >
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {planLabel(p)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-text-secondary">
              Jumlah pembayaran (opsional)
            </label>
            <input
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="mis. 250000 — kosongkan jika override tanpa pembayaran"
              className="mt-1 w-full rounded-lg border border-border-color bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-brand"
            />
          </div>

          {isDowngrade && (
            <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
              Menurunkan tier — anggota yang melebihi limit paket baru tetap ada, namun penambahan
              anggota/admin baru akan terblokir hingga di bawah limit.
              {selected?.tier === 'free' && ' Turun ke Free menghapus semua paket kapasitas (add-on).'}
            </p>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 border-t border-border-color p-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary">
            Batal
          </button>
          <button
            onClick={apply}
            disabled={!planId || saving}
            className="rounded-lg bg-brand px-5 py-2 text-sm font-bold text-brand-content hover:bg-brand-hover disabled:opacity-50"
          >
            {saving ? 'Menyimpan…' : 'Terapkan'}
          </button>
        </div>
      </div>
    </div>
  );
}
