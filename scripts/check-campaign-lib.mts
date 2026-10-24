// Run from terhubung-internal/: node scripts/check-campaign-lib.mts
// Pure-lib assertions (Node ≥ 23 strips TS types natively). Mirrors the SQL
// helper tests in terhubung-app/supabase/tests/campaign_1_schema.sql.
import assert from 'node:assert/strict';
import {
  DEFAULT_MODULES, DEFAULT_RULES, DEFAULT_THEME, DEFAULT_VENUE,
  campaignDays, computeStatus, isoToWibInput, parseCsv, parseQuestionCsv, rpcErrorMessage,
  countableWeeks, lastDay, resolveRequirements, toCsv, totalDays, validateCampaignInput, weekNo, weekRange, wibDate,
  wibInputToIso, isUuid, campaignAssetPrefix, sanitizeAssetUrl, sanitizeCampaignInput, slotOutOfPeriod,
  drawModeOf, grandTopWeightOf, GRAND_TOP_WEIGHT_DEFAULT, defaultCampaignInput, isPrePublish, drawAtLocked, statusLabel,
  assetObjectPath, droppedAssetUrls, unreferencedPaths,
} from '../src/libs/campaign.ts';

// L1 WIB day: 2026-11-01 17:30 UTC = 2026-11-02 00:30 WIB
assert.equal(wibDate('2026-11-01T17:30:00Z'), '2026-11-02');
// L2 datetime-local round trip is WIB regardless of the machine timezone
assert.equal(isoToWibInput('2026-10-31T17:00:00.000Z'), '2026-11-01T00:00');
assert.equal(wibInputToIso('2026-11-01T00:00'), '2026-10-31T17:00:00.000Z');
// L3 week numbers / totals (same values as SQL S2/S3)
const start = '2026-11-01T00:00:00+07:00';
assert.equal(weekNo(start, '2026-11-01'), 1);
assert.equal(weekNo(start, '2026-11-02'), 2);
assert.equal(weekNo(start, '2026-12-31'), 10);
assert.equal(totalDays(start, '2026-12-31T18:00:00+07:00'), 61);
// L3b last_day = WIB date of (close − 1 s): midnight close ends the day before
assert.equal(lastDay('2026-12-26T00:00:00+07:00'), '2026-12-25');
assert.equal(lastDay('2026-12-25T23:59:00+07:00'), '2026-12-25');
assert.equal(totalDays(start, '2026-12-26T00:00:00+07:00'), totalDays(start, '2026-12-25T23:59:00+07:00'));
// L3c countable weeks: slots exist AND week Monday ≤ last_day (week 10 Monday = 28 Dec)
assert.deepEqual(countableWeeks(start, '2026-12-28T00:00:00+07:00', [1, 9, 10]), [1, 9]);
assert.deepEqual(countableWeeks(start, '2026-12-28T00:00:01+07:00', [1, 9, 10]), [1, 9, 10]);
assert.deepEqual(weekRange(start, 2), { from: '2026-11-02', to: '2026-11-08' });
assert.equal(campaignDays(start, '2026-11-03T10:00:00+07:00').join(','), '2026-11-01,2026-11-02,2026-11-03');
// L4 settings preview: period facts only (top-N model, no % thresholds)
const req = resolveRequirements(start, '2026-12-31T18:00:00+07:00', [2, 3, 4, 5, 6, 7, 8, 9, 10]);
assert.deepEqual(req, { days: 61, lastDay: '2026-12-31', weeksInRange: 10, weeksAssigned: 9 });
// L5 CSV: BOM, CRLF, quoted comma + escaped quote, trailing blank line
const rows = parseCsv('\uFEFFa,b\r\n"x, y","say ""hi"""\r\n\r\n');
assert.deepEqual(rows, [['a', 'b'], ['x, y', 'say "hi"']]);
assert.equal(toCsv([['x, y', 'say "hi"', 3, null]]), '"x, y","say ""hi""",3,\r\n');
// CSV formula injection guard
assert.equal(toCsv([['=HYPERLINK("http://x","y")']]), "\"'=HYPERLINK(\"\"http://x\"\",\"\"y\"\")\"\r\n");
assert.equal(toCsv([['+628123456789']]), '+628123456789\r\n');
assert.equal(toCsv([['+62 812-3456']]), '+62 812-3456\r\n');
assert.equal(toCsv([['+1+1']]), "'+1+1\r\n");
assert.equal(toCsv([['=1+1']]), "'=1+1\r\n");
assert.equal(toCsv([['+HYPERLINK(']]), "'+HYPERLINK(\r\n");
assert.equal(toCsv([['-5']]), "'-5\r\n");
assert.equal(toCsv([['@x']]), "'@x\r\n");
assert.equal(toCsv([[-5, 'Budi Santoso']]), '-5,Budi Santoso\r\n');
// L6 question CSV happy path
const ok = parseQuestionCsv(
  'prompt,option_a,option_b,correct,category,difficulty\n"Ibu kota Indonesia?",Jakarta,Bandung,a,umum,1\n'
);
assert.equal(ok.errors.length, 0);
assert.deepEqual(ok.rows[0], {
  prompt: 'Ibu kota Indonesia?', option_a: 'Jakarta', option_b: 'Bandung', correct: 'a', category: 'umum', difficulty: 1,
});
// L7 question CSV rejects bad header and bad rows with line numbers
assert.match(parseQuestionCsv('question,a,b\nx,y,z').errors[0], /Header harus persis/);
const bad = parseQuestionCsv('prompt,option_a,option_b,correct,category,difficulty\nHai?,A,B,c,umum,1\n');
assert.match(bad.errors[0], /^Baris 2:/);
// L7b real source lines: blank line, multi-line quoted field, unterminated quote
const blankBefore = parseQuestionCsv('prompt,option_a,option_b,correct,category,difficulty\n\nHai?,A,B,c,umum,1\n');
assert.match(blankBefore.errors[0], /^Baris 3:/);
const multi = parseQuestionCsv('prompt,option_a,option_b,correct,category,difficulty\n"Satu\ndua?",A,B,a,umum,1\nHai?,A,B,c,umum,1\n');
assert.equal(multi.rows.length, 1);
assert.match(multi.errors[0], /^Baris 4:/);
const open = parseQuestionCsv('prompt,option_a,option_b,correct,category,difficulty\nok,A,B,a,umum,1\n"belum,A,B,a,umum,1\n');
assert.equal(open.errors.length, 1);
assert.match(open.errors[0], /Tanda kutip tidak ditutup \(mulai baris 3\)/);
// L8 status lifecycle
const base = {
  id: 'x', name: 'Uji', status: 'published' as const, is_test: false, sim_now: null,
  start_at: start, close_at: '2026-12-31T18:00:00+07:00', draw_at: '2026-12-31T19:00:00+07:00', frozen_at: null,
  theme: DEFAULT_THEME, venue: DEFAULT_VENUE, modules: DEFAULT_MODULES, rules: DEFAULT_RULES,
  created_at: start, updated_at: start, announced_at: null,
};
assert.equal(computeStatus(base, false, Date.parse('2026-10-20T00:00:00Z')), 'scheduled');
assert.equal(computeStatus(base, false, Date.parse('2026-11-10T00:00:00Z')), 'running');
assert.equal(computeStatus(base, false, Date.parse('2026-12-31T11:30:00Z')), 'closed');
assert.equal(computeStatus(base, true, Date.parse('2026-12-31T12:30:00Z')), 'drawn');
assert.equal(computeStatus({ ...base, status: 'draft' }, false, Date.now()), 'draft');
// L8b announce-mode label: waiting for announcement only while pre-publish
const ann = { ...base, rules: { ...DEFAULT_RULES, draw_mode: 'announce' as const } };
const beforeDraw = Date.parse('2026-12-31T11:30:00Z');
const afterDraw = Date.parse('2026-12-31T12:30:00Z');
assert.equal(statusLabel(ann, 'drawn', beforeDraw), 'Menunggu pengumuman');
assert.equal(statusLabel(ann, 'drawn', afterDraw), 'Selesai diundi');
assert.equal(statusLabel({ ...ann, announced_at: '2026-12-31T12:00:00Z' }, 'drawn', beforeDraw), 'Selesai diundi');
assert.equal(statusLabel(base, 'drawn', beforeDraw), 'Selesai diundi');
assert.equal(statusLabel(ann, 'closed', beforeDraw), 'Ditutup');
// L9 validation
const input = { name: 'Natal', start_at: start, close_at: base.close_at, draw_at: base.draw_at, is_test: false,
  theme: DEFAULT_THEME, venue: DEFAULT_VENUE, modules: DEFAULT_MODULES, rules: DEFAULT_RULES };
assert.equal(validateCampaignInput(input), null);
assert.match(validateCampaignInput({ ...input, draw_at: '2026-12-31T17:00:00+07:00' }) ?? '', /undian/);
assert.match(validateCampaignInput({ ...input, rules: { ...DEFAULT_RULES, grand_top_n: 0 } }) ?? '', /1–500/);
// L10 top-N model: default N = 10, threshold keys gone, prize_not_drawable has copy
assert.equal(DEFAULT_RULES.grand_top_n, 10);
assert.ok(!('grand_checkin_pct' in DEFAULT_RULES));
assert.match(rpcErrorMessage('prize_not_drawable'), /tidak diundi/);
assert.equal(rpcErrorMessage('not_frozen'), 'Peserta belum dibekukan. Klik "Bekukan peserta" dulu.');
assert.equal(rpcErrorMessage('prize_exhausted'), 'Semua unit hadiah ini sudah diundi.');
assert.equal(rpcErrorMessage('pool_empty'), 'Peserta untuk jenis hadiah ini sudah habis.');
// L10b draw opt-out codes (plan 4 Task 5); 'not_frozen' must not be shadowed by 'frozen'
assert.match(rpcErrorMessage('already_won'), /sudah menang/);
assert.match(rpcErrorMessage('already_excluded'), /sudah dikecualikan/);
assert.match(rpcErrorMessage('frozen'), /sudah dibekukan/);
assert.equal(rpcErrorMessage('not_frozen'), 'Peserta belum dibekukan. Klik "Bekukan peserta" dulu.');

// L11 hardening helpers
assert.ok(isUuid('123e4567-e89b-12d3-a456-426614174000'));
assert.ok(!isUuid('not-a-uuid') && !isUuid('') && !isUuid(null) && !isUuid("123e4567-e89b-12d3-a456-42661417400'"));
const pre = campaignAssetPrefix('https://x.supabase.co/');
assert.equal(pre, 'https://x.supabase.co/storage/v1/object/public/campaign-assets/');
assert.equal(sanitizeAssetUrl(`${pre}abc/hero-1.png`, pre), `${pre}abc/hero-1.png`);
assert.equal(sanitizeAssetUrl('https://evil.example/a.png', pre), null);
assert.equal(sanitizeAssetUrl(`${pre}../x`, pre), null);
assert.equal(sanitizeAssetUrl(`${pre}%2e%2e/other/x.png`, pre), null);
assert.equal(sanitizeAssetUrl(`${pre}%2E%2E/other/x.png`, pre), null);
assert.equal(sanitizeAssetUrl(`${pre}a%2fb.png`, pre), null);
assert.equal(sanitizeAssetUrl(`${pre}a\\b.png`, pre), null);
assert.equal(sanitizeAssetUrl('https://y.supabase.co/storage/v1/object/public/campaign-assets/a.png', pre), null);
assert.equal(sanitizeAssetUrl('http://x.supabase.co/storage/v1/object/public/campaign-assets/a.png', pre), null);
assert.equal(sanitizeAssetUrl('/storage/v1/object/public/campaign-assets/a.png', pre), null);
assert.equal(sanitizeAssetUrl(`${pre}a/b.png?x=1#h`, pre), `${pre}a/b.png`);
assert.equal(campaignAssetPrefix(''), null);
assert.equal(campaignAssetPrefix('http://x.supabase.co'), null);
assert.equal(sanitizeAssetUrl(`${pre}a.png`, campaignAssetPrefix('')), null);
assert.equal(sanitizeCampaignInput({ ...input, theme: { ...DEFAULT_THEME, hero_url: `${pre}a.png` } }, null).theme.hero_url, null);
assert.equal(sanitizeAssetUrl(5, pre), null);
const dirty = sanitizeCampaignInput({ ...input, name: ' Natal ', extra: 1,
  theme: { ...DEFAULT_THEME, hero_url: 'https://evil.example/a.png', banner_url: `${pre}a/b.png`, junk: 1 },
  rules: { ...DEFAULT_RULES, grand_top_n: '5', evil: 1 }, modules: { ...DEFAULT_MODULES, x: true } } as never, pre);
assert.equal(dirty.name, 'Natal');
assert.ok(!('extra' in dirty) && !('junk' in dirty.theme) && !('evil' in dirty.rules) && !('x' in dirty.modules));
assert.equal(dirty.theme.hero_url, null);
assert.equal(dirty.theme.banner_url, `${pre}a/b.png`);
assert.ok(Number.isNaN(dirty.rules.grand_top_n));
assert.match(validateCampaignInput(dirty) ?? '', /1–500/);
assert.deepEqual(sanitizeCampaignInput(input, pre).rules, DEFAULT_RULES);

// Task 6: question CSV (quoted commas, escaped quotes, CRLF, BOM, header-case, bad row line number)
const qcsv = '\uFEFFprompt,option_a,option_b,correct,category,difficulty\r\n"Siapa, kah ""dia""?",Yesus,Musa,A,Alkitab,2\r\nIbu kota Indonesia?,Jakarta,Bandung,a,umum,1\r\n';
const qp = parseQuestionCsv(qcsv);
assert.equal(qp.errors.length, 0);
assert.equal(qp.rows.length, 2);
assert.equal(qp.rows[0].prompt, 'Siapa, kah "dia"?');
assert.equal(qp.rows[0].correct, 'a');
assert.equal(qp.rows[0].category, 'alkitab');
assert.match(parseQuestionCsv(qcsv + 'Tes soal bagus,x,y,c,umum,1\n').errors[0], /^Baris 4: /);
assert.match(parseQuestionCsv('prompt,option_a\n').errors[0], /Header harus persis/);
assert.match(parseQuestionCsv('prompt,option_a,option_b,correct,category,difficulty\n"abc,d,e,a,umum,1\n').errors[0], /Tanda kutip tidak ditutup/);

// T7 out-of-period slots: close 26 Dec 00:00 WIB -> last day 25 Dec; start Mon 16 Nov (week 6 = 21-27 Dec, Monday 21 Dec <= 25 Dec; week 7 Monday 28 Dec)
{
  const s7 = '2026-11-16T00:00:00+07:00';
  const c7 = '2026-12-26T00:00:00+07:00';
  assert.equal(slotOutOfPeriod(s7, c7, { kind: 'daily', for_date: '2026-12-25', week_no: null }), false);
  assert.equal(slotOutOfPeriod(s7, c7, { kind: 'daily', for_date: '2026-12-26', week_no: null }), true);
  assert.equal(slotOutOfPeriod(s7, c7, { kind: 'weekly', for_date: null, week_no: 6 }), false);
  assert.equal(slotOutOfPeriod(s7, c7, { kind: 'weekly', for_date: null, week_no: 7 }), true);
}

// Announce mode: draw_mode helper, publish clock, locks, preserved by sanitize
assert.equal(drawModeOf(undefined), 'live');
assert.equal(drawModeOf({ draw_mode: 'foo' }), 'live');
assert.equal(drawModeOf({ draw_mode: 'announce' }), 'announce');
{
  const T = Date.parse('2026-12-31T19:00:00+07:00');
  const ann = { draw_mode: 'announce' as const, draw_at: '2026-12-31T19:00:00+07:00', announced_at: null, is_test: false, sim_now: null };
  assert.equal(isPrePublish(ann, T - 1000), true);
  assert.equal(isPrePublish({ ...ann, draw_mode: 'live' }, T - 1000), false);
  assert.equal(drawAtLocked({ ...ann, draw_mode: 'live' }, true, T - 1000), true);
  assert.equal(drawAtLocked(ann, true, T - 1000), false);
  assert.equal(drawAtLocked(ann, true, T), true);
  assert.equal(drawAtLocked({ ...ann, announced_at: '2026-12-31T12:00:05Z' }, true, T - 1000), true);
  assert.equal(drawAtLocked({ ...ann, is_test: true, sim_now: '2026-12-31T19:00:01+07:00' }, true, T - 1000), true);
}
assert.equal(sanitizeCampaignInput({ ...input, rules: { ...DEFAULT_RULES, draw_mode: 'announce' } }, null).rules.draw_mode, 'announce');
assert.equal(sanitizeCampaignInput({ ...input, rules: { ...DEFAULT_RULES, draw_mode: 'zzz' } } as never, null).rules.draw_mode, 'live');
assert.notEqual(validateCampaignInput({ ...input, rules: { ...DEFAULT_RULES, draw_mode: 'x' } } as never), null);
assert.equal(rpcErrorMessage('already_published'), 'Pemenang sudah diumumkan. Undi ulang tidak bisa lagi.');
assert.equal(rpcErrorMessage('invalid_reason'), 'Pilih alasan undi ulang.');
assert.equal(rpcErrorMessage('not_announce_mode'), 'Undi ulang hanya untuk campaign mode pengumuman.');

{
  const P = campaignAssetPrefix('https://x.supabase.co')!;
  assert.equal(assetObjectPath(`${P}c1/banner-a.jpg`, P), 'c1/banner-a.jpg');
  assert.equal(assetObjectPath(`${P}c1/banner-a.jpg?t=1`, P), 'c1/banner-a.jpg');
  assert.equal(assetObjectPath(P, P), null);
  assert.equal(assetObjectPath('https://x.supabase.co/storage/v1/object/public/avatars/a.jpg', P), null);
  assert.equal(assetObjectPath(`${P}c1/../avatars/a.jpg`, P), null);
  assert.equal(assetObjectPath(`${P}c1/a.jpg`, null), null);
  // Hostile inputs: encoded traversal, hash dropped, lookalike hosts, other bucket with same prefix start
  assert.equal(assetObjectPath(`${P}%2e%2e/avatars/a.jpg`, P), null);
  assert.equal(assetObjectPath(`${P}c1/%2E%2E/a.jpg`, P), null);
  assert.equal(assetObjectPath(`${P}c1/a%2fb.jpg`, P), null);
  assert.equal(assetObjectPath(`${P}c1/a.jpg#frag`, P), 'c1/a.jpg');
  assert.equal(assetObjectPath(`${P}c1/a.jpg#../../avatars/x`, P), null);
  assert.equal(assetObjectPath('https://x.supabase.co.evil.example/storage/v1/object/public/campaign-assets/c1/a.jpg', P), null);
  assert.equal(assetObjectPath('https://evil.example/https://x.supabase.co/storage/v1/object/public/campaign-assets/c1/a.jpg', P), null);
  assert.equal(assetObjectPath('https://x.supabase.co@evil.example/storage/v1/object/public/campaign-assets/c1/a.jpg', P), null);
  assert.equal(assetObjectPath('https://x.supabase.co/storage/v1/object/public/campaign-assets-x/c1/a.jpg', P), null);
  assert.equal(assetObjectPath(`${P}?x=1`, P), null);
  assert.equal(assetObjectPath(42, P), null);
  assert.deepEqual(droppedAssetUrls(['a', 'b', null, 'a'], ['b', null]), ['a']);
  assert.deepEqual(droppedAssetUrls([null, ''], []), []);
  assert.deepEqual(
    unreferencedPaths(['c1/a.jpg', 'c1/b.jpg', 'c2/a.jpg'], [`${P}c1/a.jpg`, null, `${P}c2/a.jpg`], P),
    ['c1/b.jpg'],
  );
  assert.deepEqual(unreferencedPaths(['c1/a.jpg'], [], null), []);
}

// L-W1..5 grand_top_weight (absent = legacy grand-from-top-N; 1–5 = whole congregation)
{
  assert.equal(grandTopWeightOf({}), null);
  assert.equal(grandTopWeightOf(null), null);
  assert.equal(grandTopWeightOf({ grand_top_weight: 3 }), 3);
  assert.equal(grandTopWeightOf({ grand_top_weight: 9 }), 5);
  assert.equal(grandTopWeightOf({ grand_top_weight: 0 }), 1);
  assert.equal(grandTopWeightOf({ grand_top_weight: '3' }), null);
  assert.equal(GRAND_TOP_WEIGHT_DEFAULT, 3);
  assert.equal(defaultCampaignInput(Date.parse('2026-10-24T00:00:00Z')).rules.grand_top_weight, 3);
  assert.equal('grand_top_weight' in DEFAULT_RULES, false);
  const base = defaultCampaignInput(Date.parse('2026-10-24T00:00:00Z'));
  const withRules = (r: Record<string, unknown>) => ({ ...base, name: 'Natal', rules: { ...DEFAULT_RULES, ...r } }) as never;
  assert.equal('grand_top_weight' in sanitizeCampaignInput(withRules({}), null).rules, false);
  assert.equal(sanitizeCampaignInput(withRules({ grand_top_weight: 2 }), null).rules.grand_top_weight, 2);
  assert.ok(Number.isNaN(sanitizeCampaignInput(withRules({ grand_top_weight: 'x' }), null).rules.grand_top_weight));
  assert.equal(typeof validateCampaignInput(sanitizeCampaignInput(withRules({ grand_top_weight: 'x' }), null)), 'string');
  assert.equal(validateCampaignInput(sanitizeCampaignInput(withRules({}), null)), null);
  for (const ok of [1, 2, 3, 4, 5]) assert.equal(validateCampaignInput(sanitizeCampaignInput(withRules({ grand_top_weight: ok }), null)), null);
  for (const bad of [6, 0, 1.5]) {
    assert.equal(validateCampaignInput(sanitizeCampaignInput(withRules({ grand_top_weight: bad }), null)), 'Kelipatan kesempatan 10 besar harus 1–5.');
  }
}

console.log('check-campaign-lib: all assertions passed');
