'use client';

import { Badge } from '@/components/atoms/Badge.atom';
import { downloadCsv, formatWib } from '@/libs/campaign';
import type { AdminTopRow, AdminWinnerRow, CampaignRow } from '@/types/campaign.types';

const exportBtn = 'rounded-lg bg-bg-hover px-4 py-2 text-sm text-text-primary hover:bg-bg-tertiary disabled:opacity-50';

export function WinnersClient({
  campaign, winners, top,
}: {
  campaign: CampaignRow; winners: AdminWinnerRow[]; top: AdminTopRow[];
}) {
  const slug = campaign.name.replace(/[^\w-]+/g, '-').toLowerCase();
  const topN = campaign.rules.grand_top_n;
  const topFrozen = top[0]?.frozen ?? false;

  function exportCsv() {
    downloadCsv(`pemenang-${slug}.csv`, [
      ['Hadiah', 'Jenis', 'Nama lengkap', 'Nama di layar', 'Gereja', 'Telepon', 'Aplikasi', 'Waktu undian (WIB)'],
      ...winners.map((w) => [
        w.prize_name, w.prize_type === 'grand' ? 'Utama' : 'Reguler', w.full_name, w.display_name, w.church_name, w.phone,
        w.has_app ? 'Ya' : 'Tidak', formatWib(w.drawn_at),
      ]),
    ]);
  }

  function exportTopCsv() {
    downloadCsv(`${topN}-besar-${slug}.csv`, [
      ['Peringkat', 'Nama lengkap', 'Nama di layar', 'Gereja', 'Poin', 'Telepon', 'Status'],
      ...top.map((t) => [t.rank, t.full_name, t.display_name, t.church_name, t.points, t.phone, t.frozen ? 'Dibekukan' : 'Sementara']),
    ]);
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-text-secondary">
        Hadiah diterima langsung di lokasi acara. Hubungi pemenang yang tidak hadir lewat nomor telepon di bawah. Pemenang
        bertanda &quot;Tanpa aplikasi&quot; tidak menerima notifikasi, jadi hubungi lewat telepon.
      </p>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-text-primary">Hadiah tetap ({topN} besar)</h2>
            <p className="text-sm text-text-secondary">
              {topFrozen ? 'Daftar dibekukan saat campaign ditutup.' : 'Daftar sementara, masih berubah sampai peserta dibekukan.'}{' '}
              Tidak diundi; diserahkan di lokasi acara.
            </p>
          </div>
          <button onClick={exportTopCsv} disabled={top.length === 0} className={exportBtn}>
            Ekspor CSV {topN} besar
          </button>
        </div>
        <div className="overflow-hidden rounded-xl border border-border-color">
          <table className="w-full text-sm">
            <thead className="bg-bg-secondary text-left text-text-secondary">
              <tr>
                <th className="px-4 py-3 font-medium">Peringkat</th>
                <th className="px-4 py-3 font-medium">Nama</th>
                <th className="px-4 py-3 font-medium">Gereja</th>
                <th className="px-4 py-3 font-medium">Poin</th>
                <th className="px-4 py-3 font-medium">Telepon</th>
              </tr>
            </thead>
            <tbody>
              {top.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-text-secondary">Belum ada peserta dengan poin.</td></tr>
              )}
              {top.map((t) => (
                <tr key={t.user_id} className="border-t border-border-color">
                  <td className="px-4 py-3 font-semibold">#{t.rank}</td>
                  <td className="px-4 py-3">
                    <div className="text-text-primary">{t.full_name}</div>
                    <div className="text-xs text-text-secondary">di layar: {t.display_name}</div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{t.church_name ?? '—'}</td>
                  <td className="px-4 py-3">{t.points}</td>
                  <td className="px-4 py-3 text-text-secondary">{t.phone ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-text-primary">Pemenang undian</h2>
          <button onClick={exportCsv} disabled={winners.length === 0} className={exportBtn}>Ekspor CSV</button>
        </div>
        <div className="overflow-hidden rounded-xl border border-border-color">
          <table className="w-full text-sm">
            <thead className="bg-bg-secondary text-left text-text-secondary">
              <tr>
                <th className="px-4 py-3 font-medium">Hadiah</th>
                <th className="px-4 py-3 font-medium">Pemenang</th>
                <th className="px-4 py-3 font-medium">Gereja</th>
                <th className="px-4 py-3 font-medium">Telepon</th>
                <th className="px-4 py-3 font-medium">Waktu</th>
              </tr>
            </thead>
            <tbody>
              {winners.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-text-secondary">Belum ada pemenang. Pengundian dilakukan dari konsol undian.</td></tr>
              )}
              {winners.map((w) => (
                <tr key={w.id} className="border-t border-border-color">
                  <td className="px-4 py-3">
                    <div className="text-text-primary">{w.prize_name}</div>
                    <Badge variant={w.prize_type === 'grand' ? 'primary' : 'secondary'}>{w.prize_type === 'grand' ? 'Utama' : 'Reguler'}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-text-primary">
                      {w.full_name} {!w.has_app && <Badge variant="outline">Tanpa aplikasi</Badge>}
                    </div>
                    <div className="text-xs text-text-secondary">di layar: {w.display_name}</div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{w.church_name}</td>
                  <td className="px-4 py-3 text-text-secondary">{w.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-text-secondary">{formatWib(w.drawn_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
