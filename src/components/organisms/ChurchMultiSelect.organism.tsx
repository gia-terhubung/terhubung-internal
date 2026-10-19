'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SearchInput } from '@/components/atoms/SearchInput.atom';
import { searchChurchesAction, setCampaignChurchesAction } from '@/services/campaign.actions';
import type { ChurchOption } from '@/types/campaign.types';

export function ChurchMultiSelect({ campaignId, initial }: { campaignId: string; initial: ChurchOption[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<ChurchOption[]>(initial);
  const [results, setResults] = useState<ChurchOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const reqId = useRef(0);

  const dirty =
    selected.length !== initial.length || selected.some((s) => !initial.find((i) => i.id === s.id));

  async function search(q: string) {
    const my = ++reqId.current;
    try {
      const r = q.trim() ? await searchChurchesAction(q) : [];
      if (my !== reqId.current) return;
      setResults(r);
      setError(null);
    } catch (e) {
      if (my !== reqId.current) return;
      setError(e instanceof Error ? e.message : 'Pencarian gagal.');
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    const res = await setCampaignChurchesAction(campaignId, selected.map((s) => s.id));
    setSaving(false);
    if (!res.ok) return setError(res.error);
    setSaved(true);
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-border-color bg-bg-secondary p-5">
      <h2 className="font-semibold text-text-primary">Gereja peserta</h2>
      <p className="mt-1 text-sm text-text-secondary">
        Jemaat gereja ini melihat campaign di aplikasi dan otomatis ikut undian hadiah reguler.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {selected.length === 0 && <span className="text-sm text-text-secondary">Belum ada gereja.</span>}
        {selected.map((c) => (
          <span key={c.id} className="flex items-center gap-2 rounded-full bg-bg-hover px-3 py-1 text-sm text-text-primary">
            {c.name}
            <button
              aria-label={`Hapus ${c.name}`}
              onClick={() => { setSaved(false); setSelected((s) => s.filter((x) => x.id !== c.id)); }}
              className="text-text-secondary hover:text-danger"
            >
              &times;
            </button>
          </span>
        ))}
      </div>

      <div className="mt-4 max-w-sm">
        <SearchInput placeholder="Cari nama gereja atau kota…" onSearch={search} containerClassName="w-full" />
        {results.length > 0 && (
          <ul className="mt-2 divide-y divide-border-color rounded-lg border border-border-color bg-bg-primary">
            {results.map((r) => {
              const picked = selected.some((s) => s.id === r.id);
              return (
                <li key={r.id}>
                  <button
                    disabled={picked}
                    onClick={() => { setSaved(false); setError(null); setSelected((s) => [...s, r]); }}
                    className="flex w-full justify-between px-3 py-2 text-left text-sm text-text-primary hover:bg-bg-hover disabled:opacity-50"
                  >
                    <span>{r.name}</span>
                    <span className="text-text-secondary">{picked ? 'Sudah dipilih' : r.city ?? ''}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-4 flex items-center justify-end gap-3">
        {error && <p className="text-sm text-danger">{error}</p>}
        {saved && !dirty && <p className="text-sm text-text-secondary">Gereja peserta disimpan.</p>}
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-brand-content hover:bg-brand-hover disabled:opacity-50"
        >
          {saving ? 'Menyimpan…' : 'Simpan gereja'}
        </button>
      </div>
    </section>
  );
}
