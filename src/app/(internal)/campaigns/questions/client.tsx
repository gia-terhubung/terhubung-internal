'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Badge } from '@/components/atoms/Badge.atom';
import { SearchInput } from '@/components/atoms/SearchInput.atom';
import { Pagination } from '@/components/molecules/Pagination.molecule';
import { QuestionModal } from '@/components/organisms/QuestionModal.organism';
import { archiveQuestionAction, importQuestionsCsvAction } from '@/services/campaignContent.actions';
import { PAGE_SIZE } from '@/libs/pagination';
import { CATEGORY_LABEL, QUESTION_CSV_HEADER, downloadCsv } from '@/libs/campaign';
import type { QuestionCategory, QuestionRow } from '@/types/campaign.types';

const selectCls =
  'rounded-lg border border-border-color bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-brand';

interface Props {
  rows: QuestionRow[];
  total: number;
  page: number;
  search: string;
  category: QuestionCategory | '';
  difficulty: 0 | 1 | 2 | 3;
  archived: boolean;
}

export function QuestionsClient({ rows, total, page, search, category, difficulty, archived }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState<QuestionRow | null | undefined>(undefined);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  function setParams(next: Partial<{ q: string; category: string; difficulty: number; archived: boolean; page: number }>) {
    const sp = new URLSearchParams();
    const q = next.q ?? search;
    const c = next.category ?? category;
    const d = next.difficulty ?? difficulty;
    const a = next.archived ?? archived;
    const p = next.page ?? 1;
    if (q) sp.set('q', q);
    if (c) sp.set('category', c);
    if (d) sp.set('difficulty', String(d));
    if (a) sp.set('archived', '1');
    if (p > 1) sp.set('page', String(p));
    const qs = sp.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  async function importFile(file: File) {
    setImporting(true);
    setImportMsg(null);
    try {
      const res = await importQuestionsCsvAction(await file.text());
      if (!res.ok) return setImportMsg({ ok: false, text: res.error });
      setImportMsg({ ok: true, text: `${res.data.inserted} soal ditambahkan, ${res.data.skipped} dilewati karena sudah ada.` });
      router.refresh();
    } catch {
      setImportMsg({ ok: false, text: 'Gagal mengimpor file. Coba lagi.' });
    } finally {
      setImporting(false);
    }
  }

  async function toggleArchive(q: QuestionRow) {
    setArchivingId(q.id);
    try {
      const res = await archiveQuestionAction(q.id, !q.archived_at);
      if (!res.ok) return setImportMsg({ ok: false, text: res.error });
      router.refresh();
    } catch {
      setImportMsg({ ok: false, text: 'Gagal mengubah arsip. Coba lagi.' });
    } finally {
      setArchivingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/campaigns" className="text-sm text-text-secondary hover:text-text-primary">← Semua campaign</Link>
          <h1 className="mt-2 text-2xl font-bold text-text-primary">Bank soal</h1>
          <p className="mt-1 text-sm text-text-secondary">{total} soal · dipakai ulang lintas campaign</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => downloadCsv('template-soal.csv', [[...QUESTION_CSV_HEADER], ['Ibu kota Indonesia adalah…', 'Jakarta', 'Bandung', 'a', 'umum', 1]])}
            className="rounded-lg bg-bg-hover px-4 py-2 text-sm text-text-primary hover:bg-bg-tertiary"
          >
            Unduh template CSV
          </button>
          <label className="cursor-pointer rounded-lg bg-bg-hover px-4 py-2 text-sm text-text-primary hover:bg-bg-tertiary">
            {importing ? 'Mengimpor…' : 'Impor CSV'}
            <input type="file" accept=".csv,text/csv" className="hidden" disabled={importing}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
          </label>
          <button onClick={() => setEditing(null)} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-brand-content hover:bg-brand-hover">
            + Tambah soal
          </button>
        </div>
      </div>

      {importMsg && (
        <pre className={`whitespace-pre-wrap rounded-lg border p-3 text-sm ${importMsg.ok ? 'border-border-color text-text-primary' : 'border-danger text-danger'}`}>
          {importMsg.text}
        </pre>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput placeholder="Cari pertanyaan…" defaultValue={search} onSearch={(v) => setParams({ q: v })} containerClassName="w-full max-w-xs" />
        <select value={category} onChange={(e) => setParams({ category: e.target.value })} className={selectCls}>
          <option value="">Semua kategori</option>
          {(Object.keys(CATEGORY_LABEL) as QuestionCategory[]).map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </select>
        <select value={difficulty} onChange={(e) => setParams({ difficulty: Number(e.target.value) })} className={selectCls}>
          <option value={0}>Semua kesulitan</option>
          <option value={1}>Mudah</option>
          <option value={2}>Sedang</option>
          <option value={3}>Sulit</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input type="checkbox" checked={archived} onChange={(e) => setParams({ archived: e.target.checked })} />
          Tampilkan arsip
        </label>
      </div>

      <div className={`overflow-hidden rounded-xl border border-border-color ${isPending ? 'opacity-60 transition-opacity' : ''}`}>
        <table className="w-full text-sm">
          <thead className="bg-bg-secondary text-left text-text-secondary">
            <tr>
              <th className="px-4 py-3 font-medium">Pertanyaan</th>
              <th className="px-4 py-3 font-medium">Jawaban</th>
              <th className="px-4 py-3 font-medium">Kategori</th>
              <th className="px-4 py-3 font-medium">Dipakai di</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-text-secondary">Tidak ada soal. Tambah soal atau impor CSV.</td></tr>
            )}
            {rows.map((q) => (
              <tr key={q.id} className="border-t border-border-color align-top">
                <td className="px-4 py-3 text-text-primary">{q.prompt}</td>
                <td className="px-4 py-3 text-text-secondary">
                  <div className={q.correct === 'a' ? 'font-semibold text-text-primary' : ''}>A. {q.option_a}</div>
                  <div className={q.correct === 'b' ? 'font-semibold text-text-primary' : ''}>B. {q.option_b}</div>
                </td>
                <td className="px-4 py-3"><Badge variant="secondary">{CATEGORY_LABEL[q.category]}</Badge></td>
                <td className="px-4 py-3 text-xs text-text-secondary">
                  {q.used_in.length === 0 ? 'Belum dipakai' : q.used_in.map((u) => `${u.campaign_name} · ${u.label}`).join('; ')}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <button onClick={() => setEditing(q)} className="mr-3 text-sm text-text-secondary hover:text-text-primary">Ubah</button>
                  <button onClick={() => toggleArchive(q)} disabled={archivingId === q.id} className="text-sm text-text-secondary hover:text-text-primary">
                    {q.archived_at ? 'Pulihkan' : 'Arsipkan'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination currentPage={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} onPageChange={(p) => setParams({ page: p })} />
      </div>

      {editing !== undefined && <QuestionModal question={editing} onClose={() => setEditing(undefined)} />}
    </div>
  );
}
