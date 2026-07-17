'use client';

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Badge } from '@/components/atoms/Badge.atom';
import { SearchInput } from '@/components/atoms/SearchInput.atom';
import { Pagination } from '@/components/molecules/Pagination.molecule';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog.molecule';
import { retryOutboxEmailAction } from '@/services/billing.actions';
import { PAGE_SIZE } from '@/libs/pagination';
import type { OutboxRow } from '@/types/internal.types';

interface Props {
  rows: OutboxRow[];
  total: number;
  page: number;
  search: string;
}

export function OutboxClient({ rows, total, page, search }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [retryTarget, setRetryTarget] = useState<OutboxRow | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  async function retry(row: OutboxRow) {
    setError(null);
    const res = await retryOutboxEmailAction({ outboxId: row.id });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setRetryTarget(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput
          placeholder="Cari email / subjek / gereja…"
          defaultValue={search}
          onSearch={(v) => setParams({ q: v })}
          containerClassName="w-full max-w-xs"
        />
        <span className="text-xs text-text-secondary">
          {total} email menunggu & gagal — dikirim oleh dispatcher billing
        </span>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className={`overflow-hidden rounded-xl border border-border-color ${isPending ? 'opacity-60 transition-opacity' : ''}`}>
        <table className="w-full text-sm">
          <thead className="bg-bg-secondary text-left text-text-secondary">
            <tr>
              <th className="px-4 py-3 font-medium">Dibuat</th>
              <th className="px-4 py-3 font-medium">Kepada</th>
              <th className="px-4 py-3 font-medium">Subjek</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Percobaan</th>
              <th className="px-4 py-3 font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-text-secondary">
                  Outbox kosong — semua email terkirim.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-border-color align-top">
                  <td className="px-4 py-3 text-text-secondary">
                    {new Date(r.created_at).toLocaleString('id-ID')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-text-primary">{r.to_email}</div>
                    {r.church_name && (
                      <div className="text-xs text-text-secondary">{r.church_name}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-primary">
                    {r.subject}
                    {r.last_error && (
                      <div className="mt-0.5 text-xs text-danger">{r.last_error}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={r.status === 'failed' ? 'danger' : 'warning'}>
                      {r.status === 'failed' ? 'Gagal' : 'Menunggu'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{r.attempts}</td>
                  <td className="px-4 py-3">
                    {r.status === 'failed' && (
                      <button
                        onClick={() => setRetryTarget(r)}
                        className="rounded-lg bg-bg-hover px-3 py-1 text-xs text-text-primary hover:bg-bg-tertiary"
                      >
                        Coba lagi
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={(p) => setParams({ page: p })} />
      </div>

      {retryTarget && (
        <ConfirmDialog
          title="Ulangi Pengiriman Email"
          message={
            <>
              Kirim ulang “{retryTarget.subject}” ke {retryTarget.to_email}? Status direset ke
              menunggu dan dispatcher akan mencoba lagi.
            </>
          }
          confirmLabel="Coba lagi"
          onConfirm={() => retry(retryTarget)}
          onClose={() => setRetryTarget(null)}
        />
      )}
    </div>
  );
}
