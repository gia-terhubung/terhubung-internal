import 'server-only';
import { createAdminClient } from '@/libs/supabase/admin';
import { assetObjectPath, campaignAssetPrefix, sanitizeAssetUrl } from '@/libs/campaign';

/**
 * Removes campaign-assets objects for URLs that no row references any more
 * (any campaign theme banner_url/hero_url, any prize image_url — "Duplikat"
 * copies URLs). Call only AFTER the DB write succeeded and only from an action
 * that already passed requireInternalAdmin(). Never throws: a failed reference
 * query keeps the object, a failed delete is only logged.
 */
export async function removeUnreferencedAssets(urls: string[]): Promise<void> {
  try {
    const prefix = campaignAssetPrefix(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
    const db = createAdminClient().schema('campaign');
    const paths: string[] = [];
    for (const url of urls) {
      const path = assetObjectPath(url, prefix);
      const clean = sanitizeAssetUrl(url, prefix);
      if (path === null || clean === null || paths.includes(path)) continue;
      // Prefix match on the clean URL: also catches a stored copy with a query
      // string. Over-matching only keeps more objects, never deletes more.
      const pattern = `${clean}%`;
      const res = await Promise.all([
        db.from('campaigns').select('id', { count: 'exact', head: true }).like('theme->>banner_url', pattern),
        db.from('campaigns').select('id', { count: 'exact', head: true }).like('theme->>hero_url', pattern),
        db.from('prizes').select('id', { count: 'exact', head: true }).like('image_url', pattern),
      ]);
      if (res.some((r) => r.error || r.count === null || r.count > 0)) continue;
      paths.push(path);
    }
    if (paths.length === 0) return;
    const { error } = await createAdminClient().storage.from('campaign-assets').remove(paths);
    if (error) console.error('[campaign-assets] cleanup', error);
  } catch (e) {
    console.error('[campaign-assets] cleanup', e);
  }
}
