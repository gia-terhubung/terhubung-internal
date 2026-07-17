'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { SearchInput } from '@/components/atoms/SearchInput.atom';
import { Pagination } from '@/components/molecules/Pagination.molecule';
import { PAGE_SIZE } from '@/libs/pagination';
import type { HistorySort } from '@/services/church.service';
import type { ChurchCreationRow } from '@/types/internal.types';

const selectCls =
  'rounded-lg border border-border-color bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-brand';

interface Props {
  rows: ChurchCreationRow[];
  total: number;
  page: number;
  search: string;
  sort: HistorySort;
}

export function HistoryClient({ rows, total, page, search, sort }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  // All list state lives in the URL; changing q/sort resets to page 1.
  function setParams(next: { q?: string; sort?: HistorySort; page?: number }) {
    const sp = new URLSearchParams();
    const q = next.q ?? search;
    const s = next.sort ?? sort;
    const p = next.page ?? 1;
    if (q) sp.set('q', q);
    if (s !== 'recent') sp.set('sort', s);
    if (p > 1) sp.set('page', String(p));
    const qs = sp.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Riwayat Pembuatan Gereja</h1>
        <p className="mt-1 text-sm text-text-secondary">{total} gereja dibuat</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          placeholder="Cari gereja atau pembuat…"
          defaultValue={search}
          onSearch={(v) => setParams({ q: v })}
          containerClassName="w-full max-w-xs"
        />
        <select value={sort} onChange={(e) => setParams({ sort: e.target.value as HistorySort })} className={selectCls}>
          <option value="recent">Terbaru</option>
          <option value="oldest">Terlama</option>
          <option value="name">Nama (A–Z)</option>
        </select>
      </div>

      <div className={`overflow-hidden rounded-xl border border-border-color ${isPending ? 'opacity-60 transition-opacity' : ''}`}>
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
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-text-secondary">Belum ada gereja.</td>
              </tr>
            ) : (
              rows.map((r, i) => (
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
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={(p) => setParams({ page: p })} />
      </div>
    </div>
  );
}
