import 'server-only';
import { requireInternalAdmin } from '@/services/auth.service';
import { createAdminClient } from '@/libs/supabase/admin';
import type { AppVersionConfig, StaffAccount } from '@/types/internal.types';

/** Both platform rows (ios/android) with the last editor's email resolved. */
export async function getAppVersionConfigs(): Promise<AppVersionConfig[]> {
  await requireInternalAdmin();
  const admin = createAdminClient();

  const [{ data, error }, { data: staff }] = await Promise.all([
    admin
      .from('app_version_config')
      .select('platform, latest_version, min_version, update_message, store_url, updated_at, updated_by')
      .order('platform'),
    admin.rpc('internal_list_admins'),
  ]);
  if (error) throw new Error(error.message);

  const emails = new Map(((staff as StaffAccount[]) ?? []).map((s) => [s.user_id, s.email]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r): AppVersionConfig => ({
    platform: r.platform,
    latest_version: r.latest_version,
    min_version: r.min_version,
    update_message: r.update_message ?? null,
    store_url: r.store_url ?? null,
    updated_at: String(r.updated_at),
    updated_by: r.updated_by ?? null,
    updated_by_label: r.updated_by ? (emails.get(r.updated_by) ?? null) : null,
  }));
}
