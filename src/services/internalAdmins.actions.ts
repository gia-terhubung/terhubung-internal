'use server';

import { revalidatePath } from 'next/cache';
import { requireInternalAdmin, ALLOWED_DOMAIN } from '@/services/auth.service';
import { createAdminClient } from '@/libs/supabase/admin';
import type { ActionResult } from '@/types/internal.types';

// Feature D — invite another internal admin (email-only, no phone).
export async function inviteInternalAdminAction(input: {
  email: string;
  fullName?: string;
}): Promise<ActionResult> {
  const { user } = await requireInternalAdmin();

  const email = input.email.trim().toLowerCase();
  if (!email.endsWith(ALLOWED_DOMAIN)) {
    return { ok: false, error: `Hanya email ${ALLOWED_DOMAIN}.` };
  }

  const admin = createAdminClient();

  // Create the auth user via an invite email. Email-only — never set a phone,
  // which keeps the account unusable on the phone-keyed mobile app.
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: input.fullName?.trim() || email.split('@')[0] },
  });
  if (error || !data?.user) {
    return { ok: false, error: error?.message ?? 'Gagal membuat pengguna.' };
  }

  // Add to the allowlist via the locked-down RPC.
  const { error: rpcErr } = await admin.rpc('internal_add_admin', {
    p_user_id: data.user.id,
    p_email: email,
    p_invited_by: user.id,
  });
  if (rpcErr) {
    // Roll back the orphaned auth user so state stays consistent.
    await admin.auth.admin.deleteUser(data.user.id);
    return { ok: false, error: rpcErr.message };
  }

  revalidatePath('/admins');
  return { ok: true };
}

// Feature D — activate / deactivate an internal admin.
export async function setAdminActiveAction(input: {
  userId: string;
  active: boolean;
}): Promise<ActionResult> {
  const { user } = await requireInternalAdmin();

  // Guard against locking yourself out.
  if (input.userId === user.id && !input.active) {
    return { ok: false, error: 'Tidak dapat menonaktifkan akun Anda sendiri.' };
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc('internal_set_active', {
    p_user_id: input.userId,
    p_active: input.active,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/admins');
  return { ok: true };
}
