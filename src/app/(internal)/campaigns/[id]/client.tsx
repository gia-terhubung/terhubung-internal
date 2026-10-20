'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog.molecule';
import { CampaignSettingsForm } from '@/components/organisms/CampaignSettingsForm.organism';
import { ChurchMultiSelect } from '@/components/organisms/ChurchMultiSelect.organism';
import { TestToolsPanel } from '@/components/organisms/TestToolsPanel.organism';
import { DuplicateCampaignModal } from '@/components/organisms/DuplicateCampaignModal.organism';
import { purgeTestCampaignAction, setCampaignStatusAction } from '@/services/campaign.actions';
import { toCampaignInput } from '@/libs/campaign';
import type { CampaignDetail } from '@/types/campaign.types';

type StatusChange = 'published' | 'draft' | 'archived';

const CONFIRM: Record<StatusChange, { title: string; message: string; label: string; danger: boolean }> = {
  published: {
    title: 'Publikasikan campaign?',
    message: 'Campaign akan tampil di aplikasi jemaat gereja peserta saat tanggal mulai tiba.',
    label: 'Publikasikan',
    danger: false,
  },
  draft: {
    title: 'Kembalikan ke draft?',
    message: 'Campaign disembunyikan dari aplikasi sampai dipublikasikan lagi.',
    label: 'Kembalikan ke draft',
    danger: false,
  },
  archived: {
    title: 'Arsipkan campaign?',
    message: 'Campaign disembunyikan dari aplikasi dan pengingat berhenti. Data poin dan pemenang tetap tersimpan.',
    label: 'Arsipkan',
    danger: true,
  },
};

export function CampaignSettingsClient({ detail }: { detail: CampaignDetail }) {
  const router = useRouter();
  const c = detail.campaign;
  const [pending, setPending] = useState<StatusChange | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  const [purging, setPurging] = useState(false);
  const [purgeName, setPurgeName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function changeStatus(next: StatusChange) {
    setError(null);
    try {
      const res = await setCampaignStatusAction(c.id, next);
      if (!res.ok) return setError(res.error);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengubah status.');
    } finally {
      setPending(null);
    }
  }

  async function purge() {
    setError(null);
    try {
      const res = await purgeTestCampaignAction(c.id, purgeName);
      if (!res.ok) {
        setPurging(false);
        return setError(res.error);
      }
      router.push('/campaigns');
    } catch (e) {
      setPurging(false);
      setError(e instanceof Error ? e.message : 'Gagal menghapus campaign.');
    }
  }

  const btn = 'rounded-lg bg-bg-hover px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {c.status === 'draft' && (
          <button onClick={() => setPending('published')} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-bold text-brand-content hover:bg-brand-hover">
            Publikasikan
          </button>
        )}
        {c.status === 'published' && <button onClick={() => setPending('draft')} className={btn}>Kembalikan ke draft</button>}
        {c.status !== 'archived' && <button onClick={() => setPending('archived')} className={btn}>Arsipkan</button>}
        {c.status === 'archived' && <button onClick={() => setPending('draft')} className={btn}>Pulihkan ke draft</button>}
        <button onClick={() => setDuplicating(true)} className={btn}>Duplikat</button>
        {c.is_test && c.status === 'archived' && (
          <button
            onClick={() => { setPurgeName(''); setPurging(true); }}
            className="rounded-lg bg-danger px-3 py-1.5 text-sm font-bold text-white hover:bg-danger-hover"
          >
            Hapus permanen
          </button>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>

      <CampaignSettingsForm
        mode="edit"
        campaignId={c.id}
        initial={toCampaignInput(c)}
        locks={detail.locks}
        assignedWeeks={detail.weekly_weeks}
        dailyDates={detail.daily_dates}
      />

      <ChurchMultiSelect campaignId={c.id} initial={detail.churches} />

      {c.is_test && <TestToolsPanel campaign={c} />}

      {pending && (
        <ConfirmDialog
          title={CONFIRM[pending].title}
          message={CONFIRM[pending].message}
          confirmLabel={CONFIRM[pending].label}
          danger={CONFIRM[pending].danger}
          onConfirm={() => changeStatus(pending)}
          onClose={() => setPending(null)}
        />
      )}
      {purging && (
        <ConfirmDialog
          title="Hapus permanen?"
          message={
            <div className="space-y-3">
              <p>Campaign uji coba ini beserta semua data, pemenang, dan gambarnya dihapus permanen. Tidak bisa dibatalkan.</p>
              <label className="block">
                Ketik nama campaign untuk konfirmasi
                <span className="mt-1 block font-mono text-text-primary">{c.name}</span>
                <input
                  type="text"
                  value={purgeName}
                  onChange={(e) => setPurgeName(e.target.value)}
                  autoComplete="off"
                  className="mt-1 w-full rounded-lg border border-border-color bg-bg-primary px-3 py-2 text-text-primary outline-none focus:border-brand"
                />
              </label>
            </div>
          }
          confirmLabel="Hapus permanen"
          danger
          confirmDisabled={purgeName !== c.name}
          onConfirm={purge}
          onClose={() => setPurging(false)}
        />
      )}
      {duplicating && <DuplicateCampaignModal campaign={c} onClose={() => setDuplicating(false)} />}
    </div>
  );
}
