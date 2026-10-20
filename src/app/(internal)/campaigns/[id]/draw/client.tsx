'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog.molecule';
import { Badge } from '@/components/atoms/Badge.atom';
import { drawNextAction, freezePoolAction, redrawWinnerAction } from '@/services/campaignDraw.actions';
import { formatWib, isPrePublish, rpcErrorMessage } from '@/libs/campaign';
import { drawAllUnits, formatCount, queueShortfalls, runDrawAll } from '@/libs/campaignDraw';
import type { DrawAllReport, DrawConsoleState, DrawWinner } from '@/types/campaignDraw.types';

const KIND_LABEL = { grand: 'Hadiah utama', normal: 'Hadiah' } as const;
const CONNECTION_ERROR = 'Koneksi ke server gagal. Klik "Muat ulang" dan cek daftar pemenang sebelum mengundi lagi.';
const POOL_EMPTY = rpcErrorMessage('pool_empty');

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
  // Announce mode
  const [confirmDrawAll, setConfirmDrawAll] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [report, setReport] = useState<DrawAllReport | null>(null);
  const [redrawTarget, setRedrawTarget] = useState<DrawWinner | null>(null);
  // Lazy init + a slow tick: Date.now() is impure during render (react-hooks/purity).
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Never cache quantities: everything below comes from the latest server read.
  const { campaign, pool, poolLeft, eligiblePreview, prizes, winners, top, topN, topFrozen } = state;
  const frozen = campaign.frozen_at !== null;
  const hasWinners = winners.length > 0;
  const announce = campaign.draw_mode === 'announce';
  const prePublish = isPrePublish(campaign, nowMs);
  const units = drawAllUnits(prizes);
  const prizeName = new Map(prizes.map((p) => [p.id, p.name]));

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
      setError(CONNECTION_ERROR);
    } finally {
      inFlight.current = false;
      setBusyPrize(null);
    }
  }

  // "Undi semua": one drawNextAction (one RPC) per unit, so no single server call grows with the prize count.
  async function drawAll() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusyPrize('all');
    setError(null);
    setNotice(null);
    setReport(null);
    setConfirmDrawAll(false);
    const total = units.length;
    setProgress({ done: 0, total });
    try {
      const res = await runDrawAll(
        units,
        async (id) => {
          try {
            return await drawNextAction(campaign.id, id);
          } catch {
            return { ok: false, error: CONNECTION_ERROR };
          }
        },
        (e) => e === POOL_EMPTY,
        (done) => setProgress({ done, total })
      );
      setReport(res);
      if (res.error) setError(res.error);
    } finally {
      inFlight.current = false;
      setBusyPrize(null);
      setProgress(null);
      router.refresh();
    }
  }

  async function redraw(winner: DrawWinner, reasonKind: 'unreachable' | 'ineligible', note: string) {
    setError(null);
    setNotice(null);
    try {
      const res = await redrawWinnerAction(campaign.id, winner.id, reasonKind, note);
      if (res.ok) {
        setNotice(
          `Diganti: ${res.replaced}.` +
            (res.poolEmpty > 0 ? ` ${res.poolEmpty} hadiah belum terisi: ${POOL_EMPTY}` : '')
        );
        router.refresh();
      } else {
        setError(res.error);
      }
    } catch {
      setError(CONNECTION_ERROR);
    } finally {
      setRedrawTarget(null);
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
          <h2 className="text-lg font-semibold text-text-primary">{announce ? 'Undian' : 'Undian live'}</h2>
          <p className="mt-1 text-sm text-text-secondary">
            {announce
              ? 'Undian dijalankan di server. Pemenang tampil di aplikasi pada waktu pengumuman.'
              : 'Undian dijalankan di server. Layar panggung hanya menampilkan hasil yang sudah tercatat.'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => router.refresh()}
            className="rounded-lg bg-bg-hover px-3 py-2 text-sm text-text-primary hover:bg-bg-tertiary"
          >
            Muat ulang
          </button>
          {/* Announce mode: no stage. The stage route stays reachable by URL (admin-only). */}
          {!announce && (
            <>
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
            </>
          )}
        </div>
      </div>

      {announce && (
        <div role="status" className="rounded-lg border border-border-color bg-bg-secondary p-3 text-sm font-medium text-text-primary">
          {prePublish ? `Belum diumumkan · tampil di aplikasi ${formatWib(campaign.draw_at)}` : 'Sudah diumumkan'}
        </div>
      )}

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
            Jumlah berbeda dari pratinjau saat ini — wajar jika ada pengecualian undian atau poin berubah setelah dibekukan.
            Jangan bekukan ulang setelah mulai mengundi.
          </p>
        )}
      </section>

      {progress && (
        <div role="status" className="rounded-lg border border-border-color bg-bg-secondary p-3 text-sm text-text-primary">
          Mengundi… {progress.done} / {progress.total}
        </div>
      )}
      {report && (
        <section className="rounded-xl border border-border-color bg-bg-secondary p-4">
          <h3 className="font-semibold text-text-primary">Hasil undi semua: {formatCount(report.drawn)} pemenang</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {report.perPrize.map((r) => (
              <li key={r.prize_id} className="text-text-secondary">
                <span className="text-text-primary">{prizeName.get(r.prize_id) ?? 'Hadiah'}</span>: {r.drawn} diundi
                {r.stopped === 'pool_empty' && <span className="text-amber-600"> · {POOL_EMPTY}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

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
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-color p-4">
          <h2 className="font-semibold text-text-primary">Urutan undian</h2>
          {announce && (
            <button
              onClick={() => setConfirmDrawAll(true)}
              disabled={!frozen || units.length === 0 || busyPrize !== null}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-brand-content hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busyPrize === 'all' ? 'Mengundi…' : 'Undi semua'}
            </button>
          )}
        </div>
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
              {announce && prePublish && (
                <button
                  onClick={() => setRedrawTarget(w)}
                  disabled={busyPrize !== null}
                  className="rounded-lg bg-bg-hover px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Undi ulang
                </button>
              )}
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

      {confirmDrawAll && (
        <ConfirmDialog
          title="Undi semua hadiah?"
          message={`${formatCount(units.length)} hadiah yang tersisa diundi sekarang, satu per satu. Jangan tutup halaman ini sampai selesai.`}
          confirmLabel="Undi semua"
          onConfirm={drawAll}
          onClose={() => setConfirmDrawAll(false)}
        />
      )}

      {redrawTarget && (
        <RedrawDialog
          winner={redrawTarget}
          onConfirm={(kind, note) => redraw(redrawTarget, kind, note)}
          onClose={() => setRedrawTarget(null)}
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

// ConfirmDialog-style modal with a reason and a required note (ConfirmDialog has no form fields).
function RedrawDialog({
  winner,
  onConfirm,
  onClose,
}: {
  winner: DrawWinner;
  onConfirm: (kind: 'unreachable' | 'ineligible', note: string) => Promise<void>;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<'unreachable' | 'ineligible'>('unreachable');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm(kind, note.trim());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex w-full max-w-sm flex-col rounded-xl border border-border-color bg-bg-secondary shadow-2xl">
        <div className="border-b border-border-color p-5">
          <h2 className="text-lg font-bold text-text-primary">Undi ulang?</h2>
        </div>
        <div className="space-y-3 p-5 text-sm text-text-secondary">
          <p>
            {winner.display_name} ({winner.church_name}) · {winner.prize_name}
          </p>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="redraw-reason"
              checked={kind === 'unreachable'}
              onChange={() => setKind('unreachable')}
              className="mt-1"
            />
            <span className="text-text-primary">Tidak bisa dihubungi</span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="redraw-reason"
              checked={kind === 'ineligible'}
              onChange={() => setKind('ineligible')}
              className="mt-1"
            />
            <span>
              <span className="block text-text-primary">Tidak memenuhi syarat</span>
              <span className="block text-xs">
                Dikeluarkan dari semua undian campaign ini, termasuk hadiah lain yang sudah dimenangkan.
              </span>
            </span>
          </label>
          <label className="block">
            <span className="mb-1 block text-text-primary">Catatan (wajib)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-border-color bg-bg-primary p-2 text-text-primary"
            />
          </label>
        </div>
        <div className="flex justify-end gap-3 border-t border-border-color p-5">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary disabled:opacity-50"
          >
            Batal
          </button>
          <button
            onClick={confirm}
            disabled={busy || note.trim() === ''}
            className="rounded-lg bg-brand px-5 py-2 text-sm font-bold text-brand-content hover:bg-brand-hover disabled:opacity-50"
          >
            {busy ? 'Memproses…' : 'Undi ulang'}
          </button>
        </div>
      </div>
    </div>
  );
}
