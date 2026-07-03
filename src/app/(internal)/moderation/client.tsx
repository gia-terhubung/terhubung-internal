'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/atoms/Badge.atom';
import { SearchInput } from '@/components/atoms/SearchInput.atom';
import { Pagination } from '@/components/molecules/Pagination.molecule';
import { ModerationDetailModal } from '@/components/organisms/ModerationDetailModal.organism';
import type { ModerationGroup } from '@/types/moderation.types';

const PAGE_SIZE = 15;
type StatusFilter = 'open' | 'resolved' | 'all';
type KindFilter = 'all' | 'prayer' | 'comment';

const selectCls =
  'rounded-lg border border-border-color bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-brand';

export function snippet(g: ModerationGroup): string {
  if (g.target.content == null && g.target.kind === 'comment') return '(Amin)';
  const text = g.target.content ?? '';
  return text.length > 120 ? text.slice(0, 120) + '…' : text;
}

export function ModerationClient({ groups }: { groups: ModerationGroup[] }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('open');
  const [kind, setKind] = useState<KindFilter>('all');
  const [page, setPage] = useState(1);
  const [detailKey, setDetailKey] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups.filter((g) => {
      if (status === 'open' && g.open_count === 0) return false;
      if (status === 'resolved' && g.open_count > 0) return false;
      if (kind !== 'all' && g.target.kind !== kind) return false;
      if (
        q &&
        !(g.target.content ?? '').toLowerCase().includes(q) &&
        !(g.target.author_name ?? '').toLowerCase().includes(q) &&
        !(g.target.church_name ?? '').toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [groups, search, status, kind]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const detail = detailKey ? (groups.find((g) => g.key === detailKey) ?? null) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          placeholder="Cari konten / penulis / gereja…"
          onSearch={(v) => { setSearch(v); setPage(1); }}
          containerClassName="w-full max-w-xs"
        />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value as StatusFilter); setPage(1); }}
          className={selectCls}
        >
          <option value="open">Terbuka</option>
          <option value="resolved">Selesai</option>
          <option value="all">Semua</option>
        </select>
        <select
          value={kind}
          onChange={(e) => { setKind(e.target.value as KindFilter); setPage(1); }}
          className={selectCls}
        >
          <option value="all">Doa & komentar</option>
          <option value="prayer">Doa</option>
          <option value="comment">Komentar</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-border-color">
        <table className="w-full text-sm">
          <thead className="bg-bg-secondary text-left text-text-secondary">
            <tr>
              <th className="px-4 py-3 font-medium">Jenis</th>
              <th className="px-4 py-3 font-medium">Konten</th>
              <th className="px-4 py-3 font-medium">Penulis</th>
              <th className="px-4 py-3 font-medium">Gereja</th>
              <th className="px-4 py-3 font-medium">Laporan</th>
              <th className="px-4 py-3 font-medium">Terbaru</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-text-secondary">
                  {status === 'open' ? 'Tidak ada laporan terbuka. 🎉' : 'Tidak ada laporan.'}
                </td>
              </tr>
            ) : (
              pageRows.map((g) => (
                <tr
                  key={g.key}
                  onClick={() => setDetailKey(g.key)}
                  className="cursor-pointer border-t border-border-color transition-colors hover:bg-bg-secondary"
                >
                  <td className="px-4 py-3">
                    <Badge variant="outline">{g.target.kind === 'prayer' ? 'Doa' : 'Komentar'}</Badge>
                  </td>
                  <td className="max-w-sm px-4 py-3">
                    <span
                      className={`text-text-primary ${g.target.content == null && g.target.kind === 'comment' ? 'italic text-text-secondary' : ''} ${g.target.deleted_at ? 'line-through opacity-60' : ''}`}
                    >
                      {snippet(g)}
                    </span>
                    {g.target.deleted_at && (
                      <span className="ml-2 inline-block"><Badge variant="secondary">Sudah dihapus</Badge></span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-text-primary">{g.target.author_name ?? '—'}</span>
                    {g.target.anonymous && (
                      <span className="ml-1.5 inline-block"><Badge variant="outline">Anonim</Badge></span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{g.target.church_name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Badge variant={g.open_count > 0 ? 'danger' : 'secondary'}>
                      {g.reports.length}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {new Date(g.latest_report_at).toLocaleDateString('id-ID')}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={g.open_count > 0 ? 'warning' : 'success'}>
                      {g.open_count > 0 ? `${g.open_count} terbuka` : 'Selesai'}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      </div>

      {detail && <ModerationDetailModal group={detail} onClose={() => setDetailKey(null)} />}
    </div>
  );
}
