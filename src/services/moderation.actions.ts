'use server';

import { revalidatePath } from 'next/cache';
import { requireInternalAdmin } from '@/services/auth.service';
import { createAdminClient } from '@/libs/supabase/admin';
import type { ActionResult } from '@/types/internal.types';
import type { ResolveReportAction } from '@/types/moderation.types';

// Resolve a prayer/comment report via the service_role-only RPC.
// dismiss       — report-level; un-flags the target only when it was the last open report.
// remove        — soft-deletes the content and resolves ALL open reports on it.
// mark_actioned — resolves all open reports without touching the content.
export async function resolvePrayerReportAction(input: {
  reportId: string;
  action: ResolveReportAction;
  note?: string | null;
}): Promise<ActionResult> {
  const { user } = await requireInternalAdmin();

  if (!input.reportId) return { ok: false, error: 'Data tidak lengkap.' };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('internal_resolve_prayer_report', {
    p_report_id: input.reportId,
    p_action: input.action,
    p_reviewer: user.id,
    p_note: input.note?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };

  const result = data as { success: boolean; error?: string } | null;
  if (!result?.success) {
    return { ok: false, error: result?.error ?? 'Gagal memproses laporan.' };
  }

  revalidatePath('/moderation');
  return { ok: true };
}
