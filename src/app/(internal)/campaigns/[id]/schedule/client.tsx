'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { QuestionPickerModal } from '@/components/organisms/QuestionPickerModal.organism';
import { assignSlotAction, autofillDailyAction, removeSlotsAction } from '@/services/campaignContent.actions';
import { campaignDays, formatDay, formatLongDay, lastDay, slotOutOfPeriod, weekNo, weekRange } from '@/libs/campaign';
import type { CampaignRow, SlotRow } from '@/types/campaign.types';

type Target =
  | { kind: 'daily'; forDate: string; current: SlotRow | undefined }
  | { kind: 'weekly'; weekNo: number; position: number; current: SlotRow | undefined };

export function ScheduleClient({ campaign, slots }: { campaign: CampaignRow; slots: SlotRow[] }) {
  const router = useRouter();
  const [target, setTarget] = useState<Target | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [filling, setFilling] = useState(false);

  // Calendar runs start → last_day (WIB date of close_at − 1 s), like campaign.total_days.
  const last = lastDay(campaign.close_at);
  const days = campaignDays(campaign.start_at, campaign.close_at);
  const dailyByDate = new Map(slots.filter((s) => s.kind === 'daily').map((s) => [s.for_date!, s]));
  const weekly = slots.filter((s) => s.kind === 'weekly');
  const maxWeek = weekNo(campaign.start_at, last);
  const emptyDays = days.filter((d) => !dailyByDate.has(d)).length;
  // Left behind after close_at moved earlier: not counted by the DB.
  const outDaily = slots.filter((s) => s.kind === 'daily' && slotOutOfPeriod(campaign.start_at, campaign.close_at, s));
  const outWeeks = [...new Set(weekly.filter((s) => slotOutOfPeriod(campaign.start_at, campaign.close_at, s)).map((s) => s.week_no!))].sort((a, b) => a - b);

  async function removeSlots(ids: string[]) {
    setMsg(null);
    try {
      const res = await removeSlotsAction(campaign.id, ids);
      if (!res.ok) return setMsg(res.error);
      setMsg(`${res.data.removed} soal dihapus.` + (res.data.kept > 0 ? ` ${res.data.kept} tetap karena sudah dibuka peserta.` : ''));
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Gagal menghapus soal.');
    }
  }

  async function assign(questionId: string | null): Promise<string | null> {
    if (!target) return null;
    try {
      const res = await assignSlotAction(
        target.kind === 'daily'
          ? { campaignId: campaign.id, kind: 'daily', forDate: target.forDate, position: 1, questionId }
          : { campaignId: campaign.id, kind: 'weekly', weekNo: target.weekNo, position: target.position, questionId }
      );
      if (!res.ok) return res.error;
      router.refresh();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'Gagal menyimpan jadwal.';
    }
  }

  async function autofill() {
    setFilling(true);
    setMsg(null);
    try {
      const res = await autofillDailyAction(campaign.id);
      if (!res.ok) return setMsg(res.error);
      setMsg(
        `${res.data.filled} hari terisi.` +
          (res.data.missing > 0 ? ` ${res.data.missing} hari masih kosong — soal umum yang belum pernah dipakai habis.` : '')
      );
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Gagal mengisi otomatis.');
    } finally {
      setFilling(false);
    }
  }

  const cell = (slot: SlotRow | undefined) =>
    slot ? (
      <span className="line-clamp-2 text-text-primary">{slot.locked ? '🔒 ' : ''}{slot.prompt}</span>
    ) : (
      <span className="text-danger">Belum ada soal</span>
    );

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border-color bg-bg-secondary p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-text-primary">Soal harian</h2>
            <p className="mt-1 text-sm text-text-secondary">
              {days.length} hari sampai {formatLongDay(last)} · {emptyDays} kosong. Soal yang sudah dibuka peserta terkunci (🔒).
            </p>
          </div>
          <button onClick={autofill} disabled={filling || emptyDays === 0}
            className="rounded-lg bg-bg-hover px-4 py-2 text-sm text-text-primary hover:bg-bg-tertiary disabled:opacity-50">
            {filling ? 'Mengisi…' : 'Isi otomatis hari kosong'}
          </button>
        </div>
        {msg && <p className="mt-3 text-sm text-text-secondary">{msg}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {days.map((d) => {
            const slot = dailyByDate.get(d);
            return (
              <button
                key={d}
                disabled={slot?.locked}
                onClick={() => setTarget({ kind: 'daily', forDate: d, current: slot })}
                className={`rounded-lg border p-3 text-left text-xs disabled:cursor-not-allowed ${
                  slot ? 'border-border-color bg-bg-primary hover:border-brand' : 'border-danger/60 bg-danger/5 hover:border-danger'
                }`}
              >
                <div className="mb-1 font-medium text-text-secondary">{formatDay(d)}</div>
                {cell(slot)}
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-border-color bg-bg-secondary p-5">
        <h2 className="font-semibold text-text-primary">Kuis mingguan</h2>
        <p className="mt-1 text-sm text-text-secondary">5 soal per minggu, Senin–Minggu. Minggu tanpa soal tidak punya kuis mingguan.</p>
        <div className="mt-4 space-y-4">
          {Array.from({ length: maxWeek }, (_, i) => i + 1).map((w) => {
            const r = weekRange(campaign.start_at, w);
            return (
              <div key={w}>
                <div className="mb-2 text-sm font-medium text-text-primary">
                  Minggu {w} <span className="font-normal text-text-secondary">· {formatDay(r.from)} – {formatDay(r.to)}</span>
                  {(() => { const n = weekly.filter((s) => s.week_no === w).length; return n > 0 && n < 5 ? <span className="ml-2 text-xs text-danger">{n}/5 soal — isi semua 5 slot</span> : null; })()}
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
                  {[1, 2, 3, 4, 5].map((p) => {
                    const slot = weekly.find((s) => s.week_no === w && s.position === p);
                    return (
                      <button
                        key={p}
                        disabled={slot?.locked}
                        onClick={() => setTarget({ kind: 'weekly', weekNo: w, position: p, current: slot })}
                        className={`rounded-lg border p-3 text-left text-xs disabled:cursor-not-allowed ${
                          slot ? 'border-border-color bg-bg-primary hover:border-brand' : 'border-danger/60 bg-danger/5 hover:border-danger'
                        }`}
                      >
                        <div className="mb-1 font-medium text-text-secondary">Soal {p}</div>
                        {cell(slot)}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {(outDaily.length > 0 || outWeeks.length > 0) && (
        <section className="rounded-xl border border-amber-500/40 bg-bg-secondary p-5">
          <h2 className="font-semibold text-text-primary">Di luar periode campaign — tidak dihitung</h2>
          <p className="mt-1 text-sm text-text-secondary">Soal ini berada setelah hari terakhir check-in ({formatLongDay(last)}).</p>
          <ul className="mt-4 divide-y divide-border-color text-sm">
            {outDaily.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-2">
                <span className="w-32 text-text-secondary">{formatDay(s.for_date!)}</span>
                <span className="flex-1 text-text-primary">{s.locked ? '🔒 ' : ''}{s.prompt}</span>
                <span className="text-xs text-amber-600">Di luar periode campaign — tidak dihitung</span>
                <button disabled={s.locked} onClick={() => removeSlots([s.id])} className="text-sm text-text-secondary hover:text-danger disabled:opacity-40">Hapus</button>
              </li>
            ))}
            {outWeeks.map((w) => {
              const ids = weekly.filter((s) => s.week_no === w).map((s) => s.id);
              return (
                <li key={`w${w}`} className="flex items-center gap-3 py-2">
                  <span className="w-32 text-text-secondary">Minggu {w}</span>
                  <span className="flex-1 text-text-primary">{ids.length} soal mingguan</span>
                  <span className="text-xs text-amber-600">Di luar periode campaign — tidak dihitung</span>
                  <button onClick={() => removeSlots(ids)} className="text-sm text-text-secondary hover:text-danger">Hapus minggu ini</button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {target && (
        <QuestionPickerModal
          campaignId={campaign.id}
          title={target.kind === 'daily' ? `Soal harian · ${formatDay(target.forDate)}` : `Minggu ${target.weekNo} · soal ${target.position}`}
          defaultCategory={target.kind === 'daily' ? 'umum' : ''}
          hasCurrent={!!target.current}
          onPick={assign}
          onClose={() => setTarget(null)}
        />
      )}
    </div>
  );
}
