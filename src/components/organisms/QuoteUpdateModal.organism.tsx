'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateQuoteAction } from '@/services/billing.actions';
import type { QuoteRow } from '@/types/internal.types';

// Set/adjust the negotiated price on a custom-tier quote (status → 'quoted').
export function QuoteUpdateModal({ quote, onClose }: { quote: QuoteRow; onClose: () => void }) {
  const router = useRouter();
  const [price, setPrice] = useState(quote.quoted_price_idr != null ? String(quote.quoted_price_idr) : '');
  const [expiresAt, setExpiresAt] = useState(quote.expires_at ? quote.expires_at.slice(0, 10) : '');
  const [notes, setNotes] = useState(quote.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const n = Number(price.trim());
    if (!price.trim() || !Number.isInteger(n) || n <= 0) {
      setError('Harga penawaran harus angka bulat positif.');
      return;
    }

    setSaving(true);
    setError(null);
    const res = await updateQuoteAction({
      quoteId: quote.id,
      status: 'quoted',
      quotedPriceIdr: n,
      expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null,
      notes: notes || null,
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
          <h2 className="text-lg font-bold text-text-primary">Beri Harga Penawaran</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary">&times;</button>
        </div>

        <div className="space-y-4 p-5">
          <div className="text-sm text-text-secondary">
            {quote.church_name} · {quote.member_count} anggota
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-text-secondary">
              Harga penawaran (IDR / tahun)
            </label>
            <input
              inputMode="numeric"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="mis. 5000000"
              className="mt-1 w-full rounded-lg border border-border-color bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-brand"
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-text-secondary">
              Berlaku sampai (opsional)
            </label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border-color bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-brand"
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-text-secondary">
              Catatan (opsional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
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
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-brand px-5 py-2 text-sm font-bold text-brand-content hover:bg-brand-hover disabled:opacity-50"
          >
            {saving ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
}
