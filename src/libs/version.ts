// Version helpers for app_version_config — same semantics as the mobile app's
// update gate (split on '.', numeric compare per segment).

export function isValidVersion(v: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(v);
}

export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (Number.isNaN(x) || Number.isNaN(y)) return 0; // garbage → treat as equal
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}
