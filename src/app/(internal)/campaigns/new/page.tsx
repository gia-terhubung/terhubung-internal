import Link from 'next/link';
import { CampaignSettingsForm } from '@/components/organisms/CampaignSettingsForm.organism';
import { getNewCampaignDefaults } from '@/services/campaign.service';

export default async function NewCampaignPage() {
  const initial = await getNewCampaignDefaults();
  return (
    <div className="space-y-6">
      <div>
        <Link href="/campaigns" className="text-sm text-text-secondary hover:text-text-primary">← Semua campaign</Link>
        <h1 className="mt-2 text-2xl font-bold text-text-primary">Buat campaign</h1>
        <p className="mt-1 text-sm text-text-secondary">Disimpan sebagai draft. Gereja, hadiah, dan jadwal soal diatur setelah ini.</p>
      </div>
      <CampaignSettingsForm
        mode="create"
        initial={initial}
        locks={{ start: false, close: false, draw: false, isTest: false, topN: false, drawMode: false, grandWeight: false }}
        assignedWeeks={[]}
        dailyDates={[]}
      />
    </div>
  );
}
