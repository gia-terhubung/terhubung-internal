'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateChurchLocationAction } from '@/services/church.actions';
import { LocationPicker, type LocationValue } from '@/components/organisms/LocationPicker.organism';

export function EditChurchLocationModal({
  churchId,
  initial,
  onClose,
}: {
  churchId: string;
  initial: LocationValue;
  onClose: () => void;
}) {
  const router = useRouter();
  const [location, setLocation] = useState<LocationValue>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await updateChurchLocationAction({ churchId, ...location });
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
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border-color bg-bg-secondary shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-color p-5">
          <h2 className="text-lg font-bold text-text-primary">Ubah Lokasi</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary">&times;</button>
        </div>
        <form onSubmit={save} className="space-y-3 p-5">
          <LocationPicker value={location} onChange={setLocation} />
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary">
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-brand px-5 py-2 text-sm font-bold text-brand-content hover:bg-brand-hover disabled:opacity-50"
            >
              {saving ? 'Menyimpan…' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
