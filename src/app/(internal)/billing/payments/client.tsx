'use client';

import { useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Badge } from '@/components/atoms/Badge.atom';
import { SearchInput } from '@/components/atoms/SearchInput.atom';
import { Pagination } from '@/components/molecules/Pagination.molecule';
import { PAGE_SIZE } from '@/libs/pagination';
import type { PaymentAuditRow } from '@/types/internal.types';

const idr = (n: number) => 'Rp' + new Intl.NumberFormat('id-ID').format(n);

function statusVariant(status: string): 'success' | 'warning' | 'danger' | 'secondary' {
  if (status === 'succeeded') return 'success';
  if (status === 'pending') return 'warning';
  if (status === 'failed') return 'danger';
  return 'secondary';
}

interface Props {
  rows: PaymentAuditRow[];
  total: number;
  page: number;
  search: string;
}

export function PaymentsClient({ rows, total, page, search }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  // All list state lives in the URL; changing q resets to page 1.
  function setParams(next: { q?: string; page?: number }) {
    const sp = new URLSearchParams();
    const q = next.q ?? search;
    const p = next.page ?? 1;
    if (q) sp.set('q', q);
    if (p > 1) sp.set('page', String(p));
    const qs = sp.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput
          placeholder="Cari gereja / referensi…"
          defaultValue={search}
          onSearch={(v) => setParams({ q: v })}
          containerClassName="w-full max-w-xs"
        />
        <span className="text-xs text-text-secondary">{total} pembayaran</span>
      </div>

      <div className={`overflow-hidden rounded-xl border border-border-color ${isPending ? 'opacity-60 transition-opacity' : ''}`}>
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
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-text-secondary">
                  Belum ada pembayaran.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
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
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={(p) => setParams({ page: p })} />
      </div>
    </div>
  );
}
