// Pure campaign helpers shared by server actions and client components.
// No '@/…' imports so scripts/check-campaign-lib.mts can run it with plain node.
// Date math mirrors the SQL helpers in the `campaign` schema (plan 1):
// days are Asia/Jakarta (UTC+7, no DST), weeks run Monday–Sunday,
// week 1 = the week containing the start day.

import type {
  CampaignInput, CampaignModules, CampaignRow, CampaignRules, CampaignStatus, CampaignTheme,
  CampaignVenue, QuestionCategory, QuestionDraft,
} from '../types/campaign.types';

// ---------- defaults (column defaults in plan 1, except: grand_top_n = 10 and the
// threshold keys dropped by the top-N model, plan 1B) ----------

export const DEFAULT_RULES: CampaignRules = {
  daily_checkin_points: 5, daily_correct_bonus: 5,
  streak_days: 7, streak_bonus: 20,
  weekly_correct_points: 10,
  prayer_points: 5, prayer_daily_cap: 1,
  comment_points: 2, comment_daily_cap: 3, comment_min_chars: 10,
  daily_timer_sec: 15, weekly_timer_sec: 20, timer_grace_sec: 3,
  grand_top_n: 10,
};

export const DEFAULT_THEME: CampaignTheme = {
  title: 'Yesus Datang Membawa Damai',
  subtitle: '',
  verse: '',
  banner_url: null,
  hero_url: null,
  colors: { background: '#141A3A', primary: '#E8B04B', accent: '#8FB59A' },
};

export const DEFAULT_VENUE: CampaignVenue = {
  name: '',
  address: '',
  maps_url: '',
  note: 'Hadiah diterima langsung di lokasi acara.',
};

export const DEFAULT_MODULES: CampaignModules = { daily: true, weekly: true, prayer: true, comment: true };

export interface RuleField {
  key: keyof CampaignRules;
  label: string;
  group: 'points' | 'timers' | 'grand';
  min: number;
  max: number;
  suffix?: string;
}

export const RULE_FIELDS: RuleField[] = [
  { key: 'daily_checkin_points', label: 'Poin check-in harian', group: 'points', min: 0, max: 1000 },
  { key: 'daily_correct_bonus', label: 'Bonus jawaban benar (harian)', group: 'points', min: 0, max: 1000 },
  { key: 'streak_days', label: 'Panjang streak', group: 'points', min: 2, max: 60, suffix: 'hari' },
  { key: 'streak_bonus', label: 'Bonus streak', group: 'points', min: 0, max: 1000 },
  { key: 'weekly_correct_points', label: 'Poin per jawaban benar (mingguan)', group: 'points', min: 0, max: 1000 },
  { key: 'prayer_points', label: 'Poin tulis doa', group: 'points', min: 0, max: 1000 },
  { key: 'prayer_daily_cap', label: 'Maks doa dihitung per hari', group: 'points', min: 0, max: 10 },
  { key: 'comment_points', label: 'Poin komentar doa', group: 'points', min: 0, max: 1000 },
  { key: 'comment_daily_cap', label: 'Maks komentar dihitung per hari', group: 'points', min: 0, max: 20 },
  { key: 'comment_min_chars', label: 'Panjang minimal komentar', group: 'points', min: 1, max: 200, suffix: 'huruf' },
  { key: 'daily_timer_sec', label: 'Waktu soal harian', group: 'timers', min: 5, max: 120, suffix: 'detik' },
  { key: 'weekly_timer_sec', label: 'Waktu per soal mingguan', group: 'timers', min: 5, max: 120, suffix: 'detik' },
  { key: 'timer_grace_sec', label: 'Toleransi jaringan', group: 'timers', min: 0, max: 10, suffix: 'detik' },
  { key: 'grand_top_n', label: 'Jumlah peringkat teratas (semua gereja) — dapat hadiah tetap', group: 'grand', min: 1, max: 500 },
];

export const STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: 'Draft',
  scheduled: 'Terjadwal',
  running: 'Berjalan',
  closed: 'Ditutup',
  drawn: 'Selesai diundi',
  archived: 'Diarsipkan',
};

export const STATUS_VARIANT: Record<CampaignStatus, 'secondary' | 'outline' | 'success' | 'warning' | 'primary'> = {
  draft: 'secondary',
  scheduled: 'outline',
  running: 'success',
  closed: 'warning',
  drawn: 'primary',
  archived: 'outline',
};

export const CATEGORY_LABEL: Record<QuestionCategory, string> = {
  umum: 'Pengetahuan umum',
  alkitab: 'Alkitab',
  gereja: 'Gereja',
};

// ---------- WIB date math ----------

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 'YYYY-MM-DD' of an instant in Asia/Jakarta. */
export function wibDate(iso: string): string {
  return new Date(Date.parse(iso) + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** a − b in whole days ('YYYY-MM-DD'). */
export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS);
}

function mondayOf(day: string): string {
  const dow = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7; // Mon = 0
  return addDays(day, -dow);
}

/** Mirrors campaign.week_no(p_start, p_day). */
export function weekNo(startIso: string, day: string): number {
  return diffDays(mondayOf(day), mondayOf(wibDate(startIso))) / 7 + 1;
}

export function weekRange(startIso: string, n: number): { from: string; to: string } {
  const from = addDays(mondayOf(wibDate(startIso)), (n - 1) * 7);
  return { from, to: addDays(from, 6) };
}

/** Mirrors campaign.last_day(p_close): WIB date of (close_at − 1 second).
 *  A close of 26 Dec 00:00 and one of 25 Dec 23:59 both end on 25 Dec. */
export function lastDay(closeIso: string): string {
  return wibDate(new Date(Date.parse(closeIso) - 1000).toISOString());
}

/** Mirrors campaign.total_days(start, close): start day … last_day inclusive. */
export function totalDays(startIso: string, closeIso: string): number {
  return diffDays(lastDay(closeIso), wibDate(startIso)) + 1;
}

/** Every countable day: start day … last_day. */
export function campaignDays(startIso: string, closeIso: string): string[] {
  const first = wibDate(startIso);
  const n = totalDays(startIso, closeIso);
  return Array.from({ length: Math.max(0, n) }, (_, i) => addDays(first, i));
}

/** Mirrors campaign.total_weeks: weeks that have slots AND whose Monday ≤ last_day. */
export function countableWeeks(startIso: string, closeIso: string, assignedWeeks: number[]): number[] {
  const last = lastDay(closeIso);
  return [...new Set(assignedWeeks)].filter((w) => w >= 1 && weekRange(startIso, w).from <= last).sort((a, b) => a - b);
}

/** Period facts for the settings preview. The top-N model has no activity thresholds. */
export function resolveRequirements(
  startIso: string,
  closeIso: string,
  assignedWeeks: number[]
): { days: number; lastDay: string; weeksInRange: number; weeksAssigned: number } {
  return {
    days: totalDays(startIso, closeIso),
    lastDay: lastDay(closeIso),
    weeksInRange: weekNo(startIso, lastDay(closeIso)),
    weeksAssigned: countableWeeks(startIso, closeIso, assignedWeeks).length,
  };
}

/** ISO instant → 'YYYY-MM-DDTHH:mm' in WIB for <input type="datetime-local">. */
export function isoToWibInput(iso: string): string {
  return new Date(Date.parse(iso) + WIB_OFFSET_MS).toISOString().slice(0, 16);
}

/** 'YYYY-MM-DDTHH:mm' typed as WIB → ISO instant (UTC). */
export function wibInputToIso(v: string): string {
  return new Date(`${v}:00+07:00`).toISOString();
}

export function formatWib(iso: string): string {
  return (
    new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }) +
    ' WIB'
  );
}

/** 'YYYY-MM-DD' → 'Kamis, 31 Desember 2026' */
export function formatLongDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('id-ID', {
    timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

/** 'YYYY-MM-DD' → 'Sen, 2 Nov' */
export function formatDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('id-ID', {
    timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short',
  });
}

/** Campaign clock day (sim_now on test campaigns), like campaign.now_for(). */
export function campaignToday(c: CampaignRow): string {
  return wibDate(c.is_test && c.sim_now ? c.sim_now : new Date().toISOString());
}

// ---------- lifecycle ----------

export function computeStatus(c: CampaignRow, hasWinners: boolean, nowMs: number): CampaignStatus {
  if (c.status === 'archived') return 'archived';
  if (c.status === 'draft') return 'draft';
  if (hasWinners) return 'drawn';
  const t = c.is_test && c.sim_now ? Date.parse(c.sim_now) : nowMs;
  if (t < Date.parse(c.start_at)) return 'scheduled';
  if (t < Date.parse(c.close_at)) return 'running';
  return 'closed';
}

/** New-campaign defaults: 16 Nov 00:00 → close 26 Dec 00:00 (last day 25 Dec), draw 31 Dec 19:00 WIB of the current WIB year. */
export function defaultCampaignInput(nowMs: number): CampaignInput {
  const year = new Date(nowMs + WIB_OFFSET_MS).getUTCFullYear();
  return {
    name: '',
    start_at: wibInputToIso(`${year}-11-16T00:00`),
    close_at: wibInputToIso(`${year}-12-26T00:00`),
    draw_at: wibInputToIso(`${year}-12-31T19:00`),
    is_test: false,
    theme: { ...DEFAULT_THEME, colors: { ...DEFAULT_THEME.colors } },
    venue: { ...DEFAULT_VENUE },
    modules: { ...DEFAULT_MODULES },
    rules: { ...DEFAULT_RULES },
  };
}

/** DB row → form input; merges defaults so a row missing new keys still saves a full object. */
export function toCampaignInput(c: CampaignRow): CampaignInput {
  return {
    name: c.name,
    start_at: c.start_at,
    close_at: c.close_at,
    draw_at: c.draw_at,
    is_test: c.is_test,
    theme: { ...DEFAULT_THEME, ...c.theme, colors: { ...DEFAULT_THEME.colors, ...(c.theme?.colors ?? {}) } },
    venue: { ...DEFAULT_VENUE, ...c.venue },
    modules: { ...DEFAULT_MODULES, ...c.modules },
    rules: { ...DEFAULT_RULES, ...c.rules },
  };
}

// ---------- validation ----------

const HEX = /^#[0-9A-Fa-f]{6}$/;
const COLOR_LABEL: Record<keyof CampaignTheme['colors'], string> = {
  background: 'latar',
  primary: 'utama',
  accent: 'aksen',
};

export function validateCampaignInput(i: CampaignInput): string | null {
  const name = i.name.trim();
  if (name.length < 3 || name.length > 120) return 'Nama campaign harus 3–120 karakter.';
  const s = Date.parse(i.start_at);
  const c = Date.parse(i.close_at);
  const d = Date.parse(i.draw_at);
  if ([s, c, d].some(Number.isNaN)) return 'Tanggal tidak valid.';
  if (!(s < c)) return 'Tanggal tutup harus setelah tanggal mulai.';
  if (!(c <= d)) return 'Tanggal undian tidak boleh sebelum tanggal tutup.';
  for (const f of RULE_FIELDS) {
    const v = i.rules[f.key];
    if (!Number.isInteger(v) || v < f.min || v > f.max) return `${f.label}: isi angka bulat ${f.min}–${f.max}.`;
  }
  const title = i.theme.title.trim();
  if (title.length < 3 || title.length > 80) return 'Judul tema harus 3–80 karakter.';
  for (const k of Object.keys(COLOR_LABEL) as (keyof CampaignTheme['colors'])[]) {
    if (!HEX.test(i.theme.colors[k])) return `Warna ${COLOR_LABEL[k]} harus format #RRGGBB.`;
  }
  const maps = i.venue.maps_url.trim();
  if (maps && !maps.startsWith('https://')) return 'Link Maps harus diawali https://.';
  if (!Object.values(i.modules).some(Boolean)) return 'Aktifkan minimal satu modul.';
  return null;
}

const CATEGORIES: QuestionCategory[] = ['umum', 'alkitab', 'gereja'];

/** Mirrors the CHECK constraints on campaign.questions. */
export function validateQuestion(d: QuestionDraft): string | null {
  const p = d.prompt.trim();
  if (p.length < 5 || p.length > 300) return 'Pertanyaan harus 5–300 karakter.';
  const a = d.option_a.trim();
  const b = d.option_b.trim();
  if (a.length < 1 || a.length > 80 || b.length < 1 || b.length > 80) return 'Pilihan A dan B harus 1–80 karakter.';
  if (a.toLowerCase() === b.toLowerCase()) return 'Pilihan A dan B tidak boleh sama.';
  if (d.correct !== 'a' && d.correct !== 'b') return 'Jawaban benar harus a atau b.';
  if (!CATEGORIES.includes(d.category)) return 'Kategori harus umum, alkitab, atau gereja.';
  if (![1, 2, 3].includes(d.difficulty)) return 'Tingkat kesulitan harus 1, 2, atau 3.';
  return null;
}

// ---------- CSV ----------

/** RFC 4180 parser: quotes, "" escapes, CRLF/LF, UTF-8 BOM; drops fully blank rows. */
export function parseCsv(text: string): string[][] {
  const s = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export const QUESTION_CSV_HEADER = ['prompt', 'option_a', 'option_b', 'correct', 'category', 'difficulty'] as const;

/**
 * Question bank CSV (the format Claude generates for review):
 *   prompt,option_a,option_b,correct,category,difficulty
 *   correct ∈ a|b · category ∈ umum|alkitab|gereja · difficulty ∈ 1|2|3
 * Any invalid row → errors (with 1-based file line numbers), rows still parsed for preview.
 */
export function parseQuestionCsv(text: string): { rows: QuestionDraft[]; errors: string[] } {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], errors: ['File kosong.'] };
  const header = table[0].map((h) => h.trim().toLowerCase());
  if (header.join(',') !== QUESTION_CSV_HEADER.join(',')) {
    return { rows: [], errors: [`Header harus persis: ${QUESTION_CSV_HEADER.join(',')}`] };
  }
  const rows: QuestionDraft[] = [];
  const errors: string[] = [];
  table.slice(1).forEach((cols, idx) => {
    const line = idx + 2;
    if (cols.length !== QUESTION_CSV_HEADER.length) {
      errors.push(`Baris ${line}: harus ${QUESTION_CSV_HEADER.length} kolom, ditemukan ${cols.length}.`);
      return;
    }
    const [prompt, option_a, option_b, correct, category, difficulty] = cols.map((c) => c.trim());
    const draft = {
      prompt, option_a, option_b,
      correct: correct.toLowerCase() as 'a' | 'b',
      category: category.toLowerCase() as QuestionCategory,
      difficulty: Number(difficulty) as 1 | 2 | 3,
    };
    const err = validateQuestion(draft);
    if (err) errors.push(`Baris ${line}: ${err}`);
    else rows.push(draft);
  });
  return { rows, errors };
}

export function toCsv(rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null) => {
    const s = v === null ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(',') + '\r\n').join('');
}

/** Browser-only: download rows as a UTF-8 CSV (BOM so Excel reads Indonesian text correctly). */
export function downloadCsv(filename: string, rows: (string | number | null)[][]): void {
  const blob = new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- RPC error codes (plan 1) → copy ----------

const RPC_ERRORS: Record<string, string> = {
  not_found: 'Data tidak ditemukan.',
  not_test: 'Hanya bisa dipakai di campaign uji coba.',
  no_church: 'Tambahkan gereja peserta dulu.',
  note_required: 'Catatan wajib diisi.',
  already_drawn: 'Pengundian sudah dimulai.',
  prize_not_drawable: 'Hadiah tetap tidak diundi. Hadiah ini langsung untuk peringkat teratas.',
  // Plan 1 edit-block triggers (the app also pre-checks for UX).
  question_in_use: 'Pertanyaan sudah dijawab peserta, tidak bisa diubah. Arsipkan dan buat yang baru.',
  slot_locked: 'Jadwal ini sudah dijawab peserta, tidak bisa diganti.',
};

/** Maps a plan 1 error code (exact, or embedded in the PostgREST message) to copy. */
export function rpcErrorMessage(message: string): string {
  if (RPC_ERRORS[message]) return RPC_ERRORS[message];
  const code = Object.keys(RPC_ERRORS).find((k) => message.includes(k));
  return code ? RPC_ERRORS[code] : message;
}

/** Errors from writes on campaign.question_slots: FK RESTRICT (23503) from
 *  attempts on delete means the slot was answered → same copy as slot_locked. */
export function slotWriteErrorMessage(error: { code?: string; message: string }): string {
  return error.code === '23503' ? RPC_ERRORS.slot_locked : rpcErrorMessage(error.message);
}
