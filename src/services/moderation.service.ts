import 'server-only';
import { requireInternalAdmin } from '@/services/auth.service';
import { createAdminClient } from '@/libs/supabase/admin';
import type { StaffAccount } from '@/types/internal.types';
import type {
  ModerationGroup,
  ModerationTarget,
  PrayerReportRow,
  ReportStatus,
  UserBlockRow,
} from '@/types/moderation.types';

// Raw shapes from the FK-hinted embed query below.
interface RawProfile {
  id?: string;
  full_name: string | null;
}
interface RawReport {
  id: string;
  reason: string;
  status: ReportStatus;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  reporter: RawProfile | null;
  prayer: {
    id: string;
    content: string;
    anonymous: boolean | null;
    deleted_at: string | null;
    church_id: string | null;
    created_at: string | null;
    author: RawProfile | null;
    church: { id: string; name: string } | null;
  } | null;
  comment: {
    id: string;
    content: string | null;
    deleted_at: string | null;
    created_at: string | null;
    author: RawProfile | null;
    prayer: {
      id: string;
      content: string;
      deleted_at: string | null;
      church_id: string | null;
      church: { id: string; name: string } | null;
    } | null;
  } | null;
}

/**
 * All prayer/comment reports (most recent 300), grouped one row per reported
 * target. Explicit FK hints are required: prayers/prayer_comments each have
 * two FKs to profiles (user_id + deleted_by).
 */
export async function listPrayerReports(): Promise<ModerationGroup[]> {
  await requireInternalAdmin();
  const admin = createAdminClient();

  const [{ data, error }, staff] = await Promise.all([
    admin
      .from('prayer_reports')
      .select(
        `
        id, reason, status, created_at, reviewed_by, reviewed_at, review_note,
        reporter:profiles!prayer_reports_reported_by_fkey(full_name),
        prayer:prayers!prayer_reports_prayer_id_fkey(
          id, content, anonymous, deleted_at, church_id, created_at,
          author:profiles!prayers_user_id_fkey(id, full_name),
          church:churches!prayers_church_id_fkey(id, name)),
        comment:prayer_comments!prayer_reports_prayer_comment_id_fkey(
          id, content, deleted_at, created_at,
          author:profiles!prayer_comments_user_id_fkey(id, full_name),
          prayer:prayers!prayer_comments_prayer_id_fkey(id, content, deleted_at, church_id,
            church:churches!prayers_church_id_fkey(id, name)))
      `
      )
      .order('created_at', { ascending: false })
      .limit(300),
    listStaffEmailMap(),
  ]);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as RawReport[];
  const groups = new Map<string, ModerationGroup>();

  for (const r of rows) {
    // Comment wins when both ids are set — mirrors the resolution RPC.
    const isComment = r.comment != null;
    const target = isComment ? buildCommentTarget(r) : buildPrayerTarget(r);
    if (!target) continue; // hard-deleted target (CASCADE removed it mid-flight)

    const key = `${target.kind}:${target.id}`;
    const report: PrayerReportRow = {
      id: r.id,
      reason: r.reason,
      status: r.status,
      created_at: r.created_at,
      reporter_name: r.reporter?.full_name ?? null,
      reviewed_by: r.reviewed_by,
      reviewed_by_label: r.reviewed_by ? (staff.get(r.reviewed_by) ?? null) : null,
      reviewed_at: r.reviewed_at,
      review_note: r.review_note,
    };

    const existing = groups.get(key);
    if (existing) {
      existing.reports.push(report);
      if (report.status === 'open') existing.open_count += 1;
      if (report.created_at > existing.latest_report_at) existing.latest_report_at = report.created_at;
    } else {
      groups.set(key, {
        key,
        target,
        reports: [report],
        open_count: report.status === 'open' ? 1 : 0,
        latest_report_at: report.created_at,
      });
    }
  }

  // Open groups first, then most recently reported.
  return [...groups.values()].sort((a, b) => {
    const aOpen = a.open_count > 0 ? 1 : 0;
    const bOpen = b.open_count > 0 ? 1 : 0;
    if (aOpen !== bOpen) return bOpen - aOpen;
    return b.latest_report_at.localeCompare(a.latest_report_at);
  });
}

function buildPrayerTarget(r: RawReport): ModerationTarget | null {
  if (!r.prayer) return null;
  return {
    kind: 'prayer',
    id: r.prayer.id,
    content: r.prayer.content,
    deleted_at: r.prayer.deleted_at,
    author_id: r.prayer.author?.id ?? null,
    author_name: r.prayer.author?.full_name ?? null,
    anonymous: !!r.prayer.anonymous,
    church_id: r.prayer.church?.id ?? r.prayer.church_id,
    church_name: r.prayer.church?.name ?? null,
    created_at: r.prayer.created_at,
    parent_prayer_id: null,
    parent_prayer_content: null,
    parent_prayer_deleted: false,
  };
}

function buildCommentTarget(r: RawReport): ModerationTarget | null {
  if (!r.comment) return null;
  return {
    kind: 'comment',
    id: r.comment.id,
    content: r.comment.content, // NULL = "Amen"
    deleted_at: r.comment.deleted_at,
    author_id: r.comment.author?.id ?? null,
    author_name: r.comment.author?.full_name ?? null,
    anonymous: false,
    church_id: r.comment.prayer?.church?.id ?? r.comment.prayer?.church_id ?? null,
    church_name: r.comment.prayer?.church?.name ?? null,
    created_at: r.comment.created_at,
    parent_prayer_id: r.comment.prayer?.id ?? null,
    parent_prayer_content: r.comment.prayer?.content ?? null,
    parent_prayer_deleted: !!r.comment.prayer?.deleted_at,
  };
}

async function listStaffEmailMap(): Promise<Map<string, string>> {
  const admin = createAdminClient();
  const { data } = await admin.rpc('internal_list_admins');
  return new Map(((data as StaffAccount[]) ?? []).map((s) => [s.user_id, s.email]));
}

/** user_blocks overview — total count + the 50 most recent pairs. Read-only. */
export async function listUserBlocks(): Promise<{ total: number; rows: UserBlockRow[] }> {
  await requireInternalAdmin();
  const admin = createAdminClient();

  const [{ count, error: countErr }, { data, error }] = await Promise.all([
    admin.from('user_blocks').select('id', { count: 'exact', head: true }),
    admin
      .from('user_blocks')
      .select(
        `
        id, created_at,
        blocker:profiles!user_blocks_blocker_id_fkey(full_name),
        blocked:profiles!user_blocks_blocked_id_fkey(full_name)
      `
      )
      .order('created_at', { ascending: false })
      .limit(50),
  ]);
  if (countErr) throw new Error(countErr.message);
  if (error) throw new Error(error.message);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((data ?? []) as any[]).map((r): UserBlockRow => ({
    id: r.id,
    created_at: String(r.created_at),
    blocker_name: r.blocker?.full_name ?? '—',
    blocked_name: r.blocked?.full_name ?? '—',
  }));

  return { total: count ?? 0, rows };
}
