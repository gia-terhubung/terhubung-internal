'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/atoms/Badge.atom';
import { StatTile } from '@/components/molecules/StatTile.molecule';
import { MonthlyBarChart } from '@/components/molecules/MonthlyBarChart.molecule';
import { TierDistributionBar } from '@/components/molecules/TierDistributionBar.molecule';
import { refreshAnalyticsAction } from '@/services/analytics.actions';
import type { PlatformAnalytics, PlatformMonthlyRow } from '@/types/analytics.types';
import type { BillingStatus } from '@/types/internal.types';

const num = (n: number) => new Intl.NumberFormat('id-ID').format(n);
const idr = (n: number) => 'Rp' + new Intl.NumberFormat('id-ID').format(n);
const idrCompact = (n: number) =>
  'Rp' + new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

const STATUS: Record<BillingStatus, { label: string; variant: 'success' | 'warning' | 'danger' | 'secondary' }> = {
  active: { label: 'Aktif', variant: 'success' },
  grace: { label: 'Masa tenggang', variant: 'warning' },
  expired: { label: 'Kedaluwarsa', variant: 'danger' },
  none: { label: 'Tanpa langganan', variant: 'secondary' },
};

const ACTIVITY: { key: keyof Pick<PlatformMonthlyRow, 'checkins' | 'prayers' | 'posts' | 'visitations'>; label: string }[] = [
  { key: 'checkins', label: 'Check-in' },
  { key: 'prayers', label: 'Doa' },
  { key: 'posts', label: 'Kabar & Renungan' },
  { key: 'visitations', label: 'Kunjungan' },
];

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border-color bg-bg-secondary p-5">
      <div className="mb-3 text-xs uppercase tracking-wider text-text-secondary">{title}</div>
      {children}
    </div>
  );
}

export function DashboardClient({ data, email }: { data: PlatformAnalytics; email: string }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();

  const generatedAt = new Date(data.generated_at);
  const dormantTop = data.dormant_churches.slice(0, 10);
  const dormantMore = data.dormant_churches.length - dormantTop.length;
  const points = (key: (typeof ACTIVITY)[number]['key'] | 'new_churches' | 'revenue_idr') =>
    data.monthly.map((m) => ({ month: m.month, value: m[key] }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
          <p className="mt-1 text-sm text-text-secondary">Masuk sebagai {email}</p>
        </div>
        <div className="flex items-center gap-3 text-sm text-text-secondary">
          <span>
            Data per{' '}
            {generatedAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <button
            onClick={() =>
              startRefresh(async () => {
                await refreshAnalyticsAction();
                router.refresh();
              })
            }
            disabled={refreshing}
            className="rounded-lg bg-bg-hover px-3 py-1.5 text-text-primary hover:bg-bg-tertiary disabled:opacity-50"
          >
            {refreshing ? 'Memuat…' : 'Perbarui'}
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Total Gereja"
          value={num(data.totals.churches)}
          sub={`+${num(data.new_this_month.churches)} bulan ini`}
        />
        <StatTile
          label="Pengguna Terdaftar"
          value={num(data.totals.profiles)}
          sub={`+${num(data.new_this_month.profiles)} bulan ini`}
        />
        <StatTile
          label="Jemaat"
          value={num(data.totals.members)}
          sub={`${num(data.totals.sympathizers)} simpatisan · ${num(data.totals.families)} keluarga`}
        />
        <StatTile
          label="Perangkat Aktif"
          value={num(data.totals.push_devices)}
          sub={`${num(data.totals.people)} orang di registri`}
        />
      </div>

      {/* Billing */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Langganan">
          <TierDistributionBar tiers={data.billing.by_tier} />
          <div className="mt-4 flex flex-wrap gap-2">
            {(Object.keys(STATUS) as BillingStatus[]).map((s) =>
              data.billing.by_status[s] > 0 ? (
                <Badge key={s} variant={STATUS[s].variant}>
                  {STATUS[s].label}: {num(data.billing.by_status[s])}
                </Badge>
              ) : null
            )}
          </div>
        </Card>
        <Card title="Pendapatan">
          <div className="mb-3 text-2xl font-bold text-text-primary">
            {idr(data.billing.revenue_30d_idr)}
            <span className="ml-1 text-xs font-normal text-text-secondary">30 hari terakhir</span>
          </div>
          <MonthlyBarChart points={points('revenue_idr')} formatValue={idrCompact} height={48} />
        </Card>
        <Card title="Gereja Baru">
          <div className="mb-3 text-2xl font-bold text-text-primary">
            {num(data.monthly.reduce((s, m) => s + m.new_churches, 0))}
            <span className="ml-1 text-xs font-normal text-text-secondary">12 bulan terakhir</span>
          </div>
          <MonthlyBarChart points={points('new_churches')} height={48} />
        </Card>
      </div>

      {/* Activity small multiples */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {ACTIVITY.map((a) => (
          <Card key={a.key} title={a.label}>
            <div className="mb-3 text-xl font-bold text-text-primary">
              {num(data.monthly.reduce((s, m) => s + m[a.key], 0))}
              <span className="ml-1 text-xs font-normal text-text-secondary">/ 12 bulan</span>
            </div>
            <MonthlyBarChart points={points(a.key)} height={40} />
          </Card>
        ))}
      </div>

      {/* Dormant churches */}
      <div className="overflow-hidden rounded-xl border border-border-color">
        <div className="flex items-center justify-between bg-bg-secondary px-4 py-3">
          <h2 className="font-semibold text-text-primary">Gereja Tidak Aktif</h2>
          <span className="text-xs text-text-secondary">
            Tanpa check-in, kabar, atau doa dalam 60 hari
          </span>
        </div>
        {dormantTop.length === 0 ? (
          <div className="border-t border-border-color px-4 py-8 text-center text-sm text-text-secondary">
            Semua gereja aktif.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-t border-border-color bg-bg-secondary text-left text-text-secondary">
              <tr>
                <th className="px-4 py-2 font-medium">Gereja</th>
                <th className="px-4 py-2 font-medium">Tier</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Aktivitas Terakhir</th>
              </tr>
            </thead>
            <tbody>
              {dormantTop.map((c) => (
                <tr key={c.church_id} className="border-t border-border-color">
                  <td className="px-4 py-3">
                    <Link
                      href={`/churches/${c.church_id}`}
                      className="font-medium text-text-primary hover:text-brand"
                    >
                      {c.name}
                    </Link>
                    {c.city && <div className="text-xs text-text-secondary">{c.city}</div>}
                  </td>
                  <td className="px-4 py-3 capitalize text-text-secondary">{c.tier}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS[c.status].variant}>{STATUS[c.status].label}</Badge>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {c.last_activity_at
                      ? new Date(c.last_activity_at).toLocaleDateString('id-ID')
                      : '> 12 bulan'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {dormantMore > 0 && (
          <div className="border-t border-border-color bg-bg-secondary px-4 py-2 text-xs text-text-secondary">
            +{num(dormantMore)} gereja lainnya
          </div>
        )}
      </div>
    </div>
  );
}
