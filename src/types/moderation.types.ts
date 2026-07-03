// Trust & safety console types (prayer_reports triage + user_blocks).

export type ReportStatus = 'open' | 'dismissed' | 'actioned';
export type ReportTargetKind = 'prayer' | 'comment';
export type ResolveReportAction = 'dismiss' | 'remove' | 'mark_actioned';

export interface PrayerReportRow {
  id: string;
  reason: string;
  status: ReportStatus;
  created_at: string;
  reporter_name: string | null;
  reviewed_by: string | null;
  reviewed_by_label: string | null; // staff email
  reviewed_at: string | null;
  review_note: string | null;
}

export interface ModerationTarget {
  kind: ReportTargetKind;
  id: string;
  content: string | null; // comment content NULL = "Amen"
  deleted_at: string | null;
  author_id: string | null;
  author_name: string | null;
  anonymous: boolean; // staff still sees the real author; badge "Anonim"
  church_id: string | null;
  church_name: string | null;
  created_at: string | null;
  // Comments only: parent prayer context.
  parent_prayer_id: string | null;
  parent_prayer_content: string | null;
  parent_prayer_deleted: boolean;
}

// One row per reported target, grouping all its reports.
export interface ModerationGroup {
  key: string; // `prayer:<id>` | `comment:<id>`
  target: ModerationTarget;
  reports: PrayerReportRow[];
  open_count: number;
  latest_report_at: string;
}

export interface UserBlockRow {
  id: string;
  created_at: string;
  blocker_name: string;
  blocked_name: string;
}
