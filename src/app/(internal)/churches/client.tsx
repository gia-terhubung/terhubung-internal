'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { CreateChurchModal } from '@/components/organisms/CreateChurchModal.organism';
import { SearchInput } from '@/components/atoms/SearchInput.atom';
import { Pagination } from '@/components/molecules/Pagination.molecule';
import { PAGE_SIZE } from '@/libs/pagination';
import type { ChurchRow, ChurchSort } from '@/services/church.service';

const selectCls =
  'rounded-lg border border-border-color bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-brand';

interface Props {
  rows: ChurchRow[];
  total: number;
  page: number;
  search: string;
  sort: ChurchSort;
}

export function ChurchesClient({ rows, total, page, search, sort }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);

  // All list state lives in the URL; changing q/sort resets to page 1.
  function setParams(next: { q?: string; sort?: ChurchSort; page?: number }) {
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Gereja</h1>
          <p className="mt-1 text-sm text-text-secondary">{total} gereja terdaftar</p>
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
          defaultValue={search}
          onSearch={(v) => setParams({ q: v })}
          containerClassName="w-full max-w-xs"
        />
        <select value={sort} onChange={(e) => setParams({ sort: e.target.value as ChurchSort })} className={selectCls}>
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
              <th className="px-4 py-3 font-medium">Nama</th>
              <th className="px-4 py-3 font-medium">Sinode</th>
              <th className="px-4 py-3 font-medium">Kota</th>
              <th className="px-4 py-3 font-medium">Dibuat</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-text-secondary">
                  Tidak ada gereja.
                </td>
              </tr>
            ) : (
              rows.map((c, i) => (
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
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={(p) => setParams({ page: p })} />
      </div>

      {showCreate && <CreateChurchModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
