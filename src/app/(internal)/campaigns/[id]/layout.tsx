import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/atoms/Badge.atom';
import { TabNav } from '@/components/molecules/TabNav.molecule';
import { getCampaignDetail } from '@/services/campaign.service';
import { STATUS_VARIANT, drawModeOf, formatWib } from '@/libs/campaign';

export default async function CampaignLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getCampaignDetail(id);
  if (!detail) notFound();
  const c = detail.campaign;
  const base = `/campaigns/${id}`;
  const announce = drawModeOf(c.rules) === 'announce';

  return (
    <div className="space-y-6">
      <div>
        <Link href="/campaigns" className="text-sm text-text-secondary hover:text-text-primary">← Semua campaign</Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-text-primary">{c.name}</h1>
          <Badge variant={STATUS_VARIANT[detail.status]}>{detail.status_label}</Badge>
          {c.is_test && <Badge variant="warning">Uji coba</Badge>}
        </div>
        <p className="mt-1 text-sm text-text-secondary">
          {formatWib(c.start_at)} – {announce ? 'pengumuman' : 'undian'} {formatWib(c.draw_at)}
          {c.is_test && c.sim_now ? ` · waktu simulasi ${formatWib(c.sim_now)}` : ''}
        </p>
      </div>
      <TabNav
        items={[
          { href: base, label: 'Pengaturan', exact: true },
          { href: `${base}/prizes`, label: 'Hadiah' },
          { href: `${base}/schedule`, label: 'Jadwal soal' },
          { href: `${base}/monitor`, label: 'Monitor' },
          { href: `${base}/winners`, label: 'Pemenang' },
          { href: `${base}/draw`, label: announce ? 'Undian' : 'Undian live' },
        ]}
      />
      {children}
    </div>
  );
}
