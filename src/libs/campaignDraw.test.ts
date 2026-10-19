import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReel,
  formatCount,
  formatCountdown,
  orderPrizesForDraw,
  poolLeftByType,
  prizeShortfall,
  queueShortfalls,
  reelDelays,
  takeNewWinners,
} from './campaignDraw.ts';

const w = (id: string, drawn_at: string) => ({ id, drawn_at, display_name: `N${id}`, church_name: 'GKJ' });

test('orderPrizesForDraw puts normal before grand, then sort_order, and drops top prizes', () => {
  const out = orderPrizesForDraw([
    { prize_type: 'grand', sort_order: 0, name: 'Sepeda' },
    { prize_type: 'top', sort_order: 0, name: 'Paket Natal' },
    { prize_type: 'normal', sort_order: 2, name: 'Voucher B' },
    { prize_type: 'normal', sort_order: 1, name: 'Voucher A' },
  ]);
  assert.deepEqual(out.map((p) => p.name), ['Voucher A', 'Voucher B', 'Sepeda']);
});

test('takeNewWinners returns only unseen winners in drawn_at order', () => {
  const known = new Set(['a']);
  const out = takeNewWinners(known, [
    w('c', '2026-12-31T12:03:00+00:00'),
    w('a', '2026-12-31T12:01:00+00:00'),
    w('b', '2026-12-31T12:02:00.5+00:00'),
  ]);
  assert.deepEqual(out.map((x) => x.id), ['b', 'c']);
});

test('takeNewWinners is idempotent once ids are recorded (poll + realtime double-fire)', () => {
  const known = new Set<string>();
  const list = [w('a', '2026-12-31T12:01:00+00:00')];
  takeNewWinners(known, list).forEach((x) => known.add(x.id));
  assert.equal(takeNewWinners(known, list).length, 0);
});

test('stage reload: seeding known with existing winners replays nothing', () => {
  const existing = [w('a', '2026-12-31T12:01:00+00:00'), w('b', '2026-12-31T12:02:00+00:00')];
  const known = new Set(existing.map((x) => x.id));
  assert.equal(takeNewWinners(known, existing).length, 0);
});

test('reelDelays starts fast, never speeds up, and spends roughly the budget', () => {
  const d = reelDelays(5000, 60, 420);
  assert.equal(d[0], 60);
  for (let i = 1; i < d.length; i++) assert.ok(d[i] >= d[i - 1], `delay ${i} decreased`);
  const sum = d.reduce((a, b) => a + b, 0);
  assert.ok(sum >= 5000 && sum < 5000 + 420, `sum ${sum}`);
});

test('buildReel ends on the winner and avoids showing the winner early', () => {
  const winner = { display_name: 'Maria S.', church_name: 'GKJ' };
  const pool = [winner, { display_name: 'Budi', church_name: 'GKI' }, { display_name: 'Rut T.', church_name: 'HKBP' }];
  const reel = buildReel(pool, winner, 10);
  assert.equal(reel.length, 10);
  assert.deepEqual(reel[9], winner);
  assert.ok(reel.slice(0, 9).every((n) => n.display_name !== 'Maria S.'));
});

test('buildReel survives an empty or winner-only pool', () => {
  const winner = { display_name: 'Maria S.', church_name: 'GKJ' };
  assert.deepEqual(buildReel([], winner, 4), [winner, winner, winner, winner]);
  assert.deepEqual(buildReel([winner], winner, 1), [winner]);
});

test('formatCountdown pads, clamps at zero, and shows days past 24h', () => {
  assert.equal(formatCountdown(3_723_000), '01:02:03');
  assert.equal(formatCountdown(-5), '00:00:00');
  assert.equal(formatCountdown(90_000_000), '1 hari 01:00:00');
});

test('formatCount uses Indonesian grouping', () => {
  assert.equal(formatCount(2418), '2.418');
});

test('poolLeftByType subtracts winners of the same type only', () => {
  const left = poolLeftByType({ normal: 12, grand: 5 }, [
    { prize_type: 'normal' }, { prize_type: 'normal' }, { prize_type: 'grand' },
  ]);
  assert.deepEqual(left, { normal: 10, grand: 4 });
  assert.deepEqual(poolLeftByType({ normal: 1, grand: 0 }, [{ prize_type: 'normal' }, { prize_type: 'normal' }]), { normal: 0, grand: 0 });
});

test('prizeShortfall is how many units cannot be drawn', () => {
  assert.equal(prizeShortfall(15, 12), 3);
  assert.equal(prizeShortfall(2, 12), 0);
  assert.equal(prizeShortfall(0, 0), 0);
});

test('queueShortfalls spends the pool across prizes of the same type in queue order', () => {
  const out = queueShortfalls(
    [
      { id: 'a', prize_type: 'normal', quantity: 10, drawn: 0 },
      { id: 'b', prize_type: 'normal', quantity: 10, drawn: 0 },
      { id: 'g', prize_type: 'grand', quantity: 1, drawn: 0 },
    ],
    { normal: 12, grand: 10 }
  );
  assert.deepEqual(out, { a: { shortfall: 0, left: 12 }, b: { shortfall: 8, left: 2 }, g: { shortfall: 0, left: 10 } });
});
