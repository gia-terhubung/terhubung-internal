'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog.molecule';
import { Badge } from '@/components/atoms/Badge.atom';
import { drawNextAction, freezePoolAction } from '@/services/campaignDraw.actions';
import { formatWib } from '@/libs/campaign';
import { formatCount, queueShortfalls } from '@/libs/campaignDraw';
import type { DrawConsoleState, DrawWinner } from '@/types/campaignDraw.types';

const KIND_LABEL = { grand: 'Hadiah utama', normal: 'Hadiah' } as const;

export function DrawConsoleClient({ state }: { state: DrawConsoleState }) {
  const router = useRouter();
  // Synchronous lock: state updates are async, so a fast double-click could
  // fire two draws before `busyPrize` re-renders. The server also serializes.
  const inFlight = useRef(false);
  const [busyPrize, setBusyPrize] = useState<string | null>(null);
  const [confirmFreeze, setConfirmFreeze] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [last, setLast] = useState<DrawWinner | null>(null);
  const [showMode, setShowMode] = useState(false);

  // Never cache quantities: everything below comes from the latest server read.
  const { campaign, pool, poolLeft, eligiblePreview, prizes, winners, top, topN, topFrozen } = state;
  const frozen = campaign.frozen_at !== null;
  const hasWinners = winners.length > 0;

  async function draw(prizeId: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusyPrize(prizeId);
    setError(null);
    setNotice(null);
    try {
      const res = await drawNextAction(campaign.id, prizeId);
      if (res.ok) {
        setLast(res.winner);
        router.refresh();
      } else {
        setError(res.error);
      }
    } catch {
      // Network drop or the 1-hour session cap redirect: the draw may already be committed.
      setError('Koneksi ke server gagal. Klik "Muat ulang" dan cek daftar pemenang sebelum mengundi lagi.');
    } finally {
      inFlight.current = false;
      setBusyPrize(null);
    }
  }

  async function freeze() {
    setError(null);
    try {
      const res = await freezePoolAction(campaign.id);
      if (res.ok) {
        setNotice(
          `Peserta dibekukan: ${formatCount(res.normal)} untuk hadiah reguler (termasuk tanpa aplikasi), ${formatCount(res.grand)} (${state.topN} besar) untuk hadiah utama.`
        );
        router.refresh();
      } else {
        setError(res.error);
      }
    } catch {
      setError('Koneksi ke server gagal. Klik "Muat ulang".');
    } finally {
      setConfirmFreeze(false);
    }
  }

  // Cumulative per type in queue order (two normal prizes share one pool).
  const queue: ReturnType<typeof queueShortfalls> = frozen ? queueShortfalls(prizes, poolLeft) : {};

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Undian live</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Undian dijalankan di server. Layar panggung hanya menampilkan hasil yang sudah tercatat.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => router.refresh()}
            className="rounded-lg bg-bg-hover px-3 py-2 text-sm text-text-primary hover:bg-bg-tertiary"
          >
            Muat ulang
          </button>
          <button
            onClick={() => setShowMode(true)}
            className="rounded-lg bg-bg-hover px-3 py-2 text-sm text-text-primary hover:bg-bg-tertiary"
          >
            Mode tayang
          </button>
          <Link
            href={`/campaigns/${campaign.id}/stage`}
            target="_blank"
            rel="noopener"
            className="rounded-lg bg-brand px-3 py-2 text-sm font-bold text-brand-content hover:bg-brand-hover"
          >
            Buka layar panggung
          </Link>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-lg border border-border-color bg-bg-secondary p-3 text-sm text-text-primary">
          {notice}
        </div>
      )}

      {/* Pool */}
      <section className="rounded-xl border border-border-color bg-bg-secondary p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="grid grid-cols-2 gap-8">
            <div>
              <div className="text-sm text-text-secondary">Peserta hadiah reguler</div>
              <div className="text-2xl font-bold text-text-primary">{formatCount(pool.normal)}</div>
              <div className="text-xs text-text-secondary">Jemaat terdaftar, termasuk tanpa aplikasi</div>
            </div>
            <div>
              <div className="text-sm text-text-secondary">Peserta hadiah utama ({topN} besar)</div>
              <div className="text-2xl font-bold text-text-primary">{formatCount(pool.grand)}</div>
              <div className="text-xs text-text-secondary">
                {topN} besar saat ini: {formatCount(eligiblePreview)}
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="mb-2 text-sm text-text-secondary">
              {frozen
                ? `Dibekukan ${formatWib(campaign.frozen_at!)}`
                : 'Belum dibekukan. Otomatis dibekukan saat campaign ditutup.'}
            </p>
            <button
              onClick={() => setConfirmFreeze(true)}
              disabled={hasWinners}
              title={hasWinners ? 'Pengundian sudah dimulai' : undefined}
              className="rounded-lg bg-bg-hover px-4 py-2 text-sm font-bold text-text-primary hover:bg-bg-tertiary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {frozen ? 'Bekukan ulang peserta' : 'Bekukan peserta'}
            </button>
          </div>
        </div>
        {frozen && !hasWinners && pool.grand !== eligiblePreview && (
          <p className="mt-3 text-xs text-text-secondary">
            Jumlah {topN} besar yang dibekukan berbeda dengan pratinjau saat ini. Wajar jika poin berubah setelah dibekukan;
            bekukan ulang bila ingin memakai data terbaru.
          </p>
        )}
      </section>

      {/* Last result */}
      {last && (
        <section className="rounded-xl border-2 border-brand bg-bg-secondary p-6 text-center">
          <div className="text-sm text-text-secondary">
            {KIND_LABEL[last.prize_type]}: {last.prize_name}
          </div>
          <div className="mt-1 text-4xl font-bold text-text-primary">{last.display_name}</div>
          <div className="text-lg text-text-secondary">{last.church_name}</div>
        </section>
      )}

      {/* Top N: fixed prize (not drawn); the grand prize is drawn from these names */}
      <section className="rounded-xl border border-border-color bg-bg-secondary">
        <h2 className="border-b border-border-color p-4 font-semibold text-text-primary">
          {topN} besar (hadiah tetap) {topFrozen ? <Badge variant="primary">Dibekukan</Badge> : <Badge variant="outline">Sementara</Badge>}
        </h2>
        <p className="border-b border-border-color px-4 py-2 text-xs text-text-secondary">
          Tidak diundi: semuanya dapat hadiah tetap. Hadiah utama diundi dari daftar ini.
        </p>
        <ol className="grid grid-cols-1 divide-y divide-border-color md:grid-cols-2 md:divide-y-0">
          {top.map((t) => (
            <li key={t.rank} className="flex items-center gap-3 p-3">
              <span className="w-8 font-bold text-text-primary">#{t.rank}</span>
              <span className="flex-1">
                <span className="block font-medium text-text-primary">{t.display_name}</span>
                <span className="block text-xs text-text-secondary">{t.full_name} · {t.church_name ?? '—'}</span>
              </span>
              <span className="text-sm text-text-secondary">{formatCount(t.points)} poin</span>
            </li>
          ))}
          {top.length === 0 && <li className="p-4 text-sm text-text-secondary">Belum ada peserta dengan poin.</li>}
        </ol>
      </section>

      {/* Prize queue: normal first, then grand. 'top' prizes are never queued. */}
      <section className="rounded-xl border border-border-color bg-bg-secondary">
        <h2 className="border-b border-border-color p-4 font-semibold text-text-primary">Urutan undian</h2>
        <p className="border-b border-border-color px-4 py-2 text-xs text-text-secondary">
          Belum menang: {formatCount(poolLeft.normal)} peserta hadiah reguler, {formatCount(poolLeft.grand)} dari {topN} besar untuk hadiah utama.
          Jumlah hadiah diambil ulang setiap selesai mengundi; klik &quot;Muat ulang&quot; setelah mengubah jumlah hadiah.
        </p>
        <ul>
          {prizes.map((p) => {
            const remaining = Math.max(0, p.quantity - p.drawn);
            const { shortfall, left } = queue[p.id] ?? { shortfall: 0, left: poolLeft[p.prize_type] };
            const disabled = !frozen || remaining <= 0 || busyPrize !== null;
            return (
              <li key={p.id} className="flex items-center justify-between gap-4 border-b border-border-color p-4 last:border-b-0">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant={p.prize_type === 'grand' ? 'primary' : 'secondary'}>{KIND_LABEL[p.prize_type]}</Badge>
                  <span className="font-medium text-text-primary">{p.name}</span>
                  <span className="text-sm text-text-secondary">
                    {p.drawn}/{p.quantity} diundi
                  </span>
                  {shortfall > 0 && (
                    <span role="note" className="w-full text-xs text-amber-600">
                      Sisa {remaining} hadiah, tetapi peserta {KIND_LABEL[p.prize_type].toLowerCase()} yang belum menang
                      tinggal {formatCount(left)}. {shortfall} unit tidak akan bisa diundi.
                    </span>
                  )}
                </div>
                <button
                  onClick={() => draw(p.id)}
                  disabled={disabled}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-brand-content hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busyPrize === p.id ? 'Mengundi…' : remaining <= 0 ? 'Selesai' : 'Undi berikutnya'}
                </button>
              </li>
            );
          })}
          {prizes.length === 0 && (
            <li className="p-4 text-sm text-text-secondary">Belum ada hadiah. Tambahkan hadiah di halaman campaign.</li>
          )}
        </ul>
      </section>

      {/* Winners */}
      <section className="rounded-xl border border-border-color bg-bg-secondary">
        <h2 className="border-b border-border-color p-4 font-semibold text-text-primary">
          Pemenang ({winners.length})
        </h2>
        <ol className="divide-y divide-border-color">
          {winners.map((w, i) => (
            <li key={w.id} className="flex items-center justify-between gap-4 p-4">
              <span className="text-text-secondary">{i + 1}.</span>
              <span className="flex-1 font-medium text-text-primary">{w.display_name}</span>
              <span className="flex-1 text-text-secondary">{w.church_name}</span>
              <span className="flex-1 text-sm text-text-secondary">{w.prize_name}</span>
            </li>
          ))}
          {winners.length === 0 && <li className="p-4 text-sm text-text-secondary">Belum ada pemenang.</li>}
        </ol>
      </section>

      {confirmFreeze && (
        <ConfirmDialog
          title={frozen ? 'Bekukan ulang peserta?' : 'Bekukan peserta?'}
          message={
            frozen
              ? 'Daftar peserta saat ini akan ditimpa dengan data terbaru.'
              : 'Daftar peserta hadiah dan hadiah utama diambil sekarang. Poin setelah ini tidak lagi dihitung untuk undian.'
          }
          confirmLabel="Bekukan"
          onConfirm={freeze}
          onClose={() => setConfirmFreeze(false)}
        />
      )}

      {/* Fallback: screen-share this if the stage display fails */}
      {showMode && (
        <div className="fixed inset-0 z-50 overflow-auto bg-bg-primary p-10">
          <div className="mb-8 flex items-center justify-between">
            <h2 className="text-4xl font-bold text-text-primary">Pemenang</h2>
            <button
              onClick={() => setShowMode(false)}
              className="rounded-lg bg-bg-hover px-4 py-2 text-text-primary hover:bg-bg-tertiary"
            >
              Tutup
            </button>
          </div>
          <ol className="space-y-5">
            {[...winners].reverse().map((w) => (
              <li key={w.id}>
                <div className="text-5xl font-bold text-text-primary">{w.display_name}</div>
                <div className="text-2xl text-text-secondary">
                  {w.church_name}, {w.prize_name}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
