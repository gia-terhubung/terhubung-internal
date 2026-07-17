// Shared helpers for server-paginated list pages.

export const PAGE_SIZE = 15;

export interface Paged<T> {
  rows: T[];
  total: number;
  // Effective page after clamping (a stale ?page=99 URL clamps to the last page).
  page: number;
}

// Escape LIKE metacharacters so a query of `%`/`_` matches those literals
// instead of acting as wildcards (\ is the default ILIKE escape char).
export function escapeLike(raw: string): string {
  return raw.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// Build a PostgREST `.or()` filter string matching `raw` against any of the
// columns via ILIKE. Values are double-quoted so `,`/`(`/`)` in the search
// term can't break (or inject into) the or() syntax.
export function orIlike(columns: string[], raw: string): string {
  const p = escapeLike(raw).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return columns.map((c) => `${c}.ilike."%${p}%"`).join(',');
}

// Clamp a 1-based page number against a row count.
export function clampPage(page: number, total: number): number {
  return Math.min(Math.max(1, page), Math.max(1, Math.ceil(total / PAGE_SIZE)));
}

// Range bounds for `.range(from, to)` on a 1-based page.
export function pageRange(page: number): { from: number; to: number } {
  const from = (page - 1) * PAGE_SIZE;
  return { from, to: from + PAGE_SIZE - 1 };
}
