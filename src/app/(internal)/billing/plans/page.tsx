import { listAddonPlans, listPlanRateCard } from '@/services/billing.service';
import { Badge } from '@/components/atoms/Badge.atom';
import type { AddonPlanRow, PlanRateRow } from '@/types/internal.types';

const idr = (n: number | null) =>
  n == null || n === 0 ? 'Gratis' : 'Rp' + new Intl.NumberFormat('id-ID').format(n);
const intervalLabel = (i: string) => (i === 'year' ? 'tahun' : i === 'month' ? 'bulan' : i);
const limit = (n: number | null) => (n == null ? '∞' : String(n));

function PlanTable({
  title,
  plans,
  showSympathizer = false,
}: {
  title: string;
  plans: PlanRateRow[];
  showSympathizer?: boolean;
}) {
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
            {showSympathizer && <th className="px-4 py-2 font-medium">Simpatisan</th>}
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
              {showSympathizer && (
                <td className="px-4 py-3 text-text-secondary">{limit(p.sympathizer_limit)}</td>
              )}
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

function AddonTable({ addons }: { addons: AddonPlanRow[] }) {
  if (addons.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-border-color">
      <div className="bg-bg-secondary px-4 py-3 font-semibold text-text-primary">Add-on</div>
      <table className="w-full text-sm">
        <thead className="border-t border-border-color bg-bg-secondary text-left text-text-secondary">
          <tr>
            <th className="px-4 py-2 font-medium">Kode</th>
            <th className="px-4 py-2 font-medium">Interval</th>
            <th className="px-4 py-2 font-medium">Harga</th>
            <th className="px-4 py-2 font-medium">Bonus anggota</th>
            <th className="px-4 py-2 font-medium">Bonus simpatisan</th>
          </tr>
        </thead>
        <tbody>
          {addons.map((a) => (
            <tr key={a.id} className="border-t border-border-color">
              <td className="px-4 py-3 font-medium text-text-primary">{a.code}</td>
              <td className="px-4 py-3 text-text-secondary">{intervalLabel(a.interval)}</td>
              <td className="px-4 py-3 text-text-primary">
                {idr(a.price_idr)}
                <span className="text-xs text-text-secondary"> / {intervalLabel(a.interval)}</span>
              </td>
              <td className="px-4 py-3 text-text-secondary">+{a.member_bonus}</td>
              <td className="px-4 py-3 text-text-secondary">+{a.sympathizer_bonus}</td>
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
  const [plans, addons] = await Promise.all([listPlanRateCard(), listAddonPlans()]);

  return (
    <div className="space-y-6">
      <p className="text-xs text-text-secondary">
        Paket aktif (baca saja). Perubahan harga/paket dilakukan lewat SQL — paket diversikan
        dengan effective_until.
      </p>
      <PlanTable title="Gereja" plans={plans.filter((p) => p.scope === 'church')} showSympathizer />
      <PlanTable title="Pengguna" plans={plans.filter((p) => p.scope === 'user')} />
      <p className="text-xs text-text-secondary">
        Add-on kapasitas aktif (baca saja). Perubahan harga add-on dilakukan lewat SQL — add-on
        diversikan dengan effective_until.
      </p>
      <AddonTable addons={addons} />
    </div>
  );
}
