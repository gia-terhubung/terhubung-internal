'use client';

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Badge } from '@/components/atoms/Badge.atom';
import { SearchInput } from '@/components/atoms/SearchInput.atom';
import { Pagination } from '@/components/molecules/Pagination.molecule';
import { AdjustPointsModal } from '@/components/organisms/AdjustPointsModal.organism';
import { DrawExclusionsPanel } from '@/components/organisms/DrawExclusionsPanel.organism';
import { PAGE_SIZE } from '@/libs/pagination';
import type { ChurchOption, DrawExclusionRow, MonitorData, ParticipantRow } from '@/types/campaign.types';

export function MonitorClient({
  campaignId, churches, data, church, search, topN, frozen, exclusions,
}: {
  campaignId: string; churches: ChurchOption[]; data: MonitorData; church: string; search: string; topN: number; frozen: boolean; exclusions: DrawExclusionRow[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [adjusting, setAdjusting] = useState<ParticipantRow | null>(null);

  function setParams(next: Partial<{ church: string; q: string; page: number }>) {
    const sp = new URLSearchParams();
    const c = next.church ?? church;
    const q = next.q ?? search;
    const p = next.page ?? 1;
    if (c) sp.set('church', c);
    if (q) sp.set('q', q);
    if (p > 1) sp.set('page', String(p));
    const qs = sp.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  const totals = data.stats.reduce(
    (t, s) => ({ members: t.members + s.members, consented: t.consented + s.consented, participants: t.participants + s.participants, today: t.today + s.checkins_today }),
    { members: 0, consented: 0, participants: 0, today: 0 }
  );

  return (
    <div className="space-y-6">
      {data.grandQuantity > data.top.length && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-text-primary">
          Hadiah utama diundi dari {topN} besar. Jumlah hadiah utama ({data.grandQuantity}) lebih banyak dari peserta {topN} besar
          saat ini ({data.top.length}); sisa hadiah tidak bisa diundi. Kurangi jumlah hadiah utama sebelum undian.
        </div>
      )}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {[
          ['Jemaat terdaftar (pengguna aplikasi)', totals.members],
          ['Sudah setuju aturan', totals.consented],
          ['Punya poin (minimal 1)', totals.participants],
          ['Check-in hari ini', totals.today],
          [`${topN} besar saat ini`, data.top.length],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-xl border border-border-color bg-bg-secondary p-4">
            <div className="text-sm text-text-secondary">{label}</div>
            <div className="mt-1 text-2xl font-bold text-text-primary">{value}</div>
          </div>
        ))}
      </div>
      <p className="text-xs text-text-secondary">
        Undian hadiah reguler memakai semua jemaat terdaftar (termasuk tanpa aplikasi); jumlah pastinya muncul di konsol undian
        setelah peserta dibekukan. {topN} besar dan hadiah utama hanya untuk pengguna aplikasi.
      </p>

      <section className="overflow-hidden rounded-xl border border-border-color bg-bg-secondary">
        <div className="flex items-center justify-between border-b border-border-color p-4">
          <div>
            <h2 className="font-semibold text-text-primary">{topN} besar semua gereja</h2>
            <p className="text-xs text-text-secondary">Menampilkan poin terkini, juga setelah dibekukan.</p>
          </div>
          <Badge variant={frozen ? 'primary' : 'outline'}>{frozen ? 'Dibekukan' : 'Sementara'}</Badge>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-text-secondary">
            <tr>
              <th className="px-4 py-3 font-medium">Peringkat</th>
              <th className="px-4 py-3 font-medium">Nama</th>
              <th className="px-4 py-3 font-medium">Gereja</th>
              <th className="px-4 py-3 font-medium">Poin</th>
              <th className="px-4 py-3 font-medium">Telepon</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.top.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-text-secondary">Belum ada peserta dengan poin.</td></tr>
            )}
            {data.top.map((t) => (
              <tr key={t.user_id} className="border-t border-border-color">
                <td className="px-4 py-3 font-semibold">#{t.rank}</td>
                <td className="px-4 py-3">
                  <div className="text-text-primary">{t.full_name}</div>
                  <div className="text-xs text-text-secondary">di layar: {t.display_name}</div>
                </td>
                <td className="px-4 py-3 text-text-secondary">{t.church_name ?? '—'}</td>
                <td className="px-4 py-3">{t.points}</td>
                <td className="px-4 py-3 text-text-secondary">{t.phone ?? '—'}</td>
                <td className="px-4 py-3 text-text-secondary">{t.frozen ? 'Dibekukan' : 'Sementara'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <DrawExclusionsPanel campaignId={campaignId} exclusions={exclusions} frozen={frozen} />

      <div className="overflow-hidden rounded-xl border border-border-color">
        <table className="w-full text-sm">
          <thead className="bg-bg-secondary text-left text-text-secondary">
            <tr>
              <th className="px-4 py-3 font-medium">Gereja</th>
              <th className="px-4 py-3 font-medium">Jemaat</th>
              <th className="px-4 py-3 font-medium">Setuju aturan</th>
              <th className="px-4 py-3 font-medium">Punya poin (minimal 1)</th>
              <th className="px-4 py-3 font-medium">Check-in hari ini</th>
              <th className="px-4 py-3 font-medium">Masuk {topN} besar</th>
            </tr>
          </thead>
          <tbody>
            {data.stats.map((s) => (
              <tr key={s.church_id} className="border-t border-border-color">
                <td className="px-4 py-3 text-text-primary">{s.church_name}</td>
                <td className="px-4 py-3">{s.members}</td>
                <td className="px-4 py-3">{s.consented}</td>
                <td className="px-4 py-3">{s.participants}</td>
                <td className="px-4 py-3">{s.checkins_today}</td>
                <td className="px-4 py-3">{s.grand_eligible}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput placeholder="Cari nama peserta…" defaultValue={search} onSearch={(v) => setParams({ q: v })} containerClassName="w-full max-w-xs" />
        <select value={church} onChange={(e) => setParams({ church: e.target.value })}
          className="rounded-lg border border-border-color bg-bg-primary px-3 py-2 text-sm text-text-primary">
          <option value="">Semua gereja</option>
          {churches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className={`overflow-hidden rounded-xl border border-border-color ${isPending ? 'opacity-60 transition-opacity' : ''}`}>
        <table className="w-full text-sm">
          <thead className="bg-bg-secondary text-left text-text-secondary">
            <tr>
              <th className="px-4 py-3 font-medium">Peserta</th>
              <th className="px-4 py-3 font-medium">Poin</th>
              <th className="px-4 py-3 font-medium">Peringkat</th>
              <th className="px-4 py-3 font-medium">Peringkat gereja</th>
              <th className="px-4 py-3 font-medium">Check-in</th>
              <th className="px-4 py-3 font-medium">Kuis selesai</th>
              <th className="px-4 py-3 font-medium">Doa / komentar</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {data.participants.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-text-secondary">Belum ada peserta dengan poin.</td></tr>
            )}
            {data.participants.map((p) => (
              <tr key={p.user_id} className="border-t border-border-color">
                <td className="px-4 py-3">
                  <div className="text-text-primary">{p.full_name}</div>
                  <div className="text-xs text-text-secondary">{p.church_name}</div>
                </td>
                <td className="px-4 py-3 font-semibold">{p.points}</td>
                <td className="px-4 py-3">#{p.overall_rank} {p.eligible && <Badge variant="success">{topN} besar</Badge>}</td>
                <td className="px-4 py-3 text-text-secondary">#{p.church_rank}</td>
                <td className="px-4 py-3">{p.checkins}</td>
                <td className="px-4 py-3">{p.weekly_done}</td>
                <td className="px-4 py-3">{p.prayers} / {p.comments}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => setAdjusting(p)} className="text-sm text-text-secondary hover:text-text-primary">Atur poin</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination currentPage={data.page} totalPages={Math.max(1, Math.ceil(data.total / PAGE_SIZE))} onPageChange={(p) => setParams({ page: p })} />
      </div>

      {adjusting && <AdjustPointsModal campaignId={campaignId} participant={adjusting} onClose={() => setAdjusting(null)} />}
    </div>
  );
}
