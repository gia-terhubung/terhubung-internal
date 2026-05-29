// Free-text contact validation. Mirrors public.normalize_id_phone /
// public.is_valid_id_phone in the database (the source of truth on write); these
// run client/server-side for early, friendly rejection before the DB CHECK.

export function normalizeIdPhone(raw: string): string {
  if (!raw || !raw.trim()) return '';
  let v = raw.replace(/[^0-9+]/g, '');
  v = v.startsWith('+') ? '+' + v.slice(1).replace(/[^0-9]/g, '') : v.replace(/[^0-9]/g, '');
  if (v.startsWith('+62')) return '+62' + v.slice(3);
  if (v.startsWith('62')) return '+62' + v.slice(2);
  if (v.startsWith('0')) return '+62' + v.slice(1);
  return '+62' + v;
}

export function isValidIdPhone(raw: string): boolean {
  return /^\+62[1-9][0-9]{7,12}$/.test(normalizeIdPhone(raw));
}

export function isValidEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((raw ?? '').trim());
}
