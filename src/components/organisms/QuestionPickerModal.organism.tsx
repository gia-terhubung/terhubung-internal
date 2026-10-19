'use client';

import { useEffect, useState } from 'react';
import { SearchInput } from '@/components/atoms/SearchInput.atom';
import { searchQuestionsAction } from '@/services/campaignContent.actions';
import { CATEGORY_LABEL } from '@/libs/campaign';
import type { QuestionCategory, QuestionOption } from '@/types/campaign.types';

export function QuestionPickerModal({
  campaignId,
  title,
  defaultCategory,
  hasCurrent,
  onPick,
  onClose,
}: {
  campaignId: string;
  title: string;
  defaultCategory: QuestionCategory | '';
  hasCurrent: boolean;
  onPick: (questionId: string | null) => Promise<string | null>; // returns error or null
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<QuestionCategory | ''>(defaultCategory);
  const [options, setOptions] = useState<QuestionOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    searchQuestionsAction({ query, category, campaignId })
      .then((r) => {
        if (alive) {
          setOptions(r);
          setError(null);
        }
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : 'Gagal memuat soal.');
      });
    return () => {
      alive = false;
    };
  }, [query, category, campaignId]);

  async function pick(id: string | null) {
    setBusy(true);
    setError(null);
    try {
      const err = await onPick(id);
      if (err) return setError(err);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-border-color bg-bg-secondary shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-color p-5">
          <h2 className="text-lg font-bold text-text-primary">{title}</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary">&times;</button>
        </div>
        <div className="flex flex-wrap gap-3 p-5 pb-0">
          <SearchInput placeholder="Cari pertanyaan…" onSearch={setQuery} containerClassName="w-full max-w-xs" autoFocus />
          <select value={category} onChange={(e) => setCategory(e.target.value as QuestionCategory | '')}
            className="rounded-lg border border-border-color bg-bg-primary px-3 py-2 text-sm text-text-primary">
            <option value="">Semua kategori</option>
            {(Object.keys(CATEGORY_LABEL) as QuestionCategory[]).map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
        </div>
        <ul className="flex-1 divide-y divide-border-color overflow-y-auto p-5">
          {options.length === 0 && <li className="py-6 text-center text-sm text-text-secondary">Tidak ada soal yang cocok.</li>}
          {options.map((o) => (
            <li key={o.id} className="flex items-start gap-3 py-3">
              <div className="flex-1 text-sm">
                <div className="text-text-primary">{o.prompt}</div>
                <div className="mt-1 text-xs text-text-secondary">
                  A. {o.option_a} · B. {o.option_b} · benar {o.correct.toUpperCase()} · {CATEGORY_LABEL[o.category]}
                  {o.used_count > 0 ? ` · dipakai ${o.used_count}×${o.used_here ? ' (termasuk campaign ini)' : ''}` : ''}
                </div>
              </div>
              <button disabled={busy} onClick={() => pick(o.id)}
                className="rounded-lg bg-brand px-3 py-1.5 text-sm font-bold text-brand-content hover:bg-brand-hover disabled:opacity-50">
                Pilih
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-border-color p-5">
          {error ? <p className="text-sm text-danger">{error}</p> : <span />}
          {hasCurrent && (
            <button disabled={busy} onClick={() => pick(null)} className="text-sm text-text-secondary hover:text-danger">
              Kosongkan slot
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
