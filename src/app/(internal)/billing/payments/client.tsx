'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/atoms/Badge.atom';
import { SearchInput } from '@/components/atoms/SearchInput.atom';
import { Pagination } from '@/components/molecules/Pagination.molecule';
import type { PaymentAuditRow } from '@/types/internal.types';

const PAGE_SIZE = 15;
const idr = (n: number) => 'Rp' + new Intl.NumberFormat('id-ID').format(n);

function statusVariant(status: string): 'success' | 'warning' | 'danger' | 'secondary' {
  if (status === 'succeeded') return 'success';
  if (status === 'pending') return 'warning';
  if (status === 'failed') return 'danger';
  return 'secondary';
}

export function PaymentsClient({ rows }: { rows: PaymentAuditRow[] }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.church_name.toLowerCase().includes(q) ||
        (r.provider_payment_id ?? '').toLowerCase().includes(q) ||
        r.provider.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput
          placeholder="Cari gereja / referensi…"
          onSearch={(v) => { setSearch(v); setPage(1); }}
          containerClassName="w-full max-w-xs"
        />
        <span className="text-xs text-text-secondary">50 pembayaran terakhir</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-border-color">
        <table className="w-full text-sm">
          <thead className="bg-bg-secondary text-left text-text-secondary">
            <tr>
              <th className="px-4 py-3 font-medium">Tanggal</th>
              <th className="px-4 py-3 font-medium">Gereja</th>
              <th className="px-4 py-3 font-medium">Jumlah</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Provider</th>
              <th className="px-4 py-3 font-medium">Referensi</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-text-secondary">
                  Belum ada pembayaran.
                </td>
              </tr>
            ) : (
              pageRows.map((r) => (
                <tr key={r.id} className="border-t border-border-color">
                  <td className="px-4 py-3 text-text-secondary">
                    {new Date(r.created_at).toLocaleString('id-ID')}
                  </td>
                  <td className="px-4 py-3 font-medium text-text-primary">{r.church_name}</td>
                  <td className="px-4 py-3 text-text-primary">
                    {idr(r.amount_idr)}
                    {r.currency !== 'IDR' && (
                      <span className="ml-1 text-xs text-text-secondary">{r.currency}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{r.provider}</td>
                  <td className="px-4 py-3 text-text-secondary">{r.provider_payment_id ?? '—'}</td>
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
