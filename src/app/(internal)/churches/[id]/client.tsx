'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AssignChurchAdminModal } from '@/components/organisms/AssignChurchAdminModal.organism';
import { EditChurchContactModal } from '@/components/organisms/EditChurchContactModal.organism';
import { EditChurchLocationModal } from '@/components/organisms/EditChurchLocationModal.organism';
import { ChangeSubscriptionModal } from '@/components/organisms/ChangeSubscriptionModal.organism';
import { Avatar } from '@/components/atoms/Avatar.atom';
import { Badge } from '@/components/atoms/Badge.atom';
import type { ChurchAdminRow, ChurchContact, ChurchDetail } from '@/services/church.service';
import type {
  BillingStatus,
  ChurchBillingHistory,
  ChurchSubscriptionInfo,
  ChurchPlanOption,
} from '@/types/internal.types';

const idr = (n: number | null) =>
  n == null ? '—' : 'Rp' + new Intl.NumberFormat('id-ID').format(n);
const intervalLabel = (i: string) => (i === 'year' ? 'tahun' : i === 'month' ? 'bulan' : i);

const STATUS: Record<BillingStatus, { label: string; variant: 'success' | 'warning' | 'danger' | 'secondary' }> = {
  active: { label: 'Aktif', variant: 'success' },
  grace: { label: 'Masa tenggang', variant: 'warning' },
  expired: { label: 'Kedaluwarsa', variant: 'danger' },
  none: { label: 'Tanpa langganan', variant: 'secondary' },
};

function periodLabel(value: string) {
  if (!value) return '—';
  if (value.startsWith('infinity')) return 'Selamanya';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('id-ID');
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-text-secondary">{label}</div>
      <div className="mt-0.5 text-sm text-text-primary">{value || '—'}</div>
    </div>
  );
}

export function ChurchDetailClient({
  church,
  admins,
  subscription,
  billing,
  contact,
  plans,
}: {
  church: ChurchDetail;
  admins: ChurchAdminRow[];
  subscription: ChurchSubscriptionInfo | null;
  billing: ChurchBillingHistory;
  contact: ChurchContact | null;
  plans: ChurchPlanOption[];
}) {
  const [showAssign, setShowAssign] = useState(false);
  const [showEditContact, setShowEditContact] = useState(false);
  const [showEditLocation, setShowEditLocation] = useState(false);
  const [showChangeSub, setShowChangeSub] = useState(false);

  const features = subscription
    ? Object.entries(subscription.features)
        .filter(([, v]) => v === true || (typeof v === 'number' && v > 0))
        .map(([k]) => k)
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link href="/churches" className="text-sm text-text-secondary hover:text-text-primary">
          ← Gereja
        </Link>
        <div className="mt-2 flex items-center gap-4">
          <Avatar src={church.church_avatar_url} initials={church.name} size="lg" />
          <div>
            <h1 className="text-2xl font-bold text-text-primary">{church.name}</h1>
            <div className="mt-1 text-sm text-text-secondary">
              {[church.synod, church.city].filter(Boolean).join(' · ') || '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Info / bio */}
      <div className="rounded-xl border border-border-color bg-bg-secondary p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-text-primary">Informasi Gereja</h2>
          <button
            onClick={() => setShowEditLocation(true)}
            className="rounded-lg bg-bg-hover px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary"
          >
            Ubah Lokasi
          </button>
        </div>
        {church.description && (
          <p className="mb-4 whitespace-pre-line text-sm text-text-secondary">{church.description}</p>
        )}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Sinode" value={church.synod} />
          <Field label="Provinsi" value={church.province} />
          <Field label="Kota" value={church.city} />
          <Field label="Kecamatan" value={church.district} />
          <Field label="Kelurahan" value={church.sub_district} />
          <Field label="Alamat" value={church.address} />
          <Field label="Zona Waktu" value={church.timezone} />
          <Field label="Dibuat" value={new Date(church.created_at).toLocaleDateString('id-ID')} />
        </div>
      </div>

      {/* Church + billing contact */}
      <div className="rounded-xl border border-border-color bg-bg-secondary p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-text-primary">Kontak Gereja & Billing</h2>
            {!contact && <Badge variant="warning">Belum ada kontak</Badge>}
            {contact?.contact_source === 'auto' && <Badge variant="secondary">Otomatis · verifikasi</Badge>}
          </div>
          <button
            onClick={() => setShowEditContact(true)}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-brand-content hover:bg-brand-hover"
          >
            {contact ? 'Ubah' : '+ Tambah Kontak'}
          </button>
        </div>
        {contact ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Nama Kontak" value={contact.contact_name} />
            <Field label="Email" value={contact.contact_email} />
            <Field label="Telepon" value={contact.contact_phone} />
            {contact.billing_same_as_contact ? (
              <Field label="Kontak Billing" value="Sama dengan kontak gereja" />
            ) : (
              <>
                <Field label="Billing — Nama" value={contact.billing_name} />
                <Field label="Billing — Email" value={contact.billing_email} />
                <Field label="Billing — Telepon" value={contact.billing_phone} />
              </>
            )}
          </div>
        ) : (
          <p className="text-sm text-text-secondary">
            Belum ada kontak gereja. Tambahkan agar email billing terkirim ke kontak yang tepat.
          </p>
        )}
      </div>

      {/* Current subscription */}
      <div className="rounded-xl border border-border-color bg-bg-secondary p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-text-primary">Langganan Saat Ini</h2>
          <div className="flex items-center gap-3">
            <Badge variant={STATUS[subscription?.status ?? 'none'].variant}>
              {STATUS[subscription?.status ?? 'none'].label}
            </Badge>
            {subscription && plans.length > 0 && (
              <button
                onClick={() => setShowChangeSub(true)}
                className="rounded-lg bg-bg-hover px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary"
              >
                Ubah Paket
              </button>
            )}
          </div>
        </div>
        {subscription ? (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field label="Tier" value={<span className="capitalize">{subscription.tier}</span>} />
              <Field
                label="Harga"
                value={
                  subscription.price_idr
                    ? `${idr(subscription.price_idr)} / ${intervalLabel(subscription.interval)}`
                    : 'Gratis'
                }
              />
              <Field label="Berakhir" value={periodLabel(subscription.current_period_end)} />
              <Field label="Masa tenggang" value={`${subscription.grace_days} hari`} />
              <Field label="Provider" value={subscription.provider ?? '—'} />
              <Field
                label="Mulai"
                value={
                  subscription.started_at
                    ? new Date(subscription.started_at).toLocaleDateString('id-ID')
                    : '—'
                }
              />
              <Field
                label="Batal akhir periode"
                value={subscription.cancel_at_period_end ? 'Ya' : 'Tidak'}
              />
              <Field label="Limit anggota" value={subscription.member_limit ?? 'Tak terbatas'} />
            </div>
            {features.length > 0 && (
              <div className="mt-4">
                <div className="text-xs uppercase tracking-wider text-text-secondary">Fitur</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {features.map((f) => (
                    <Badge key={f} variant="outline">
                      {f}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-text-secondary">
            Belum ada baris langganan. Pastikan paket gratis tersedia di prod.
          </p>
        )}
      </div>

      {/* Admins */}
      <div className="rounded-xl border border-border-color bg-bg-secondary">
        <div className="flex items-center justify-between border-b border-border-color p-4">
          <h2 className="font-semibold text-text-primary">Admin Gereja</h2>
          <button
            onClick={() => setShowAssign(true)}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-brand-content hover:bg-brand-hover"
          >
            + Tetapkan Admin
          </button>
        </div>
        {admins.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-text-secondary">Belum ada admin gereja.</div>
        ) : (
          admins.map((a) => (
            <div key={a.user_id} className="flex items-center gap-3 border-b border-border-color p-4 last:border-b-0">
              <Avatar src={a.avatar_url} initials={a.full_name} size="sm" />
              <span className="text-sm font-medium text-text-primary">{a.full_name}</span>
            </div>
          ))
        )}
      </div>

      {/* Billing history */}
      <div className="rounded-xl border border-border-color bg-bg-secondary">
        <div className="border-b border-border-color p-4">
          <h2 className="font-semibold text-text-primary">Riwayat Billing</h2>
        </div>
        <div className="grid grid-cols-1 gap-6 p-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-text-secondary">
              Event Langganan
            </h3>
            {billing.events.length === 0 ? (
              <p className="text-sm text-text-secondary">Belum ada event.</p>
            ) : (
              <ul className="space-y-2">
                {billing.events.map((e) => (
                  <li key={e.id} className="border-b border-border-color pb-2 text-sm last:border-b-0">
                    <span className="text-text-primary">{e.event_type}</span>
                    {(e.from_tier || e.to_tier) && (
                      <span className="text-text-secondary">
                        {' '}· {e.from_tier ?? '—'} → {e.to_tier ?? '—'}
                      </span>
                    )}
                    <span className="block text-xs text-text-secondary">
                      {new Date(e.event_occurred_at).toLocaleString('id-ID')}
                      {e.amount_idr != null && ` · ${idr(e.amount_idr)}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-text-secondary">
              Pembayaran
            </h3>
            {billing.payments.length === 0 ? (
              <p className="text-sm text-text-secondary">Belum ada pembayaran.</p>
            ) : (
              <ul className="space-y-2">
                {billing.payments.map((p) => (
                  <li key={p.id} className="border-b border-border-color pb-2 text-sm last:border-b-0">
                    <span className="text-text-primary">{idr(p.amount_idr)}</span>
                    <span className="text-text-secondary"> · {p.status}</span>
                    <span className="block text-xs text-text-secondary">
                      {new Date(p.created_at).toLocaleString('id-ID')} · {p.provider}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {showAssign && <AssignChurchAdminModal churchId={church.id} onClose={() => setShowAssign(false)} />}
      {showChangeSub && subscription && (
        <ChangeSubscriptionModal
          churchId={church.id}
          currentTier={subscription.tier}
          currentInterval={subscription.interval}
          plans={plans}
          onClose={() => setShowChangeSub(false)}
        />
      )}
      {showEditContact && (
        <EditChurchContactModal churchId={church.id} contact={contact} onClose={() => setShowEditContact(false)} />
      )}
      {showEditLocation && (
        <EditChurchLocationModal
          churchId={church.id}
          initial={{
            province: church.province ?? '',
            province_id: church.province_id ?? '',
            city: church.city ?? '',
            city_id: church.city_id ?? '',
            district: church.district ?? '',
            district_id: church.district_id ?? '',
            sub_district: church.sub_district ?? '',
            sub_district_id: church.sub_district_id ?? '',
            address: church.address ?? '',
          }}
          onClose={() => setShowEditLocation(false)}
        />
      )}
    </div>
  );
}
