'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { SearchInput } from '@/components/atoms/SearchInput.atom';
import { Pagination } from '@/components/molecules/Pagination.molecule';
import type { ChurchCreationRow } from '@/types/internal.types';

const PAGE_SIZE = 15;
type Sort = 'recent' | 'oldest' | 'name';

const selectCls =
  'rounded-lg border border-border-color bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-brand';

export function HistoryClient({ rows }: { rows: ChurchCreationRow[] }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [page, setPage] = useState(1);

  const processed = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = q
      ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.creator.toLowerCase().includes(q))
      : [...rows];
    out.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return sort === 'oldest' ? ta - tb : tb - ta;
    });
    return out;
  }, [rows, search, sort]);

  const totalPages = Math.max(1, Math.ceil(processed.length / PAGE_SIZE));
  const pageRows = processed.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Riwayat Pembuatan Gereja</h1>
        <p className="mt-1 text-sm text-text-secondary">{rows.length} gereja dibuat</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          placeholder="Cari gereja atau pembuat…"
          onSearch={(v) => { setSearch(v); setPage(1); }}
          containerClassName="w-full max-w-xs"
        />
        <select value={sort} onChange={(e) => { setSort(e.target.value as Sort); setPage(1); }} className={selectCls}>
          <option value="recent">Terbaru</option>
          <option value="oldest">Terlama</option>
          <option value="name">Nama (A–Z)</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-border-color">
        <table className="w-full text-sm">
          <thead className="bg-bg-secondary text-left text-text-secondary">
            <tr>
              <th className="px-4 py-3 font-medium">No.</th>
              <th className="px-4 py-3 font-medium">Gereja</th>
              <th className="px-4 py-3 font-medium">Dibuat oleh</th>
              <th className="px-4 py-3 font-medium">Tanggal</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-text-secondary">Belum ada gereja.</td>
              </tr>
            ) : (
              pageRows.map((r, i) => (
                <tr key={r.id} className="border-t border-border-color">
                  <td className="px-4 py-3 text-text-secondary">{(page - 1) * PAGE_SIZE + i + 1}</td>
                  <td className="px-4 py-3">
                    <Link href={`/churches/${r.id}`} className="font-medium text-brand hover:underline">
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{r.creator}</td>
                  <td className="px-4 py-3 text-text-secondary">
                    {new Date(r.created_at).toLocaleString('id-ID')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      </div>
    </div>
  );
}
