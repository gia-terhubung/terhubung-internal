'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CreateChurchModal } from '@/components/organisms/CreateChurchModal.organism';
import { SearchInput } from '@/components/atoms/SearchInput.atom';
import { Pagination } from '@/components/molecules/Pagination.molecule';
import type { ChurchRow } from '@/services/church.service';

const PAGE_SIZE = 15;
type Sort = 'recent' | 'oldest' | 'name';

const selectCls =
  'rounded-lg border border-border-color bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-brand';

export function ChurchesClient({ initialChurches }: { initialChurches: ChurchRow[] }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const processed = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = q
      ? initialChurches.filter(
          (c) => c.name.toLowerCase().includes(q) || (c.city ?? '').toLowerCase().includes(q)
        )
      : [...initialChurches];
    rows.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return sort === 'oldest' ? ta - tb : tb - ta;
    });
    return rows;
  }, [initialChurches, search, sort]);

  const totalPages = Math.max(1, Math.ceil(processed.length / PAGE_SIZE));
  const pageRows = processed.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Gereja</h1>
          <p className="mt-1 text-sm text-text-secondary">{initialChurches.length} gereja terdaftar</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-brand-content hover:bg-brand-hover"
        >
          + Buat Gereja
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          placeholder="Cari nama atau kota…"
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
              <th className="px-4 py-3 font-medium">Nama</th>
              <th className="px-4 py-3 font-medium">Sinode</th>
              <th className="px-4 py-3 font-medium">Kota</th>
              <th className="px-4 py-3 font-medium">Dibuat</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-text-secondary">
                  Tidak ada gereja.
                </td>
              </tr>
            ) : (
              pageRows.map((c, i) => (
                <tr key={c.id} className="border-t border-border-color hover:bg-bg-secondary">
                  <td className="px-4 py-3 text-text-secondary">{(page - 1) * PAGE_SIZE + i + 1}</td>
                  <td className="px-4 py-3">
                    <Link href={`/churches/${c.id}`} className="font-medium text-brand hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{c.synod ?? '—'}</td>
                  <td className="px-4 py-3 text-text-secondary">{c.city ?? '—'}</td>
                  <td className="px-4 py-3 text-text-secondary">
                    {new Date(c.created_at).toLocaleDateString('id-ID')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      </div>

      {showCreate && <CreateChurchModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
