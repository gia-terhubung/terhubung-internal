// Pure helpers for the live draw (operator console + stage). Only relative
// `import type` (erased by Node's type stripping), so
// `node --test src/libs/campaignDraw.test.ts` runs it directly.
// Error copy and isUuid live in ./campaign.ts (plan 2): reuse them, never duplicate.

import type { PrizeType } from '../types/campaign.types';
import type { DrawAllReport } from '../types/campaignDraw.types';

/** Drawable prize types. 'top' (hadiah tetap) is never drawn. */
export type DrawPrizeType = Exclude<PrizeType, 'top'>;

export interface ReelName {
  display_name: string;
  church_name: string;
}

export interface WinnerLike extends ReelName {
  id: string;
  drawn_at: string;
}

/** Draw-night order: normal prizes warm up the room, the grand prize (drawn from the top N) closes.
 *  'top' prizes are fixed (not drawn) and are dropped from the queue. */
export function orderPrizesForDraw<T extends { prize_type: string; sort_order: number; name: string }>(
  prizes: T[]
): (T & { prize_type: DrawPrizeType })[] {
  return prizes
    .filter((p): p is T & { prize_type: DrawPrizeType } => p.prize_type === 'normal' || p.prize_type === 'grand')
    .sort((a, b) => {
      if (a.prize_type !== b.prize_type) return a.prize_type === 'normal' ? -1 : 1;
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.name.localeCompare(b.name);
    });
}

/**
 * Winners not yet in `known`, oldest first. The caller records the returned
 * ids, which makes poll + realtime double-fires and stage reloads no-ops.
 */
export function takeNewWinners<T extends WinnerLike>(known: ReadonlySet<string>, winners: T[]): T[] {
  return winners
    .filter((w) => !known.has(w.id))
    .sort((a, b) => Date.parse(a.drawn_at) - Date.parse(b.drawn_at) || a.id.localeCompare(b.id));
}

/** Slot-reel tick delays: fast start, quadratic ease-out to slow, ~totalMs overall. */
export function reelDelays(totalMs = 5000, fromMs = 60, toMs = 420): number[] {
  const delays: number[] = [];
  let elapsed = 0;
  while (elapsed < totalMs && delays.length < 500) {
    const t = elapsed / totalMs;
    const d = Math.round(fromMs + (toMs - fromMs) * t * t);
    delays.push(d);
    elapsed += d;
  }
  return delays;
}

/**
 * Names shown by the reel, ending on the winner. The winner is kept out of the
 * earlier ticks so the landing reads as the reveal; a tiny or empty pool
 * cycles whatever is available (falling back to the winner alone).
 */
export function buildReel(pool: ReelName[], winner: ReelName, length: number): ReelName[] {
  if (length <= 1) return [winner];
  const others = pool.filter(
    (n) => !(n.display_name === winner.display_name && n.church_name === winner.church_name)
  );
  const source = others.length > 0 ? others : [winner];
  const reel: ReelName[] = [];
  for (let i = 0; i < length - 1; i++) reel.push(source[i % source.length]);
  reel.push(winner);
  return reel;
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (h >= 24) return `${Math.floor(h / 24)} hari ${pad(h % 24)}:${pad(m)}:${pad(s)}`;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function formatCount(n: number): string {
  return n.toLocaleString('id-ID');
}

/**
 * Participants still drawable per type: frozen pool rows minus users who
 * already won that type (winners are unique per user+type, so a count works).
 * Users who left the church after freeze are skipped by draw_next on top of
 * this, so this is an upper bound.
 */
export function poolLeftByType(
  pool: { normal: number; grand: number },
  winners: { prize_type: DrawPrizeType }[]
): { normal: number; grand: number } {
  const won = { normal: 0, grand: 0 };
  for (const w of winners) won[w.prize_type] += 1;
  return {
    normal: Math.max(0, pool.normal - won.normal),
    grand: Math.max(0, pool.grand - won.grand),
  };
}

/** Units of a prize that cannot be drawn because too few participants are left. */
export function prizeShortfall(remaining: number, poolLeft: number): number {
  return Math.max(0, remaining - poolLeft);
}

/** Per-prize shortfall in queue order: earlier prizes of the same type use up the pool first. */
export function queueShortfalls(
  prizes: { id: string; prize_type: DrawPrizeType; quantity: number; drawn: number }[],
  poolLeft: { normal: number; grand: number }
): Record<string, { shortfall: number; left: number }> {
  const used = { normal: 0, grand: 0 };
  const out: Record<string, { shortfall: number; left: number }> = {};
  for (const p of prizes) {
    const remaining = Math.max(0, p.quantity - p.drawn);
    const left = Math.max(0, poolLeft[p.prize_type] - used[p.prize_type]);
    out[p.id] = { shortfall: prizeShortfall(remaining, left), left };
    used[p.prize_type] += remaining;
  }
  return out;
}

export interface DrawUnit {
  prize_id: string;
  prize_type: DrawPrizeType;
}

/** Announce mode "Undi semua": every remaining unit, in the given (already ordered) prize sequence. */
export function drawAllUnits<T extends { id: string; prize_type: DrawPrizeType; quantity: number; drawn: number }>(
  prizes: T[]
): DrawUnit[] {
  const units: DrawUnit[] = [];
  for (const p of prizes) {
    for (let i = p.drawn; i < p.quantity; i++) units.push({ prize_id: p.id, prize_type: p.prize_type });
  }
  return units;
}

/**
 * Draws units one at a time (one drawOne call each, so no single server call grows with the prize count).
 * Pool empty: that prize is marked stopped and the rest of its prize type is skipped (also marked stopped);
 * the other type goes on.
 * Any other error stops the run. onProgress gets the number of units handled (drawn or skipped).
 */
export async function runDrawAll(
  units: DrawUnit[],
  drawOne: (prizeId: string) => Promise<{ ok: true } | { ok: false; error: string }>,
  isPoolEmpty: (error: string) => boolean,
  onProgress?: (done: number) => void
): Promise<DrawAllReport> {
  const perPrize: DrawAllReport['perPrize'] = [];
  const byId = new Map<string, DrawAllReport['perPrize'][number]>();
  const emptyTypes = new Set<DrawPrizeType>();
  let drawn = 0;
  let done = 0;
  for (const u of units) {
    let row = byId.get(u.prize_id);
    if (!row) {
      row = { prize_id: u.prize_id, drawn: 0, stopped: null };
      byId.set(u.prize_id, row);
      perPrize.push(row);
    }
    if (emptyTypes.has(u.prize_type)) {
      row.stopped = 'pool_empty'; // a later prize of an exhausted type: not called, same reason
    } else {
      const res = await drawOne(u.prize_id);
      if (res.ok) {
        row.drawn += 1;
        drawn += 1;
      } else if (isPoolEmpty(res.error)) {
        row.stopped = 'pool_empty';
        emptyTypes.add(u.prize_type);
      } else {
        return { drawn, perPrize, error: res.error };
      }
    }
    done += 1;
    onProgress?.(done);
  }
  return { drawn, perPrize, error: null };
}
