import { TabNav } from '@/components/molecules/TabNav.molecule';

const TABS = [
  { href: '/billing', label: 'Status', exact: true },
  { href: '/billing/payments', label: 'Pembayaran' },
  { href: '/billing/events', label: 'Event' },
  { href: '/billing/quotes', label: 'Penawaran' },
  { href: '/billing/outbox', label: 'Email' },
  { href: '/billing/plans', label: 'Paket' },
];

export default function BillingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Billing</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Langganan, pembayaran, dan operasional billing semua gereja
        </p>
      </div>
      <TabNav items={TABS} />
      {children}
    </div>
  );
}
