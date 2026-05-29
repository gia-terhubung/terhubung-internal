'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { searchAppUsersAction, assignChurchAdminAction } from '@/services/church.actions';
import type { AppUserResult } from '@/types/internal.types';

export function AssignChurchAdminModal({ churchId, onClose }: { churchId: string; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<AppUserResult[]>([]);
  const [selected, setSelected] = useState<AppUserResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doSearch(e: React.FormEvent) {
    e.preventDefault();
    setSelected(null);
    setError(null);
    setSearching(true);
    try {
      setResults(await searchAppUsersAction(q));
    } catch {
      setError('Pencarian gagal.');
    } finally {
      setSearching(false);
    }
  }

  async function assign() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    const res = await assignChurchAdminAction({ userId: selected.id, churchId });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onClose();
    router.refresh();
  }

  const otherChurch = selected?.current_church_id && selected.current_church_id !== churchId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex w-full max-w-md flex-col rounded-xl border border-border-color bg-bg-secondary shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-color p-5">
          <h2 className="text-lg font-bold text-text-primary">Tetapkan Admin Gereja</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary">&times;</button>
        </div>

        <div className="p-5">
          <form onSubmit={doSearch} className="flex gap-2">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari nama pengguna terdaftar…"
              className="flex-1 rounded-lg border border-border-color bg-bg-primary px-3 py-2 text-text-primary outline-none focus:border-brand"
            />
            <button type="submit" className="rounded-lg bg-bg-hover px-4 text-sm text-text-primary">
              Cari
            </button>
          </form>

          <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-border-color bg-bg-primary">
            {searching ? (
              <div className="p-4 text-center text-sm text-text-secondary">Memuat…</div>
            ) : results.length === 0 ? (
              <div className="p-4 text-center text-sm text-text-secondary">Ketik nama lalu tekan Cari.</div>
            ) : (
              results.map((u) => (
                <label
                  key={u.id}
                  className={`flex cursor-pointer items-center gap-3 border-b border-border-color p-3 hover:bg-bg-tertiary ${
                    selected?.id === u.id ? 'bg-bg-tertiary' : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="user"
                    checked={selected?.id === u.id}
                    onChange={() => setSelected(u)}
                    className="text-brand"
                  />
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-hover text-xs font-semibold text-text-primary">
                    {u.full_name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-medium text-text-primary">{u.full_name}</span>
                    {u.current_role && (
                      <span className="block text-xs text-text-secondary">
                        {u.current_role}
                        {u.current_church_id ? ' · sudah di sebuah gereja' : ''}
                      </span>
                    )}
                  </span>
                </label>
              ))
            )}
          </div>

          {otherChurch && (
            <p className="mt-3 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
              Pengguna ini sudah terdaftar di gereja lain — penetapan akan ditolak (1 pengguna 1 gereja).
            </p>
          )}
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 border-t border-border-color p-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary">
            Batal
          </button>
          <button
            onClick={assign}
            disabled={!selected || saving}
            className="rounded-lg bg-brand px-5 py-2 text-sm font-bold text-brand-content hover:bg-brand-hover disabled:opacity-50"
          >
            {saving ? 'Menyimpan…' : 'Tetapkan'}
          </button>
        </div>
      </div>
    </div>
  );
}
