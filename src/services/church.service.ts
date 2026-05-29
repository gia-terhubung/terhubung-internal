import 'server-only';
import { requireInternalAdmin } from '@/services/auth.service';
import { createAdminClient } from '@/libs/supabase/admin';
import type { ChurchCreationRow } from '@/types/internal.types';

export interface ChurchRow {
  id: string;
  name: string;
  synod: string | null;
  city: string | null;
  created_at: string;
}

export interface ChurchDetail extends ChurchRow {
  address: string | null;
  timezone: string;
  description: string | null;
  church_avatar_url: string | null;
  province: string | null;
  province_id: string | null;
  city_id: string | null;
  district: string | null;
  district_id: string | null;
  sub_district: string | null;
  sub_district_id: string | null;
}

export interface ChurchAdminRow {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
}

export interface ChurchContact {
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  contact_source: string;
  billing_same_as_contact: boolean;
  billing_name: string | null;
  billing_email: string | null;
  billing_phone: string | null;
}

export async function listChurches(): Promise<ChurchRow[]> {
  await requireInternalAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('churches')
    .select('id, name, synod, city, created_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as ChurchRow[]) ?? [];
}

export async function getChurch(id: string): Promise<ChurchDetail | null> {
  await requireInternalAdmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from('churches')
    .select(
      'id, name, synod, address, city, timezone, created_at, description, church_avatar_url, province, province_id, city_id, district, district_id, sub_district, sub_district_id'
    )
    .eq('id', id)
    .maybeSingle();
  return (data as ChurchDetail | null) ?? null;
}

export async function getChurchContact(churchId: string): Promise<ChurchContact | null> {
  await requireInternalAdmin();
  const admin = createAdminClient();
  const { data } = await admin
    .schema('billing')
    .from('church_contacts')
    .select(
      'contact_name, contact_email, contact_phone, contact_source, billing_same_as_contact, billing_name, billing_email, billing_phone'
    )
    .eq('church_id', churchId)
    .maybeSingle();
  return (data as ChurchContact | null) ?? null;
}

export async function getChurchAdmins(churchId: string): Promise<ChurchAdminRow[]> {
  await requireInternalAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('user_roles')
    .select('user_id, profiles(full_name, avatar_url)')
    .eq('church_id', churchId)
    .eq('role', 'church_admin');
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({
    user_id: r.user_id,
    full_name: r.profiles?.full_name ?? '(tanpa nama)',
    avatar_url: r.profiles?.avatar_url ?? null,
  }));
}

/** Global church creation history — all churches by date, with resolved creator. */
export async function listChurchCreationHistory(): Promise<ChurchCreationRow[]> {
  await requireInternalAdmin();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('churches')
    .select('id, name, created_at, created_by')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  const list = (data ?? []) as {
    id: string;
    name: string;
    created_at: string;
    created_by: string | null;
  }[];

  // Resolve creator: prefer internal-staff email, fall back to profile name.
  const creatorIds = Array.from(new Set(list.map((c) => c.created_by).filter(Boolean))) as string[];
  const emailByUid = new Map<string, string>();
  const nameByUid = new Map<string, string>();

  if (creatorIds.length) {
    const { data: staff } = await admin.rpc('internal_list_admins');
    for (const s of (staff ?? []) as { user_id: string; email: string }[]) {
      emailByUid.set(s.user_id, s.email);
    }
    const { data: profs } = await admin.from('profiles').select('id, full_name').in('id', creatorIds);
    for (const p of (profs ?? []) as { id: string; full_name: string }[]) {
      nameByUid.set(p.id, p.full_name);
    }
  }

  return list.map((c) => ({
    id: c.id,
    name: c.name,
    created_at: c.created_at,
    creator:
      (c.created_by && (emailByUid.get(c.created_by) || nameByUid.get(c.created_by))) || '—',
  }));
}
