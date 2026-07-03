'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/atoms/Badge.atom';
import { SearchInput } from '@/components/atoms/SearchInput.atom';
import { Pagination } from '@/components/molecules/Pagination.molecule';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog.molecule';
import { QuoteUpdateModal } from '@/components/organisms/QuoteUpdateModal.organism';
import { updateQuoteAction } from '@/services/billing.actions';
import type { QuoteRow, QuoteStatus } from '@/types/internal.types';

const PAGE_SIZE = 15;
const idr = (n: number) => 'Rp' + new Intl.NumberFormat('id-ID').format(n);

const STATUS: Record<QuoteStatus, { label: string; variant: 'success' | 'warning' | 'danger' | 'secondary' | 'outline' }> = {
  pending: { label: 'Menunggu', variant: 'warning' },
  quoted: { label: 'Ditawarkan', variant: 'secondary' },
  accepted: { label: 'Diterima', variant: 'success' },
  rejected: { label: 'Ditolak', variant: 'danger' },
  obsolete: { label: 'Usang', variant: 'outline' },
  expired: { label: 'Kedaluwarsa', variant: 'outline' },
};

export function QuotesClient({ rows }: { rows: QuoteRow[] }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [page, setPage] = useState(1);
  const [quoteTarget, setQuoteTarget] = useState<QuoteRow | null>(null);
  const [confirm, setConfirm] = useState<{ quote: QuoteRow; to: 'accepted' | 'rejected' } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === 'open' && r.status !== 'pending' && r.status !== 'quoted') return false;
      if (q && !r.church_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function transition(quote: QuoteRow, to: 'accepted' | 'rejected') {
    setError(null);
    const res = await updateQuoteAction({ quoteId: quote.id, status: to });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setConfirm(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          placeholder="Cari gereja…"
          onSearch={(v) => { setSearch(v); setPage(1); }}
          containerClassName="w-full max-w-xs"
        />
        <select
          value={filter}
          onChange={(e) => { setFilter(e.target.value as 'open' | 'all'); setPage(1); }}
          className="rounded-lg border border-border-color bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-brand"
        >
          <option value="open">Terbuka (menunggu + ditawarkan)</option>
          <option value="all">Semua status</option>
        </select>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-border-color">
        <table className="w-full text-sm">
          <thead className="bg-bg-secondary text-left text-text-secondary">
            <tr>
              <th className="px-4 py-3 font-medium">Tanggal</th>
              <th className="px-4 py-3 font-medium">Gereja</th>
              <th className="px-4 py-3 font-medium">Anggota</th>
              <th className="px-4 py-3 font-medium">Harga</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-text-secondary">
                  Tidak ada penawaran.
                </td>
              </tr>
            ) : (
              pageRows.map((r) => (
                <tr key={r.id} className="border-t border-border-color align-top">
                  <td className="px-4 py-3 text-text-secondary">
                    {new Date(r.created_at).toLocaleDateString('id-ID')}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/churches/${r.church_id}`}
                      className="font-medium text-text-primary hover:text-brand"
                    >
                      {r.church_name}
                    </Link>
                    {r.notes && <div className="mt-0.5 text-xs text-text-secondary">{r.notes}</div>}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{r.member_count}</td>
                  <td className="px-4 py-3 text-text-primary">
                    {r.quoted_price_idr != null ? idr(r.quoted_price_idr) : '—'}
                    {r.expires_at && (
                      <div className="text-xs text-text-secondary">
                        s.d. {new Date(r.expires_at).toLocaleDateString('id-ID')}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    {(r.status === 'pending' || r.status === 'quoted') && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setQuoteTarget(r)}
                          className="rounded-lg bg-bg-hover px-3 py-1 text-xs text-text-primary hover:bg-bg-tertiary"
                        >
                          Beri Harga
                        </button>
                        {r.status === 'quoted' && (
                          <button
                            onClick={() => setConfirm({ quote: r, to: 'accepted' })}
                            className="rounded-lg bg-brand px-3 py-1 text-xs font-bold text-brand-content hover:bg-brand-hover"
                          >
                            Terima
                          </button>
                        )}
                        <button
                          onClick={() => setConfirm({ quote: r, to: 'rejected' })}
                          className="rounded-lg bg-bg-hover px-3 py-1 text-xs text-danger hover:bg-bg-tertiary"
                        >
                          Tolak
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      </div>

      {quoteTarget && (
        <QuoteUpdateModal quote={quoteTarget} onClose={() => setQuoteTarget(null)} />
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm.to === 'accepted' ? 'Terima Penawaran' : 'Tolak Penawaran'}
          message={
            confirm.to === 'accepted' ? (
              <>
                Terima penawaran {confirm.quote.church_name}
                {confirm.quote.quoted_price_idr != null &&
                  ` (${idr(confirm.quote.quoted_price_idr)})`}
                ? Langganan TIDAK berubah otomatis — terapkan paket custom lewat “Ubah Paket” di
                halaman gereja.
              </>
            ) : (
              <>Tolak penawaran {confirm.quote.church_name}?</>
            )
          }
          confirmLabel={confirm.to === 'accepted' ? 'Terima' : 'Tolak'}
          danger={confirm.to === 'rejected'}
          onConfirm={() => transition(confirm.quote, confirm.to)}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
