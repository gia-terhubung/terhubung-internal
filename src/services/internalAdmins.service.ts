import 'server-only';
import { requireInternalAdmin } from '@/services/auth.service';
import { createAdminClient } from '@/libs/supabase/admin';
import type { StaffAccount } from '@/types/internal.types';

export async function listInternalAdmins(): Promise<StaffAccount[]> {
  await requireInternalAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('internal_list_admins');
  if (error) throw new Error(error.message);
  return (data as StaffAccount[]) ?? [];
}
