// Run from terhubung-internal/: node scripts/check-campaign-lib.mts
// Pure-lib assertions (Node ≥ 23 strips TS types natively). Mirrors the SQL
// helper tests in terhubung-app/supabase/tests/campaign_1_schema.sql.
import assert from 'node:assert/strict';
import {
  DEFAULT_MODULES, DEFAULT_RULES, DEFAULT_THEME, DEFAULT_VENUE,
  campaignDays, computeStatus, isoToWibInput, parseCsv, parseQuestionCsv, rpcErrorMessage,
  countableWeeks, lastDay, resolveRequirements, toCsv, totalDays, validateCampaignInput, weekNo, weekRange, wibDate,
  wibInputToIso,
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
const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\n');
assert.deepEqual(rows, [['a', 'b'], ['x, y', 'say "hi"']]);
assert.equal(toCsv([['x, y', 'say "hi"', 3, null]]), '"x, y","say ""hi""",3,\r\n');
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
// L8 status lifecycle
const base = {
  id: 'x', name: 'Uji', status: 'published' as const, is_test: false, sim_now: null,
  start_at: start, close_at: '2026-12-31T18:00:00+07:00', draw_at: '2026-12-31T19:00:00+07:00', frozen_at: null,
  theme: DEFAULT_THEME, venue: DEFAULT_VENUE, modules: DEFAULT_MODULES, rules: DEFAULT_RULES,
  created_at: start, updated_at: start,
};
assert.equal(computeStatus(base, false, Date.parse('2026-10-20T00:00:00Z')), 'scheduled');
assert.equal(computeStatus(base, false, Date.parse('2026-11-10T00:00:00Z')), 'running');
assert.equal(computeStatus(base, false, Date.parse('2026-12-31T11:30:00Z')), 'closed');
assert.equal(computeStatus(base, true, Date.parse('2026-12-31T12:30:00Z')), 'drawn');
assert.equal(computeStatus({ ...base, status: 'draft' }, false, Date.now()), 'draft');
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

console.log('check-campaign-lib: all assertions passed');
