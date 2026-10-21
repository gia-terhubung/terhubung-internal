'use client';

import { useState } from 'react';
import { uploadCampaignImageAction } from '@/services/campaign.actions';

export function ImageUploadField({
  label,
  campaignId,
  kind,
  prizeId,
  value,
  onChange,
}: {
  label: string;
  campaignId: string;
  kind: 'banner' | 'hero' | 'prize';
  prizeId?: string; // required for kind 'prize'; upload disabled until the prize is saved
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Display-only cache-bust: re-uploads overwrite the same URL, so bump the preview src.
  const [version, setVersion] = useState(0);
  const locked = kind === 'prize' && !prizeId;

  async function upload(file: File) {
    setError(null);
    if (file.size > 3 * 1024 * 1024) {
      setError('Ukuran gambar maksimal 3 MB.');
      return;
    }
    setBusy(true);
    const fd = new FormData();
    fd.set('file', file);
    fd.set('campaignId', campaignId);
    fd.set('kind', kind);
    if (prizeId) fd.set('prizeId', prizeId);
    try {
      const res = await uploadCampaignImageAction(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onChange(res.data.url);
      setVersion(Date.now());
    } catch {
      setError('Gagal mengunggah gambar. Coba lagi.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <span className="text-sm text-text-secondary">{label}</span>
      <div className="mt-1 flex items-center gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={version ? `${value}?v=${version}` : value} alt="" className="h-16 w-24 rounded-lg border border-border-color object-cover" />
        ) : (
          <div className="h-16 w-24 rounded-lg border border-dashed border-border-color" />
        )}
        {locked ? (
          <span className="text-sm text-text-secondary">Simpan hadiah dulu untuk mengunggah foto.</span>
        ) : (
          <label className="cursor-pointer rounded-lg bg-bg-hover px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary">
            {busy ? 'Mengunggah…' : value ? 'Ganti gambar' : 'Unggah gambar'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.target.value = '';
              }}
            />
          </label>
        )}
        {value && (
          <button type="button" onClick={() => onChange(null)} className="text-sm text-text-secondary hover:text-danger">
            Hapus
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
}
