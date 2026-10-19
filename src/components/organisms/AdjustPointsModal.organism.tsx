'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adjustPointsAction, listUserEventsAction, revokeEventAction } from '@/services/campaignMonitor.actions';
import type { ParticipantRow, PointEventRow } from '@/types/campaign.types';

const inputCls =
  'mt-1 w-full rounded-lg border border-border-color bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-brand';

const SOURCE_LABEL: Record<string, string> = {
  daily_checkin: 'Check-in', daily_correct: 'Bonus benar harian', streak: 'Streak', weekly_correct: 'Kuis mingguan',
  weekly_complete: 'Minggu selesai', prayer: 'Tulis doa', comment: 'Komentar doa', admin_adjust: 'Penyesuaian admin',
};

export function AdjustPointsModal({
  campaignId,
  participant,
  onClose,
}: {
  campaignId: string;
  participant: ParticipantRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [events, setEvents] = useState<PointEventRow[] | null>(null);
  const [points, setPoints] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listUserEventsAction(campaignId, participant.user_id)
      .then((r) => alive && setEvents(r))
      .catch((e) => alive && (setEvents([]), setError(e instanceof Error ? e.message : 'Gagal memuat riwayat.')));
    return () => {
      alive = false;
    };
  }, [campaignId, participant.user_id]);

  async function reload() {
    setEvents(await listUserEventsAction(campaignId, participant.user_id));
    router.refresh();
  }

  async function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, onOk?: () => void) {
    setBusy(true);
    setError(null);
    try {
      const res = await action();
      if (!res.ok) return setError(res.error);
      onOk?.();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Terjadi kesalahan.');
    } finally {
      setBusy(false);
    }
  }

  const adjust = () =>
    run(() => adjustPointsAction({ campaignId, userId: participant.user_id, points: Number(points), note }), () => setPoints(''));
  const revoke = (ev: PointEventRow) => run(() => revokeEventAction({ campaignId, eventId: ev.id, note }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-border-color bg-bg-secondary shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-color p-5">
          <h2 className="text-lg font-bold text-text-primary">Poin {participant.full_name}</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary">&times;</button>
        </div>
        <div className="space-y-4 p-5">
          <label className="block">
            <span className="text-sm text-text-secondary">Alasan (wajib, tercatat di riwayat peserta)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="mis. Komentar spam berulang" />
          </label>
          <div className="flex items-end gap-3">
            <label className="block flex-1">
              <span className="text-sm text-text-secondary">Tambah atau kurangi poin (pakai minus untuk mengurangi)</span>
              <input type="number" value={points} onChange={(e) => setPoints(e.target.value)} className={inputCls} placeholder="mis. -10" />
            </label>
            <button onClick={adjust} disabled={busy || !points || note.trim().length < 3}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-brand-content hover:bg-brand-hover disabled:opacity-50">
              Simpan penyesuaian
            </button>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
        <div className="flex-1 overflow-y-auto border-t border-border-color p-5">
          <h3 className="mb-2 text-sm font-medium text-text-primary">Riwayat poin</h3>
          {events === null ? (
            <p className="text-sm text-text-secondary">Memuat…</p>
          ) : events.length === 0 ? (
            <p className="text-sm text-text-secondary">Belum ada aktivitas.</p>
          ) : (
            <ul className="divide-y divide-border-color text-sm">
              {events.map((ev) => (
                <li key={ev.id} className="flex items-center gap-3 py-2">
                  <div className="flex-1">
                    <div className="text-text-primary">
                      {SOURCE_LABEL[ev.source] ?? ev.source} · {ev.status === 'awarded' ? `${ev.points > 0 ? '+' : ''}${ev.points}` : ev.status === 'revoked' ? 'dibatalkan' : 'tidak dihitung'}
                    </div>
                    <div className="text-xs text-text-secondary">{ev.day_wib} · {ev.reason_code}{ev.note ? ` · ${ev.note}` : ''}</div>
                  </div>
                  {ev.status === 'awarded' && ev.points !== 0 && (
                    <button onClick={() => revoke(ev)} disabled={busy || note.trim().length < 3}
                      title={note.trim().length < 3 ? 'Isi alasan dulu' : undefined}
                      className="text-sm text-text-secondary hover:text-danger disabled:opacity-40">
                      Batalkan
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
