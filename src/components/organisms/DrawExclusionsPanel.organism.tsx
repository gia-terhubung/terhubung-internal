'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog.molecule';
import { formatWib } from '@/libs/campaign';
import {
  addDrawExclusionAction, removeDrawExclusionAction, searchDrawCandidatesAction,
} from '@/services/campaignMonitor.actions';
import type { DrawCandidateRow, DrawExclusionRow } from '@/types/campaign.types';

const inputCls =
  'mt-1 w-full rounded-lg border border-border-color bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-brand';

const keyOf = (r: { user_id: string | null; person_id: string | null }) => r.user_id ?? r.person_id ?? '';

// Draw opt-out (privacy policy): a member or a parent asks, via the church admin or halo@terhubung.app,
// to leave the prize draw. Excluded people are in no draw pool (reguler or utama).
export function DrawExclusionsPanel({
  campaignId, exclusions, frozen,
}: {
  campaignId: string; exclusions: DrawExclusionRow[]; frozen: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DrawCandidateRow[] | null>(null);
  const [picked, setPicked] = useState<DrawCandidateRow | null>(null);
  const [note, setNote] = useState('');
  const [removing, setRemoving] = useState<DrawExclusionRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setAdding(false);
    setQuery('');
    setResults(null);
    setPicked(null);
    setNote('');
    setError(null);
  }

  async function search() {
    setError(null);
    setPicked(null);
    try {
      setResults(await searchDrawCandidatesAction(campaignId, query));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mencari.');
    }
  }

  async function add() {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      const res = await addDrawExclusionAction({ campaignId, userId: picked.user_id, personId: picked.person_id, note });
      if (!res.ok) return setError(res.error);
      close();
      router.refresh();
    } catch {
      setError('Koneksi ke server gagal. Coba lagi.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!removing) return;
    setError(null);
    try {
      const res = await removeDrawExclusionAction({ campaignId, exclusionId: removing.id });
      if (res.ok) router.refresh();
      else setError(res.error);
    } catch {
      setError('Koneksi ke server gagal. Coba lagi.');
    } finally {
      setRemoving(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border-color bg-bg-secondary">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-color p-4">
        <div>
          <h2 className="font-semibold text-text-primary">Pengecualian undian ({exclusions.length})</h2>
          <p className="text-xs text-text-secondary">
            Jemaat, atau orang tuanya, yang minta tidak ikut undian lewat admin gereja atau halo@terhubung.app. Mereka tidak ikut
            undian hadiah reguler maupun hadiah utama.
            {frozen && ' Peserta sudah dibekukan: pengecualian baru langsung berlaku, tetapi tidak bisa dihapus lagi.'}
          </p>
        </div>
        <button onClick={() => setAdding(true)} className="rounded-lg bg-bg-hover px-4 py-2 text-sm text-text-primary hover:bg-bg-tertiary">
          Tambah pengecualian
        </button>
      </div>
      {error && !adding && <p className="px-4 pt-3 text-sm text-danger">{error}</p>}
      <table className="w-full text-sm">
        <thead className="text-left text-text-secondary">
          <tr>
            <th className="px-4 py-3 font-medium">Nama</th>
            <th className="px-4 py-3 font-medium">Gereja</th>
            <th className="px-4 py-3 font-medium">Catatan</th>
            <th className="px-4 py-3 font-medium">Tanggal</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {exclusions.length === 0 && (
            <tr><td colSpan={5} className="px-4 py-6 text-center text-text-secondary">Belum ada pengecualian.</td></tr>
          )}
          {exclusions.map((x) => (
            <tr key={x.id} className="border-t border-border-color">
              <td className="px-4 py-3 text-text-primary">
                {x.full_name}
                {x.person_id && <span className="ml-2 text-xs text-text-secondary">Tanpa aplikasi</span>}
              </td>
              <td className="px-4 py-3 text-text-secondary">{x.church_name ?? '—'}</td>
              <td className="px-4 py-3 text-text-secondary">{x.note}</td>
              <td className="px-4 py-3 text-text-secondary">{formatWib(x.created_at)}</td>
              <td className="px-4 py-3 text-right">
                {!frozen && (
                  <button onClick={() => setRemoving(x)} className="text-sm text-text-secondary hover:text-danger">Hapus</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {adding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-border-color bg-bg-secondary shadow-2xl">
            <div className="flex items-center justify-between border-b border-border-color p-5">
              <h2 className="text-lg font-bold text-text-primary">Tambah pengecualian undian</h2>
              <button onClick={close} className="text-text-secondary hover:text-text-primary">&times;</button>
            </div>
            <div className="space-y-4 overflow-y-auto p-5">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void search();
                }}
                className="flex items-end gap-2"
              >
                <label className="block flex-1">
                  <span className="text-sm text-text-secondary">Cari nama jemaat (termasuk tanpa aplikasi)</span>
                  <input value={query} onChange={(e) => setQuery(e.target.value)} className={inputCls} placeholder="Minimal 2 huruf" />
                </label>
                <button type="submit" disabled={query.trim().length < 2}
                  className="rounded-lg bg-bg-hover px-4 py-2 text-sm text-text-primary hover:bg-bg-tertiary disabled:opacity-50">
                  Cari
                </button>
              </form>
              {results !== null && (
                <ul className="max-h-60 divide-y divide-border-color overflow-y-auto rounded-lg border border-border-color text-sm">
                  {results.length === 0 && <li className="p-3 text-text-secondary">Tidak ditemukan.</li>}
                  {results.map((r) => (
                    <li key={`${keyOf(r)}-${r.church_name}`}>
                      <button type="button" disabled={r.excluded} onClick={() => setPicked(r)}
                        className={`flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-bg-hover disabled:opacity-50 ${
                          picked && keyOf(picked) === keyOf(r) ? 'bg-bg-hover' : ''
                        }`}>
                        <span>
                          <span className="block text-text-primary">{r.full_name}</span>
                          <span className="block text-xs text-text-secondary">
                            {r.church_name}
                            {!r.has_app && ' · Tanpa aplikasi'}
                          </span>
                        </span>
                        {r.excluded && <span className="text-xs text-text-secondary">Sudah dikecualikan</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <label className="block">
                <span className="text-sm text-text-secondary">Catatan (wajib), mis. permintaan orang tua lewat admin gereja</span>
                <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
              </label>
              {error && <p className="text-sm text-danger">{error}</p>}
            </div>
            <div className="flex justify-end gap-3 border-t border-border-color p-5">
              <button onClick={close} disabled={busy} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary disabled:opacity-50">
                Batal
              </button>
              <button onClick={add} disabled={busy || !picked || note.trim().length < 3}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-brand-content hover:bg-brand-hover disabled:opacity-50">
                {picked ? `Kecualikan ${picked.full_name}` : 'Pilih orang dulu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {removing && (
        <ConfirmDialog
          title="Hapus pengecualian?"
          message={`${removing.full_name} akan ikut undian lagi saat peserta dibekukan.`}
          confirmLabel="Hapus"
          danger
          onConfirm={remove}
          onClose={() => setRemoving(null)}
        />
      )}
    </section>
  );
}
