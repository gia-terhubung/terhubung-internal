'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCampaignAction, updateCampaignAction } from '@/services/campaign.actions';
import { ImageUploadField } from '@/components/molecules/ImageUploadField.molecule';
import {
  ANNOUNCE_MIN_APP_VERSION, RULE_FIELDS, formatLongDay, isoToWibInput, lastDay, resolveRequirements, validateCampaignInput, weekRange, wibInputToIso,
  type RuleField,
} from '@/libs/campaign';
import type { CampaignInput, CampaignLocks, CampaignModules, DrawMode } from '@/types/campaign.types';

const inputCls =
  'mt-1 w-full rounded-lg border border-border-color bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-brand disabled:opacity-50';
const cardCls = 'rounded-xl border border-border-color bg-bg-secondary p-5';
const labelCls = 'text-sm text-text-secondary';

const MODULE_LABEL: Record<keyof CampaignModules, string> = {
  daily: 'Check-in harian (soal pengetahuan umum)',
  weekly: 'Kuis mingguan (5 soal)',
  prayer: 'Side quest: tulis doa',
  comment: 'Side quest: komentari doa jemaat',
};

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className={cardCls}>
      <h2 className="font-semibold text-text-primary">{title}</h2>
      {hint && <p className="mt-1 text-sm text-text-secondary">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function DateTimeField({
  label, value, onChange, disabled, lockedHint, helper,
}: {
  label: string; value: string; onChange: (iso: string) => void; disabled: boolean; lockedHint: string; helper?: string;
}) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      <input
        type="datetime-local"
        value={isoToWibInput(value)}
        onChange={(e) => e.target.value && onChange(wibInputToIso(e.target.value))}
        disabled={disabled}
        className={inputCls}
      />
      {helper && <span className="mt-1 block text-xs text-text-secondary">{helper}</span>}
      {disabled && <span className="mt-1 block text-xs text-text-secondary">{lockedHint}</span>}
    </label>
  );
}

export function CampaignSettingsForm({
  mode,
  campaignId,
  initial,
  locks,
  assignedWeeks,
  dailyDates,
}: {
  mode: 'create' | 'edit';
  campaignId?: string;
  initial: CampaignInput;
  locks: CampaignLocks;
  assignedWeeks: number[]; // week_no with weekly slots
  dailyDates: string[]; // for_date of daily slots
}) {
  const router = useRouter();
  const [form, setForm] = useState<CampaignInput>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function patch(p: Partial<CampaignInput>) {
    setSaved(false);
    setForm((f) => ({ ...f, ...p }));
  }
  const setRule = (k: RuleField['key'], v: number) => patch({ rules: { ...form.rules, [k]: v } });

  const announce = form.rules.draw_mode === 'announce';
  const clientError = validateCampaignInput(form);
  const req = useMemo(
    () => (clientError === null ? resolveRequirements(form.start_at, form.close_at, assignedWeeks) : null),
    [clientError, form.start_at, form.close_at, assignedWeeks]
  );
  // Slots left beyond the (possibly moved-earlier) last day stop counting.
  const formLastDay = Number.isNaN(Date.parse(form.close_at)) ? null : lastDay(form.close_at);
  const orphanDaily = formLastDay ? dailyDates.filter((d) => d > formLastDay).length : 0;
  const orphanWeeks = formLastDay ? assignedWeeks.filter((w) => weekRange(form.start_at, w).from > formLastDay).length : 0;

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      if (mode === 'create') {
        const res = await createCampaignAction(form);
        if (!res.ok) return setError(res.error);
        router.push(`/campaigns/${res.data.id}`);
        return;
      }
      const res = await updateCampaignAction(campaignId!, form);
      if (!res.ok) return setError(res.error);
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan. Coba lagi.');
    } finally {
      setSaving(false);
    }
  }

  const ruleInputs = (group: RuleField['group']) => (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {RULE_FIELDS.filter((f) => f.group === group).map((f) => (
        <label key={f.key} className="block">
          <span className={labelCls}>
            {f.label}
            {f.suffix ? ` (${f.suffix})` : ''}
          </span>
          <input
            type="number"
            min={f.min}
            max={f.max}
            step={1}
            value={Number.isNaN(form.rules[f.key]) ? '' : form.rules[f.key]}
            onChange={(e) => setRule(f.key, e.target.value === '' ? NaN : Number(e.target.value))}
            disabled={f.key === 'grand_top_n' && locks.topN}
            className={inputCls}
          />
          {f.key === 'grand_top_n' && locks.topN && (
            <span className="mt-1 block text-xs text-text-secondary">Terkunci: peserta sudah dibekukan.</span>
          )}
        </label>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <Section title="Dasar">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelCls}>Nama campaign (internal)</span>
            <input value={form.name} onChange={(e) => patch({ name: e.target.value })} className={inputCls} placeholder="mis. Natal 2026" />
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-text-primary">
            <input
              type="checkbox"
              checked={form.is_test}
              disabled={locks.isTest}
              onChange={(e) => patch({ is_test: e.target.checked })}
            />
            Campaign uji coba (hanya untuk gereja uji, boleh pakai waktu simulasi)
          </label>
        </div>
      </Section>

      <Section title="Tanggal (WIB)" hint="Semua aturan, kuis, pengingat, dan hitung mundur mengikuti tanggal ini.">
        <label className="mb-4 block sm:max-w-xs">
          <span className={labelCls}>Mode undian</span>
          <select
            value={form.rules.draw_mode}
            disabled={locks.drawMode}
            onChange={(e) => patch({ rules: { ...form.rules, draw_mode: e.target.value as DrawMode } })}
            className={inputCls}
          >
            <option value="live">Undian live</option>
            <option value="announce">Pengumuman pemenang</option>
          </select>
          {locks.drawMode && <span className="mt-1 block text-xs text-text-secondary">Terkunci: peserta sudah dibekukan.</span>}
        </label>
        {announce && (
          <p className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-text-primary">
            {`Aplikasi versi lama tetap menampilkan teks undian live. Naikkan versi minimum di App Config ke ${ANNOUNCE_MIN_APP_VERSION} sebelum memakai mode ini.`}
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <DateTimeField label="Mulai" value={form.start_at} onChange={(v) => patch({ start_at: v })}
            disabled={locks.start} lockedHint="Terkunci: campaign sudah dimulai." />
          <DateTimeField label="Tutup quest (peserta dibekukan)" value={form.close_at} onChange={(v) => patch({ close_at: v })}
            disabled={locks.close} lockedHint="Terkunci: peserta sudah dibekukan."
            helper={formLastDay ? `Hari terakhir check-in: ${formatLongDay(formLastDay)}` : undefined} />
          <DateTimeField label={announce ? 'Waktu pengumuman' : 'Undian live'} value={form.draw_at} onChange={(v) => patch({ draw_at: v })}
            disabled={locks.draw} lockedHint={announce ? 'Terkunci: pemenang sudah diumumkan.' : 'Terkunci: pengundian sudah dimulai.'} />
        </div>
        {(orphanDaily > 0 || orphanWeeks > 0) && (
          <p className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-text-primary">
            {orphanDaily > 0 ? `${orphanDaily} soal harian` : ''}
            {orphanDaily > 0 && orphanWeeks > 0 ? ' dan ' : ''}
            {orphanWeeks > 0 ? `${orphanWeeks} minggu kuis` : ''} berada setelah hari terakhir check-in dan tidak akan dihitung.
            Hapus di tab Jadwal soal setelah menyimpan.
          </p>
        )}
      </Section>

      <Section title="Tema" hint="Warna dan judul dipakai di banner beranda, halaman campaign di aplikasi, dan layar undian. Gambar utama tampil di halaman campaign aplikasi dan layar undian; gambar banner dipakai di layar undian.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelCls}>Judul</span>
            <input value={form.theme.title} onChange={(e) => patch({ theme: { ...form.theme, title: e.target.value } })} className={inputCls} />
          </label>
          <label className="block">
            <span className={labelCls}>Subjudul</span>
            <input value={form.theme.subtitle} onChange={(e) => patch({ theme: { ...form.theme, subtitle: e.target.value } })} className={inputCls} />
          </label>
          <label className="block sm:col-span-2">
            <span className={labelCls}>Ayat</span>
            <textarea rows={2} value={form.theme.verse} onChange={(e) => patch({ theme: { ...form.theme, verse: e.target.value } })} className={inputCls} />
          </label>
          {(['background', 'primary', 'accent'] as const).map((k) => (
            <label key={k} className="block">
              <span className={labelCls}>{k === 'background' ? 'Warna latar' : k === 'primary' ? 'Warna utama' : 'Warna aksen'}</span>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={/^#[0-9A-Fa-f]{6}$/.test(form.theme.colors[k]) ? form.theme.colors[k] : '#000000'}
                  onChange={(e) => patch({ theme: { ...form.theme, colors: { ...form.theme.colors, [k]: e.target.value.toUpperCase() } } })}
                  className="h-9 w-12 cursor-pointer rounded border border-border-color bg-bg-primary"
                />
                <input
                  value={form.theme.colors[k]}
                  onChange={(e) => patch({ theme: { ...form.theme, colors: { ...form.theme.colors, [k]: e.target.value } } })}
                  className="w-full rounded-lg border border-border-color bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-brand"
                />
              </div>
            </label>
          ))}
          {mode === 'edit' && campaignId ? (
            <>
              <ImageUploadField label="Banner" campaignId={campaignId} kind="banner" value={form.theme.banner_url}
                onChange={(url) => { setSaved(false); setForm((f) => ({ ...f, theme: { ...f.theme, banner_url: url } })); }} />
              <ImageUploadField label="Gambar utama" campaignId={campaignId} kind="hero" value={form.theme.hero_url}
                onChange={(url) => { setSaved(false); setForm((f) => ({ ...f, theme: { ...f.theme, hero_url: url } })); }} />
            </>
          ) : (
            <p className="text-sm text-text-secondary sm:col-span-2">Gambar bisa diunggah setelah campaign disimpan.</p>
          )}
        </div>
      </Section>

      <Section title="Lokasi acara" hint={announce ? 'Opsional di mode pengumuman: tidak ditampilkan di aplikasi.' : 'Pemenang menerima hadiah langsung di lokasi ini. Ditampilkan di aplikasi saat minggu undian.'}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelCls}>Nama tempat</span>
            <input value={form.venue.name} onChange={(e) => patch({ venue: { ...form.venue, name: e.target.value } })} className={inputCls} />
          </label>
          <label className="block">
            <span className={labelCls}>Link Google Maps</span>
            <input value={form.venue.maps_url} onChange={(e) => patch({ venue: { ...form.venue, maps_url: e.target.value } })} className={inputCls} placeholder="https://maps.app.goo.gl/…" />
          </label>
          <label className="block sm:col-span-2">
            <span className={labelCls}>Alamat</span>
            <input value={form.venue.address} onChange={(e) => patch({ venue: { ...form.venue, address: e.target.value } })} className={inputCls} />
          </label>
          <label className="block sm:col-span-2">
            <span className={labelCls}>Catatan</span>
            <input value={form.venue.note} onChange={(e) => patch({ venue: { ...form.venue, note: e.target.value } })} className={inputCls} />
          </label>
        </div>
      </Section>

      <Section title="Modul" hint="Matikan modul yang tidak dipakai di acara ini.">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(Object.keys(MODULE_LABEL) as (keyof CampaignModules)[]).map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm text-text-primary">
              <input type="checkbox" checked={form.modules[k]} onChange={(e) => patch({ modules: { ...form.modules, [k]: e.target.checked } })} />
              {MODULE_LABEL[k]}
            </label>
          ))}
        </div>
      </Section>

      <Section title="Poin dan batas harian">{ruleInputs('points')}</Section>
      <Section title="Waktu menjawab">{ruleInputs('timers')}</Section>

      <Section
        title="Hadiah tetap dan hadiah utama"
        hint="Peringkat dihitung dari total poin di semua gereja peserta. Poin sama: yang lebih banyak hari check-in di atas, lalu yang lebih dulu mencapai poinnya."
      >
        {ruleInputs('grand')}
        <div className="mt-4 rounded-lg bg-bg-primary p-4 text-sm text-text-primary">
          {req ? (
            <ul className="space-y-1">
              <li>Peringkat 1–<b>{form.rules.grand_top_n}</b> dari semua gereja mendapat hadiah tetap (tidak diundi).</li>
              <li>Hadiah utama diundi dari {form.rules.grand_top_n} besar itu.</li>
              <li>Hadiah reguler diundi dari semua jemaat terdaftar (termasuk tanpa aplikasi dan {form.rules.grand_top_n} besar).</li>
              <li>
                Periode {req.days} hari, hari terakhir {formatLongDay(req.lastDay)}. Kuis mingguan: {req.weeksAssigned} minggu sudah diisi soal
                {req.weeksAssigned < req.weeksInRange ? ` (periode ini punya ${req.weeksInRange} minggu — isi jadwal soal dulu)` : ''}.
              </li>
            </ul>
          ) : (
            <span className="text-text-secondary">Lengkapi isian yang valid untuk melihat ringkasan.</span>
          )}
        </div>
      </Section>

      <div className="flex items-center justify-end gap-3">
        {(error ?? clientError) && <p className="text-sm text-danger">{error ?? clientError}</p>}
        {saved && <p className="text-sm text-text-secondary">Perubahan disimpan.</p>}
        <button
          onClick={save}
          disabled={clientError !== null || saving}
          className="rounded-lg bg-brand px-5 py-2 text-sm font-bold text-brand-content hover:bg-brand-hover disabled:opacity-50"
        >
          {saving ? 'Menyimpan…' : mode === 'create' ? 'Buat campaign' : 'Simpan perubahan'}
        </button>
      </div>
    </div>
  );
}
