import { TabNav } from '@/components/molecules/TabNav.molecule';

const TABS = [
  { href: '/moderation', label: 'Laporan', exact: true },
  { href: '/moderation/blocks', label: 'Blokir Pengguna' },
];

export default function ModerationLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Moderasi</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Tinjau laporan konten doa & komentar dari pengguna
        </p>
      </div>
      <TabNav items={TABS} />
      {children}
    </div>
  );
}
