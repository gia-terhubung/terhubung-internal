'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { applyAddonChangeAction } from '@/services/billing.actions';

export function AddonChangeModal({
  churchId,
  currentAddonCount,
  onClose,
}: {
  churchId: string;
  currentAddonCount: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [count, setCount] = useState(String(currentAddonCount));
  const [amount, setAmount] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    // Number('') === 0 — an empty field must not silently remove all add-ons.
    if (count.trim() === '') {
      setError('Jumlah paket wajib diisi.');
      return;
    }
    const newCount = Number(count.trim());
    if (!Number.isInteger(newCount) || newCount < 0) {
      setError('Jumlah paket add-on harus angka bulat ≥ 0.');
      return;
    }

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
    const res = await applyAddonChangeAction({
      churchId,
      addonCount: newCount,
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
          <h2 className="text-lg font-bold text-text-primary">Ubah Add-on Kapasitas</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary">&times;</button>
        </div>

        <div className="space-y-4 p-5">
          <div className="text-sm text-text-secondary">
            Saat ini: <span className="text-text-primary">{currentAddonCount} paket</span> · +50
            anggota &amp; +50 simpatisan per paket
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-text-secondary">
              Jumlah paket baru (total)
            </label>
            <input
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border-color bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-brand"
            />
            <p className="mt-1 text-xs text-text-secondary">
              Nilai absolut, bukan penambahan — 0 menghapus semua add-on.
            </p>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-text-secondary">
              Jumlah pembayaran (opsional)
            </label>
            <input
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="mis. 50000 — kosongkan jika tanpa pembayaran"
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
            {saving ? 'Menyimpan…' : 'Terapkan'}
          </button>
        </div>
      </div>
    </div>
  );
}
