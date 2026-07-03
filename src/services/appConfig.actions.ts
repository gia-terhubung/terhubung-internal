'use server';

import { revalidatePath } from 'next/cache';
import { requireInternalAdmin } from '@/services/auth.service';
import { createAdminClient } from '@/libs/supabase/admin';
import { compareVersions, isValidVersion } from '@/libs/version';
import type { ActionResult, UpdateAppVersionConfigInput } from '@/types/internal.types';

const ALLOWED_URL_SCHEMES = ['https://', 'itms-apps://', 'market://'];

// Force update is the highest-blast-radius knob in this console: raising
// min_version blocks every user below it until they update from the store.
// The mobile gate fails open on fetch errors, but NOT on a valid-wrong config.
export async function updateAppVersionConfigAction(
  input: UpdateAppVersionConfigInput
): Promise<ActionResult> {
  const { user } = await requireInternalAdmin();

  if (input.platform !== 'ios' && input.platform !== 'android') {
    return { ok: false, error: 'Platform tidak dikenal.' };
  }

  const latest = input.latestVersion.trim();
  const min = input.minVersion.trim();
  if (!isValidVersion(latest) || !isValidVersion(min)) {
    return { ok: false, error: 'Format versi harus x.y.z (angka).' };
  }
  // min > latest would force-update to a version that does not exist = lockout.
  if (compareVersions(min, latest) > 0) {
    return { ok: false, error: 'Versi minimum tidak boleh lebih tinggi dari versi terbaru.' };
  }

  const storeUrl = input.storeUrl?.trim() || null;
  if (storeUrl && !ALLOWED_URL_SCHEMES.some((s) => storeUrl.startsWith(s))) {
    return { ok: false, error: 'Store URL harus diawali https://, itms-apps://, atau market://.' };
  }

  const message = input.updateMessage?.trim() || null;
  if (message && message.length > 300) {
    return { ok: false, error: 'Pesan pembaruan maksimal 300 karakter.' };
  }

  const admin = createAdminClient();

  // Server-side force-update guard (client checks are bypassable).
  const { data: current, error: curErr } = await admin
    .from('app_version_config')
    .select('min_version')
    .eq('platform', input.platform)
    .maybeSingle();
  if (curErr) return { ok: false, error: curErr.message };
  if (!current) return { ok: false, error: 'Baris platform tidak ditemukan.' };

  const isRaisingMin = compareVersions(min, (current as { min_version: string }).min_version) > 0;
  if (isRaisingMin && !input.confirmForceUpdate) {
    return { ok: false, error: 'Menaikkan versi minimum membutuhkan konfirmasi force update.' };
  }

  // Update-only, never upsert. No touch trigger — set updated_at explicitly.
  const { data, error } = await admin
    .from('app_version_config')
    .update({
      latest_version: latest,
      min_version: min,
      update_message: message,
      store_url: storeUrl,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq('platform', input.platform)
    .select('platform');
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: 'Baris platform tidak ditemukan.' };

  revalidatePath('/app-config');
  return { ok: true };
}
