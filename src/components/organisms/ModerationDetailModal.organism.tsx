'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/atoms/Badge.atom';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog.molecule';
import { resolvePrayerReportAction } from '@/services/moderation.actions';
import type { ModerationGroup, ResolveReportAction } from '@/types/moderation.types';

const STATUS_LABEL: Record<string, { label: string; variant: 'warning' | 'secondary' | 'success' }> = {
  open: { label: 'Terbuka', variant: 'warning' },
  dismissed: { label: 'Diabaikan', variant: 'secondary' },
  actioned: { label: 'Ditindak', variant: 'success' },
};

export function ModerationDetailModal({
  group,
  onClose,
}: {
  group: ModerationGroup;
  onClose: () => void;
}) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<'remove' | 'mark_actioned' | null>(null);

  const { target } = group;
  const isAmen = target.kind === 'comment' && target.content == null;
  const firstOpen = group.reports.find((r) => r.status === 'open') ?? null;
  const alreadyRemoved = target.deleted_at != null;

  async function resolve(reportId: string, action: ResolveReportAction) {
    setBusyId(reportId);
    setError(null);
    const res = await resolvePrayerReportAction({ reportId, action, note: note || null });
    setBusyId(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setConfirmAction(null);
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border-color bg-bg-secondary shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-color p-5">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-text-primary">
              Laporan {target.kind === 'prayer' ? 'Doa' : 'Komentar'}
            </h2>
            {alreadyRemoved && <Badge variant="secondary">Sudah dihapus</Badge>}
          </div>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary">&times;</button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* Reported content */}
          <div className="rounded-lg border border-border-color bg-bg-primary p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
              <span className="font-medium text-text-primary">{target.author_name ?? '—'}</span>
              {target.anonymous && <Badge variant="outline">Anonim</Badge>}
              {target.church_name && <span>· {target.church_name}</span>}
              {target.created_at && (
                <span>· {new Date(target.created_at).toLocaleString('id-ID')}</span>
              )}
            </div>
            <p
              className={`whitespace-pre-line text-sm ${isAmen ? 'italic text-text-secondary' : 'text-text-primary'} ${alreadyRemoved ? 'line-through opacity-60' : ''}`}
            >
              {isAmen ? '(Amin — dukungan tanpa teks)' : target.content}
            </p>
          </div>

          {/* Parent prayer context for comments */}
          {target.kind === 'comment' && (
            <div className="rounded-lg border border-dashed border-border-color p-4">
              <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wider text-text-secondary">
                Doa induk
                {target.parent_prayer_deleted && <Badge variant="secondary">Sudah dihapus</Badge>}
              </div>
              <p className="line-clamp-3 whitespace-pre-line text-sm text-text-secondary">
                {target.parent_prayer_content ?? '—'}
              </p>
            </div>
          )}

          {/* Reports */}
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-text-secondary">
              {group.reports.length} laporan
            </div>
            <ul className="space-y-2">
              {group.reports.map((r) => (
                <li
                  key={r.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border-color p-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm text-text-primary">{r.reason}</div>
                    <div className="mt-0.5 text-xs text-text-secondary">
                      {r.reporter_name ?? 'Pelapor tidak dikenal'} ·{' '}
                      {new Date(r.created_at).toLocaleString('id-ID')}
                    </div>
                    {r.status !== 'open' && (
                      <div className="mt-0.5 text-xs text-text-secondary">
                        {r.reviewed_by_label ?? 'staf'} ·{' '}
                        {r.reviewed_at ? new Date(r.reviewed_at).toLocaleString('id-ID') : ''}
                        {r.review_note && <> · “{r.review_note}”</>}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={STATUS_LABEL[r.status].variant}>
                      {STATUS_LABEL[r.status].label}
                    </Badge>
                    {r.status === 'open' && (
                      <button
                        onClick={() => resolve(r.id, 'dismiss')}
                        disabled={busyId != null}
                        className="rounded-lg bg-bg-hover px-3 py-1 text-xs text-text-primary hover:bg-bg-tertiary disabled:opacity-50"
                      >
                        {busyId === r.id ? '…' : 'Abaikan'}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}
        </div>

        {/* Resolution footer */}
        {firstOpen && (
          <div className="space-y-3 border-t border-border-color p-5">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Catatan peninjauan (opsional)"
              className="w-full rounded-lg border border-border-color bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-brand"
            />
            <div className="flex flex-wrap justify-end gap-3">
              <button
                onClick={() => setConfirmAction('mark_actioned')}
                disabled={busyId != null}
                className="rounded-lg bg-bg-hover px-4 py-2 text-sm text-text-primary hover:bg-bg-tertiary disabled:opacity-50"
              >
                Tandai Ditindak
              </button>
              <button
                onClick={() => setConfirmAction('remove')}
                disabled={busyId != null}
                className="rounded-lg bg-danger px-4 py-2 text-sm font-bold text-white hover:bg-danger-hover disabled:opacity-50"
              >
                {alreadyRemoved ? 'Selesaikan (sudah dihapus)' : 'Hapus Konten'}
              </button>
            </div>
          </div>
        )}
      </div>

      {confirmAction && firstOpen && (
        <ConfirmDialog
          title={confirmAction === 'remove' ? 'Hapus Konten' : 'Tandai Ditindak'}
          message={
            confirmAction === 'remove' ? (
              target.kind === 'prayer' ? (
                <>
                  Hapus doa ini (beserta komentarnya) dan tutup semua laporan terbuka? Konten
                  disembunyikan dari aplikasi (soft delete) — data tetap tersimpan untuk audit.
                </>
              ) : (
                <>
                  Hapus komentar ini dan tutup semua laporan terbuka? Konten disembunyikan dari
                  aplikasi (soft delete).
                </>
              )
            ) : (
              <>
                Tutup semua laporan terbuka tanpa menghapus konten? Konten tetap tersembunyi dari
                daftar aplikasi selama masih ditandai dilaporkan.
              </>
            )
          }
          confirmLabel={confirmAction === 'remove' ? 'Hapus' : 'Tandai'}
          danger={confirmAction === 'remove'}
          onConfirm={() => resolve(firstOpen.id, confirmAction)}
          onClose={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}
