'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { renewSubscriptionAction } from '@/services/billing.actions';
import type { ChurchSubscriptionInfo } from '@/types/internal.types';

const intervalLabel = (i: string) => (i === 'year' ? 'tahun' : 'bulan');

export function RenewSubscriptionModal({
  churchId,
  subscription,
  onClose,
}: {
  churchId: string;
  subscription: ChurchSubscriptionInfo;
  onClose: () => void;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mirrors the server: base = max(now, current period end) + one interval.
  // Date.now() is impure during render (react-hooks/purity) — compute in an effect.
  const [newEnd, setNewEnd] = useState<Date | null>(null);
  useEffect(() => {
    const currentEnd = new Date(subscription.current_period_end).getTime();
    const base = new Date(Math.max(Date.now(), Number.isNaN(currentEnd) ? 0 : currentEnd));
    if (subscription.interval === 'year') base.setFullYear(base.getFullYear() + 1);
    else base.setMonth(base.getMonth() + 1);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNewEnd(base);
  }, [subscription.current_period_end, subscription.interval]);

  async function apply() {
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
    const res = await renewSubscriptionAction({
      churchId,
      amountIdr,
      paymentRef: paymentRef.trim() || null,
    });
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
          <h2 className="text-lg font-bold text-text-primary">Perpanjang Langganan</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary">&times;</button>
        </div>

        <div className="space-y-4 p-5">
          <div className="text-sm text-text-secondary">
            Paket: <span className="capitalize text-text-primary">{subscription.tier}</span> ·{' '}
            {intervalLabel(subscription.interval)}
          </div>
          <div className="text-sm text-text-secondary">
            Berakhir:{' '}
            <span className="text-text-primary">
              {new Date(subscription.current_period_end).toLocaleDateString('id-ID')}
            </span>{' '}
            → <span className="text-text-primary">{newEnd ? newEnd.toLocaleDateString('id-ID') : '…'}</span>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-text-secondary">
              Jumlah pembayaran (opsional)
            </label>
            <input
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="mis. 99000 — kosongkan jika tanpa pembayaran"
              className="mt-1 w-full rounded-lg border border-border-color bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-brand"
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-text-secondary">
              Referensi pembayaran (opsional)
            </label>
            <input
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
              placeholder="mis. referensi transfer bank"
              className="mt-1 w-full rounded-lg border border-border-color bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-brand"
            />
          </div>

          <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
            Perpanjangan menghapus penanda batal akhir periode dan perubahan terjadwal.
          </p>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 border-t border-border-color p-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary">
            Batal
          </button>
          <button
            onClick={apply}
            disabled={saving}
            className="rounded-lg bg-brand px-5 py-2 text-sm font-bold text-brand-content hover:bg-brand-hover disabled:opacity-50"
          >
            {saving ? 'Menyimpan…' : 'Perpanjang'}
          </button>
        </div>
      </div>
    </div>
  );
}
