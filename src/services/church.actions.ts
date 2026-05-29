'use server';

import { revalidatePath } from 'next/cache';
import { requireInternalAdmin } from '@/services/auth.service';
import { createAdminClient } from '@/libs/supabase/admin';
import { isValidEmail, isValidIdPhone } from '@/libs/contact';
import type { ActionResult, AppUserResult, CreateChurchInput } from '@/types/internal.types';

// Feature A — create a church + its required contact atomically (free
// subscription auto-created by DB trigger inside the same transaction).
export async function createChurchAction(input: CreateChurchInput): Promise<ActionResult> {
  const { user } = await requireInternalAdmin();

  const name = input.name?.trim() ?? '';
  if (name.length < 3) return { ok: false, error: 'Nama gereja minimal 3 karakter.' };

  const contactName = input.contactName?.trim() ?? '';
  if (contactName.length < 2) return { ok: false, error: 'Nama kontak gereja minimal 2 karakter.' };
  if (!isValidEmail(input.contactEmail ?? '')) return { ok: false, error: 'Format email kontak tidak valid.' };
  if (!isValidIdPhone(input.contactPhone ?? '')) {
    return { ok: false, error: 'Nomor telepon kontak tidak valid (mis. 0812… atau +62812…).' };
  }

  const sameAs = input.billingSameAsContact ?? true;
  if (!sameAs) {
    if ((input.billingName?.trim() ?? '').length < 2) return { ok: false, error: 'Nama kontak billing minimal 2 karakter.' };
    if (!isValidEmail(input.billingEmail ?? '')) return { ok: false, error: 'Format email billing tidak valid.' };
    if (!isValidIdPhone(input.billingPhone ?? '')) return { ok: false, error: 'Nomor telepon billing tidak valid.' };
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc('internal_create_church_with_contact', {
    p_name: name,
    p_synod: input.synod?.trim() || null,
    p_address: input.address?.trim() || null,
    p_province: input.province?.trim() || null,
    p_province_id: input.province_id?.trim() || null,
    p_city: input.city?.trim() || null,
    p_city_id: input.city_id?.trim() || null,
    p_district: input.district?.trim() || null,
    p_district_id: input.district_id?.trim() || null,
    p_sub_district: input.sub_district?.trim() || null,
    p_sub_district_id: input.sub_district_id?.trim() || null,
    p_timezone: input.timezone?.trim() || 'Asia/Jakarta',
    p_created_by: user.id,
    p_contact_name: contactName,
    p_contact_email: input.contactEmail!.trim(),
    p_contact_phone: input.contactPhone!.trim(),
    p_billing_same: sameAs,
    p_billing_name: sameAs ? null : input.billingName!.trim(),
    p_billing_email: sameAs ? null : input.billingEmail!.trim(),
    p_billing_phone: sameAs ? null : input.billingPhone!.trim(),
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/churches');
  return { ok: true };
}

// Feature B (search) — find existing registered app users by name.
export async function searchAppUsersAction(query: string): Promise<AppUserResult[]> {
  await requireInternalAdmin();
  const q = query.trim();
  if (q.length < 2) return [];

  const admin = createAdminClient();
  const { data: profiles, error } = await admin
    .from('profiles')
    .select('id, full_name, avatar_url')
    .ilike('full_name', `%${q}%`)
    .limit(10);
  if (error) throw new Error(error.message);

  const ids = (profiles ?? []).map((p) => p.id);
  const rolesByUser = new Map<string, { church_id: string | null; role: string }>();
  if (ids.length) {
    const { data: roles } = await admin
      .from('user_roles')
      .select('user_id, church_id, role')
      .in('user_id', ids)
      .neq('role', 'superadmin');
    for (const r of roles ?? []) {
      if (!rolesByUser.has(r.user_id)) rolesByUser.set(r.user_id, { church_id: r.church_id, role: r.role });
    }
  }

  return (profiles ?? []).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    email: null,
    avatar_url: p.avatar_url,
    current_church_id: rolesByUser.get(p.id)?.church_id ?? null,
    current_role: rolesByUser.get(p.id)?.role ?? null,
  }));
}

// Feature B (assign) — make a registered user the church_admin of a church.
export async function assignChurchAdminAction(input: {
  userId: string;
  churchId: string;
}): Promise<ActionResult> {
  await requireInternalAdmin();
  if (!input.userId || !input.churchId) return { ok: false, error: 'Data tidak lengkap.' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('user_roles')
    .upsert(
      { user_id: input.userId, church_id: input.churchId, role: 'church_admin' },
      { onConflict: 'user_id, church_id, role' }
    );

  if (error) {
    // enforce_single_tenant_per_user raises this when the user belongs elsewhere.
    if (error.message.includes('sudah terdaftar di gereja lain')) {
      return { ok: false, error: 'Pengguna sudah terdaftar di gereja lain.' };
    }
    return { ok: false, error: error.message };
  }

  await seedContactFromAdmin(admin, input.churchId, input.userId);

  revalidatePath(`/churches/${input.churchId}`);
  return { ok: true };
}

// Feature A (edit) — upsert the church + billing contact. Works whether or not a
// contact row exists yet (e.g. backfilling a church created before this feature).
export async function updateChurchContactAction(input: {
  churchId: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  billingSameAsContact: boolean;
  billingName?: string;
  billingEmail?: string;
  billingPhone?: string;
}): Promise<ActionResult> {
  const { user } = await requireInternalAdmin();
  if (!input.churchId) return { ok: false, error: 'Data tidak lengkap.' };

  const contactName = input.contactName?.trim() ?? '';
  if (contactName.length < 2) return { ok: false, error: 'Nama kontak gereja minimal 2 karakter.' };
  if (!isValidEmail(input.contactEmail ?? '')) return { ok: false, error: 'Format email kontak tidak valid.' };
  if (!isValidIdPhone(input.contactPhone ?? '')) {
    return { ok: false, error: 'Nomor telepon kontak tidak valid (mis. 0812… atau +62812…).' };
  }

  const sameAs = input.billingSameAsContact ?? true;
  if (!sameAs) {
    if ((input.billingName?.trim() ?? '').length < 2) return { ok: false, error: 'Nama kontak billing minimal 2 karakter.' };
    if (!isValidEmail(input.billingEmail ?? '')) return { ok: false, error: 'Format email billing tidak valid.' };
    if (!isValidIdPhone(input.billingPhone ?? '')) return { ok: false, error: 'Nomor telepon billing tidak valid.' };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .schema('billing')
    .from('church_contacts')
    .upsert(
      {
        church_id: input.churchId,
        contact_name: contactName,
        contact_email: input.contactEmail.trim(),
        contact_phone: input.contactPhone.trim(),
        contact_source: 'manual',
        billing_same_as_contact: sameAs,
        billing_name: sameAs ? null : input.billingName!.trim(),
        billing_email: sameAs ? null : input.billingEmail!.trim(),
        billing_phone: sameAs ? null : input.billingPhone!.trim(),
        updated_by: user.id,
      },
      { onConflict: 'church_id' }
    );
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/churches/${input.churchId}`);
  return { ok: true };
}

// Feature A (edit) — update only the church location fields.
export async function updateChurchLocationAction(input: {
  churchId: string;
  province?: string;
  province_id?: string;
  city?: string;
  city_id?: string;
  district?: string;
  district_id?: string;
  sub_district?: string;
  sub_district_id?: string;
  address?: string;
}): Promise<ActionResult> {
  await requireInternalAdmin();
  if (!input.churchId) return { ok: false, error: 'Data tidak lengkap.' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('churches')
    .update({
      province: input.province?.trim() || null,
      province_id: input.province_id?.trim() || null,
      city: input.city?.trim() || null,
      city_id: input.city_id?.trim() || null,
      district: input.district?.trim() || null,
      district_id: input.district_id?.trim() || null,
      sub_district: input.sub_district?.trim() || null,
      sub_district_id: input.sub_district_id?.trim() || null,
      address: input.address?.trim() || null,
    })
    .eq('id', input.churchId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/churches/${input.churchId}`);
  return { ok: true };
}

// Best-effort: seed a billing contact from the newly-assigned admin's profile,
// but only if the church has none yet and the admin has a usable email + phone
// (contact columns are NOT NULL). Never overwrites an existing contact.
async function seedContactFromAdmin(
  admin: ReturnType<typeof createAdminClient>,
  churchId: string,
  userId: string
): Promise<void> {
  const { data: existing } = await admin
    .schema('billing')
    .from('church_contacts')
    .select('church_id')
    .eq('church_id', churchId)
    .maybeSingle();
  if (existing) return;

  const [{ data: profile }, { data: sensitive }, { data: authUser }] = await Promise.all([
    admin.from('profiles').select('full_name').eq('id', userId).maybeSingle(),
    admin.from('sensitive_profile').select('phone').eq('id', userId).maybeSingle(),
    admin.auth.admin.getUserById(userId),
  ]);

  const name = (profile?.full_name ?? '').trim();
  const email = authUser?.user?.email ?? '';
  const phone = sensitive?.phone ?? '';
  if (name.length < 2 || !isValidEmail(email) || !isValidIdPhone(phone)) return;

  // Best-effort: ignore insert errors so a seeding hiccup never blocks assignment.
  await admin.schema('billing').from('church_contacts').insert({
    church_id: churchId,
    contact_name: name,
    contact_email: email,
    contact_phone: phone,
    contact_source: 'auto',
    billing_same_as_contact: true,
  });
}
