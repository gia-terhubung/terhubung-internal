// List (and optionally remove) orphan objects in the campaign-assets bucket.
//
// An orphan is an object no row references: not any campaign.campaigns
// theme banner_url / hero_url, not any campaign.prizes image_url (any
// campaign — "Duplikat" copies URLs). Objects younger than 24 h are always
// skipped (an upload may not be saved yet). Any query error aborts with
// nothing deleted.
//
// Run from terhubung-internal/ (Node 23+, strips TS types natively):
//   node --env-file=.env.local scripts/campaign-assets-orphans.mts            # dry run (default)
//   node --env-file=.env.local scripts/campaign-assets-orphans.mts --delete   # list, then ask before removing exactly that list
// Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Points at PROD:
// run the dry run first and review the list before passing --delete.

import { createInterface } from 'node:readline/promises';
import { createClient } from '@supabase/supabase-js';
import { campaignAssetPrefix, unreferencedPaths } from '../src/libs/campaign.ts';

const BUCKET = 'campaign-assets';
const PAGE = 1000;
const MIN_AGE_MS = 24 * 60 * 60 * 1000;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const doDelete = process.argv.includes('--delete');

if (!url || !key) {
  console.error('Missing env. Run: node --env-file=.env.local scripts/campaign-assets-orphans.mts');
  process.exit(1);
}
const prefix = campaignAssetPrefix(url);
if (prefix === null) {
  console.error('NEXT_PUBLIC_SUPABASE_URL must be an https URL.');
  process.exit(1);
}

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const storage = admin.storage.from(BUCKET);
const db = admin.schema('campaign');

interface Obj { path: string; created_at: string | null; size: number | null }

// Unknown size → null (shown as "?"); a real 0-byte object stays 0.
function sizeOf(metadata: Record<string, unknown> | null): number | null {
  const v = metadata?.size;
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function listAll(folder: string): Promise<{ name: string; id: string | null; created_at: string | null; metadata: Record<string, unknown> | null }[]> {
  const out = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await storage.list(folder, { limit: PAGE, offset });
    if (error) throw new Error(`list ${folder || '/'}: ${error.message}`);
    out.push(...(data ?? []));
    if ((data ?? []).length < PAGE) return out;
  }
}

async function selectAll<T>(table: string, cols: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(table).select(cols).order('id').range(from, from + PAGE - 1);
    if (error) throw new Error(`select ${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if ((data ?? []).length < PAGE) return out;
  }
}

try {
  // 1. Objects: top-level folders (campaign ids), then their files. Entries without id are folders.
  const objects: Obj[] = [];
  for (const top of await listAll('')) {
    if (top.id) {
      objects.push({ path: top.name, created_at: top.created_at, size: sizeOf(top.metadata) });
      continue;
    }
    for (const f of await listAll(top.name)) {
      if (!f.id) {
        console.error(`warning: skipped folder ${top.name}/${f.name}/ (deeper than 2 levels, not scanned)`);
        continue;
      }
      objects.push({ path: `${top.name}/${f.name}`, created_at: f.created_at, size: sizeOf(f.metadata) });
    }
  }

  // 2. Referenced URLs from every campaign and prize.
  const campaigns = await selectAll<{ theme: { banner_url?: string | null; hero_url?: string | null } | null }>('campaigns', 'id, theme');
  const prizes = await selectAll<{ image_url: string | null }>('prizes', 'id, image_url');
  const referenced = [
    ...campaigns.flatMap((c) => [c.theme?.banner_url, c.theme?.hero_url]),
    ...prizes.map((p) => p.image_url),
  ];

  // 3. Orphans older than 24 h (unknown age counts as young → kept).
  const now = Date.now();
  const orphanSet = new Set(unreferencedPaths(objects.map((o) => o.path), referenced, prefix));
  const orphans = objects.filter((o) => {
    if (!orphanSet.has(o.path)) return false;
    const t = o.created_at ? Date.parse(o.created_at) : NaN;
    return Number.isFinite(t) && now - t >= MIN_AGE_MS;
  });

  for (const o of orphans) {
    const ageH = Math.floor((now - Date.parse(o.created_at!)) / 3_600_000);
    console.log(`${o.path}\t${o.size ?? '?'} B\t${ageH} h`);
  }
  const bytes = orphans.reduce((s, o) => s + (o.size ?? 0), 0);
  console.log(`${orphans.length} orphan(s), ${bytes} B (of ${objects.length} object(s) in ${BUCKET}).`);

  if (!doDelete) {
    console.log('DRY RUN — pass --delete to remove');
  } else if (orphans.length > 0) {
    // Delete exactly the list printed above, only after an explicit "y".
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = (await new Promise<string>((resolve) => {
      rl.once('close', () => resolve('')); // EOF / Ctrl-D = no
      rl.question(`Hapus ${orphans.length} objek? (y/N) `).then(resolve, () => resolve(''));
    })).trim();
    rl.close();
    if (answer !== 'y' && answer !== 'Y') {
      console.log('Dibatalkan — tidak ada yang dihapus.');
      process.exit(0);
    }
    let removed = 0;
    for (let i = 0; i < orphans.length; i += 100) {
      const chunk = orphans.slice(i, i + 100).map((o) => o.path);
      const { data, error } = await storage.remove(chunk);
      if (error) throw new Error(`remove: ${error.message} (removed ${removed} before this chunk)`);
      removed += (data ?? []).length;
    }
    console.log(`Removed ${removed} object(s).`);
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
