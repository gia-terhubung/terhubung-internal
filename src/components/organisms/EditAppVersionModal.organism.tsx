'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateAppVersionConfigAction } from '@/services/appConfig.actions';
import { compareVersions, isValidVersion } from '@/libs/version';
import type { AppVersionConfig } from '@/types/internal.types';

const inputCls =
  'mt-1 w-full rounded-lg border border-border-color bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-brand';

export function EditAppVersionModal({
  config,
  onClose,
}: {
  config: AppVersionConfig;
  onClose: () => void;
}) {
  const router = useRouter();
  const [latest, setLatest] = useState(config.latest_version);
  const [min, setMin] = useState(config.min_version);
  const [message, setMessage] = useState(config.update_message ?? '');
  const [storeUrl, setStoreUrl] = useState(config.store_url ?? '');
  const [forceConfirmText, setForceConfirmText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const versionsValid = isValidVersion(latest.trim()) && isValidVersion(min.trim());
  const minAboveLatest = versionsValid && compareVersions(min.trim(), latest.trim()) > 0;
  const isRaisingMin =
    versionsValid && compareVersions(min.trim(), config.min_version) > 0;
  const forceConfirmed = !isRaisingMin || forceConfirmText.trim() === min.trim();

  const canSave = useMemo(
    () => versionsValid && !minAboveLatest && forceConfirmed && !saving,
    [versionsValid, minAboveLatest, forceConfirmed, saving]
  );

  async function save() {
    setSaving(true);
    setError(null);
    const res = await updateAppVersionConfigAction({
      platform: config.platform,
      latestVersion: latest.trim(),
      minVersion: min.trim(),
      updateMessage: message.trim() || null,
      storeUrl: storeUrl.trim() || null,
      confirmForceUpdate: isRaisingMin,
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
          <h2 className="text-lg font-bold text-text-primary">
            Ubah Versi {config.platform === 'ios' ? 'iOS' : 'Android'}
          </h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary">&times;</button>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-text-secondary">
                Versi terbaru
              </label>
              <input
                value={latest}
                onChange={(e) => setLatest(e.target.value)}
                placeholder="mis. 1.4.0"
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-text-secondary">
                Versi minimum
              </label>
              <input
                value={min}
                onChange={(e) => setMin(e.target.value)}
                placeholder="mis. 1.2.0"
                className={inputCls}
              />
            </div>
          </div>
          {!versionsValid && (latest || min) && (
            <p className="text-xs text-text-secondary">Format versi: x.y.z (angka).</p>
          )}
          {minAboveLatest && (
            <p className="text-sm text-danger">
              Versi minimum tidak boleh lebih tinggi dari versi terbaru — pengguna akan diminta
              memperbarui ke versi yang belum ada.
            </p>
          )}

          <div>
            <label className="text-xs uppercase tracking-wider text-text-secondary">
              Pesan pembaruan (opsional)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder="Ditampilkan di dialog pembaruan aplikasi"
              className={inputCls}
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-text-secondary">
              Store URL (opsional)
            </label>
            <input
              value={storeUrl}
              onChange={(e) => setStoreUrl(e.target.value)}
              placeholder="https:// · itms-apps:// · market://"
              className={inputCls}
            />
          </div>

          {isRaisingMin && (
            <div className="space-y-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
              <p className="text-sm font-medium text-danger">
                Menaikkan versi minimum akan MEMBLOKIR semua pengguna di bawah v{min.trim()} sampai
                mereka memperbarui aplikasi dari store.
              </p>
              <label className="text-xs text-text-secondary">
                Ketik <span className="font-mono font-bold">{min.trim()}</span> untuk konfirmasi:
              </label>
              <input
                value={forceConfirmText}
                onChange={(e) => setForceConfirmText(e.target.value)}
                className={inputCls}
              />
            </div>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 border-t border-border-color p-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary">
            Batal
          </button>
          <button
            onClick={save}
            disabled={!canSave}
            className="rounded-lg bg-brand px-5 py-2 text-sm font-bold text-brand-content hover:bg-brand-hover disabled:opacity-50"
          >
            {saving ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
}
