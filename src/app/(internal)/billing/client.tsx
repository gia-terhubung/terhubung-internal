'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/atoms/Badge.atom';
import { SearchInput } from '@/components/atoms/SearchInput.atom';
import { Pagination } from '@/components/molecules/Pagination.molecule';
import type { BillingStatus, ChurchBillingRow } from '@/types/internal.types';

const PAGE_SIZE = 15;
type Sort = 'name' | 'tier' | 'status' | 'period';

const STATUS: Record<BillingStatus, { label: string; variant: 'success' | 'warning' | 'danger' | 'secondary' }> = {
  active: { label: 'Aktif', variant: 'success' },
  grace: { label: 'Masa tenggang', variant: 'warning' },
  expired: { label: 'Kedaluwarsa', variant: 'danger' },
  none: { label: 'Tanpa langganan', variant: 'secondary' },
};

const selectCls =
  'rounded-lg border border-border-color bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-brand';

function periodMs(value: string): number {
  if (!value) return 0;
  if (value.startsWith('infinity')) return Number.POSITIVE_INFINITY;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function periodLabel(value: string): string {
  if (!value) return '—';
  if (value.startsWith('infinity')) return 'Selamanya';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('id-ID');
}

export function BillingClient({ rows }: { rows: ChurchBillingRow[] }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | BillingStatus>('all');
  const [sort, setSort] = useState<Sort>('name');
  const [page, setPage] = useState(1);

  const processed = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (status !== 'all' && r.status !== status) return false;
      if (q && !r.church_name.toLowerCase().includes(q) && !(r.city ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
    out.sort((a, b) => {
      if (sort === 'tier') return a.tier.localeCompare(b.tier);
      if (sort === 'status') return a.status.localeCompare(b.status);
      if (sort === 'period') return periodMs(a.current_period_end) - periodMs(b.current_period_end);
      return a.church_name.localeCompare(b.church_name);
    });
    return out;
  }, [rows, search, status, sort]);

  const totalPages = Math.max(1, Math.ceil(processed.length / PAGE_SIZE));
  const pageRows = processed.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Billing</h1>
        <p className="mt-1 text-sm text-text-secondary">Status langganan {rows.length} gereja</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          placeholder="Cari gereja…"
          onSearch={(v) => { setSearch(v); setPage(1); }}
          containerClassName="w-full max-w-xs"
        />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value as 'all' | BillingStatus); setPage(1); }}
          className={selectCls}
        >
          <option value="all">Semua status</option>
          <option value="active">Aktif</option>
          <option value="grace">Masa tenggang</option>
          <option value="expired">Kedaluwarsa</option>
          <option value="none">Tanpa langganan</option>
        </select>
        <select value={sort} onChange={(e) => { setSort(e.target.value as Sort); setPage(1); }} className={selectCls}>
          <option value="name">Urut: Gereja</option>
          <option value="tier">Urut: Tier</option>
          <option value="status">Urut: Status</option>
          <option value="period">Urut: Berakhir</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-border-color">
        <table className="w-full text-sm">
          <thead className="bg-bg-secondary text-left text-text-secondary">
            <tr>
              <th className="px-4 py-3 font-medium">No.</th>
              <th className="px-4 py-3 font-medium">Gereja</th>
              <th className="px-4 py-3 font-medium">Tier</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Berakhir</th>
              <th className="px-4 py-3 font-medium">Provider</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-text-secondary">Tidak ada data.</td>
              </tr>
            ) : (
              pageRows.map((r, i) => (
                <tr key={r.church_id} className="border-t border-border-color">
                  <td className="px-4 py-3 text-text-secondary">{(page - 1) * PAGE_SIZE + i + 1}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-text-primary">{r.church_name}</div>
                    {r.city && <div className="text-xs text-text-secondary">{r.city}</div>}
                  </td>
                  <td className="px-4 py-3 capitalize text-text-secondary">{r.tier}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{periodLabel(r.current_period_end)}</td>
                  <td className="px-4 py-3 text-text-secondary">{r.provider ?? '—'}</td>
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
