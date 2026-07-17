import 'server-only';
import { requireInternalAdmin } from '@/services/auth.service';
import { createAdminClient } from '@/libs/supabase/admin';
import { clampPage, escapeLike, orIlike, pageRange, type Paged } from '@/libs/pagination';
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

export type ChurchSort = 'recent' | 'oldest' | 'name';

// Server-paginated church list: name/city search + sort + 15-row pages so the
// client never holds the full set.
export async function listChurchesPage(params: {
  page: number;
  search: string;
  sort: ChurchSort;
}): Promise<Paged<ChurchRow>> {
  await requireInternalAdmin();
  const admin = createAdminClient();
  const { search, sort } = params;

  let countQuery = admin.from('churches').select('id', { count: 'exact', head: true });
  if (search) countQuery = countQuery.or(orIlike(['name', 'city'], search));
  const { count, error: countError } = await countQuery;
  if (countError) throw new Error(countError.message);
  const total = count ?? 0;

  const page = clampPage(params.page, total);
  const { from, to } = pageRange(page);

  let rowsQuery = admin.from('churches').select('id, name, synod, city, created_at');
  if (search) rowsQuery = rowsQuery.or(orIlike(['name', 'city'], search));
  rowsQuery =
    sort === 'name'
      ? rowsQuery.order('name', { ascending: true })
      : rowsQuery.order('created_at', { ascending: sort === 'oldest' });
  const { data, error } = await rowsQuery.order('id').range(from, to);
  if (error) throw new Error(error.message);

  return { rows: (data as ChurchRow[]) ?? [], total, page };
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

export type HistorySort = 'recent' | 'oldest' | 'name';

/**
 * Global church creation history — server-paginated, with resolved creator.
 * Search matches church name, staff email, or creator profile name; creator
 * matching is best-effort (staff list filtered in JS + a capped profile-name
 * lookup) since `creator` is a derived column.
 */
export async function listChurchCreationHistoryPage(params: {
  page: number;
  search: string;
  sort: HistorySort;
}): Promise<Paged<ChurchCreationRow>> {
  await requireInternalAdmin();
  const admin = createAdminClient();
  const { search, sort } = params;

  // Staff emails are needed for creator labels on every page, and for creator
  // search when a query is set (the list is small — internal staff only).
  const { data: staff } = await admin.rpc('internal_list_admins');
  const emailByUid = new Map<string, string>();
  for (const s of (staff ?? []) as { user_id: string; email: string }[]) {
    emailByUid.set(s.user_id, s.email);
  }

  // Church-name term + creator-id term (creator resolved to candidate ids first).
  let orFilter = '';
  if (search) {
    const q = search.toLowerCase();
    const creatorIds = new Set<string>();
    for (const [uid, email] of emailByUid) {
      if (email.toLowerCase().includes(q)) creatorIds.add(uid);
    }
    const { data: profs } = await admin
      .from('profiles')
      .select('id')
      .ilike('full_name', `%${escapeLike(search)}%`)
      .limit(20);
    for (const p of (profs ?? []) as { id: string }[]) creatorIds.add(p.id);
    orFilter = orIlike(['name'], search);
    if (creatorIds.size) orFilter += `,created_by.in.(${Array.from(creatorIds).join(',')})`;
  }

  let countQuery = admin.from('churches').select('id', { count: 'exact', head: true });
  if (orFilter) countQuery = countQuery.or(orFilter);
  const { count, error: countError } = await countQuery;
  if (countError) throw new Error(countError.message);
  const total = count ?? 0;

  const page = clampPage(params.page, total);
  const { from, to } = pageRange(page);

  let rowsQuery = admin.from('churches').select('id, name, created_at, created_by');
  if (orFilter) rowsQuery = rowsQuery.or(orFilter);
  rowsQuery =
    sort === 'name'
      ? rowsQuery.order('name', { ascending: true })
      : rowsQuery.order('created_at', { ascending: sort === 'oldest' });
  const { data, error } = await rowsQuery.order('id').range(from, to);
  if (error) throw new Error(error.message);

  const list = (data ?? []) as {
    id: string;
    name: string;
    created_at: string;
    created_by: string | null;
  }[];

  // Resolve creator labels for this page only: staff email, else profile name.
  const pageCreatorIds = Array.from(
    new Set(list.map((c) => c.created_by).filter((id): id is string => !!id && !emailByUid.has(id)))
  );
  const nameByUid = new Map<string, string>();
  if (pageCreatorIds.length) {
    const { data: profs } = await admin.from('profiles').select('id, full_name').in('id', pageCreatorIds);
    for (const p of (profs ?? []) as { id: string; full_name: string }[]) {
      nameByUid.set(p.id, p.full_name);
    }
  }

  const rows = list.map((c) => ({
    id: c.id,
    name: c.name,
    created_at: c.created_at,
    creator:
      (c.created_by && (emailByUid.get(c.created_by) || nameByUid.get(c.created_by))) || '—',
  }));

  return { rows, total, page };
}
