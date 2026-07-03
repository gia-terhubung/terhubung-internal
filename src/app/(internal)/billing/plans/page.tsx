import { listPlanRateCard } from '@/services/billing.service';
import { Badge } from '@/components/atoms/Badge.atom';
import type { PlanRateRow } from '@/types/internal.types';

const idr = (n: number | null) =>
  n == null || n === 0 ? 'Gratis' : 'Rp' + new Intl.NumberFormat('id-ID').format(n);
const intervalLabel = (i: string) => (i === 'year' ? 'tahun' : i === 'month' ? 'bulan' : i);
const limit = (n: number | null) => (n == null ? '∞' : String(n));

function PlanTable({ title, plans }: { title: string; plans: PlanRateRow[] }) {
  if (plans.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-border-color">
      <div className="bg-bg-secondary px-4 py-3 font-semibold text-text-primary">{title}</div>
      <table className="w-full text-sm">
        <thead className="border-t border-border-color bg-bg-secondary text-left text-text-secondary">
          <tr>
            <th className="px-4 py-2 font-medium">Tier</th>
            <th className="px-4 py-2 font-medium">Harga</th>
            <th className="px-4 py-2 font-medium">Anggota</th>
            <th className="px-4 py-2 font-medium">Admin</th>
            <th className="px-4 py-2 font-medium">Staf</th>
            <th className="px-4 py-2 font-medium">Fitur</th>
          </tr>
        </thead>
        <tbody>
          {plans.map((p) => (
            <tr key={p.id} className="border-t border-border-color align-top">
              <td className="px-4 py-3 font-medium capitalize text-text-primary">{p.tier}</td>
              <td className="px-4 py-3 text-text-primary">
                {idr(p.price_idr)}
                {p.price_idr != null && p.price_idr > 0 && (
                  <span className="text-xs text-text-secondary"> / {intervalLabel(p.interval)}</span>
                )}
              </td>
              <td className="px-4 py-3 text-text-secondary">{limit(p.member_limit)}</td>
              <td className="px-4 py-3 text-text-secondary">{limit(p.admin_limit)}</td>
              <td className="px-4 py-3 text-text-secondary">{limit(p.staff_limit)}</td>
              <td className="px-4 py-3">
                <div className="flex max-w-md flex-wrap gap-1">
                  {Object.entries(p.features)
                    .filter(([, v]) => v === true || (typeof v === 'number' && v > 0))
                    .map(([k]) => (
                      <Badge key={k} variant="outline">{k}</Badge>
                    ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Read-only rate card. Plan editing is deliberately deferred — new plan rows /
// price changes go through SQL (plans are versioned via effective_until).
export default async function BillingPlansPage() {
  const plans = await listPlanRateCard();

  return (
    <div className="space-y-6">
      <p className="text-xs text-text-secondary">
        Paket aktif (baca saja). Perubahan harga/paket dilakukan lewat SQL — paket diversikan
        dengan effective_until.
      </p>
      <PlanTable title="Gereja" plans={plans.filter((p) => p.scope === 'church')} />
      <PlanTable title="Pengguna" plans={plans.filter((p) => p.scope === 'user')} />
    </div>
  );
}
