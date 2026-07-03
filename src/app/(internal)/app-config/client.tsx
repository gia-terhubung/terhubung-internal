'use client';

import { useState } from 'react';
import { EditAppVersionModal } from '@/components/organisms/EditAppVersionModal.organism';
import type { AppVersionConfig } from '@/types/internal.types';

const PLATFORM_LABEL: Record<AppVersionConfig['platform'], string> = {
  ios: 'iOS',
  android: 'Android',
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-text-secondary">{label}</div>
      <div className="mt-0.5 break-all text-sm text-text-primary">{value || '—'}</div>
    </div>
  );
}

export function AppConfigClient({ configs }: { configs: AppVersionConfig[] }) {
  const [editing, setEditing] = useState<AppVersionConfig | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Versi Aplikasi</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Kontrol force update aplikasi mobile. Menaikkan versi minimum memblokir pengguna di
          bawahnya sampai mereka memperbarui dari store.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {configs.map((c) => (
          <div key={c.platform} className="rounded-xl border border-border-color bg-bg-secondary p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-text-primary">{PLATFORM_LABEL[c.platform]}</h2>
              <button
                onClick={() => setEditing(c)}
                className="rounded-lg bg-bg-hover px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary"
              >
                Ubah
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Versi Terbaru" value={c.latest_version} />
              <Field label="Versi Minimum" value={c.min_version} />
              <div className="col-span-2">
                <Field label="Pesan Pembaruan" value={c.update_message} />
              </div>
              <div className="col-span-2">
                <Field label="Store URL" value={c.store_url} />
              </div>
            </div>
            <p className="mt-4 border-t border-border-color pt-3 text-xs text-text-secondary">
              Terakhir diubah{c.updated_by_label ? ` oleh ${c.updated_by_label}` : ''} ·{' '}
              {new Date(c.updated_at).toLocaleString('id-ID')}
            </p>
          </div>
        ))}
        {configs.length === 0 && (
          <p className="text-sm text-text-secondary">
            Belum ada baris app_version_config. Seed baris ios/android lewat SQL terlebih dahulu.
          </p>
        )}
      </div>

      {editing && <EditAppVersionModal config={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
