'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateChurchContactAction } from '@/services/church.actions';
import type { ChurchContact } from '@/services/church.service';

export function EditChurchContactModal({
  churchId,
  contact,
  onClose,
}: {
  churchId: string;
  contact: ChurchContact | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    contactName: contact?.contact_name ?? '',
    contactEmail: contact?.contact_email ?? '',
    contactPhone: contact?.contact_phone ?? '',
    billingSameAsContact: contact?.billing_same_as_contact ?? true,
    billingName: contact?.billing_name ?? '',
    billingEmail: contact?.billing_email ?? '',
    billingPhone: contact?.billing_phone ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await updateChurchContactAction({ churchId, ...form });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-border-color bg-bg-secondary shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-color p-5">
          <h2 className="text-lg font-bold text-text-primary">Kontak Gereja &amp; Billing</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary">&times;</button>
        </div>
        <form onSubmit={save} className="space-y-3 p-5">
          <h3 className="text-sm font-semibold text-text-primary">Kontak Gereja</h3>
          <Field label="Nama kontak *" value={form.contactName} onChange={set('contactName')} autoFocus required placeholder="min. 2 karakter" />
          <Field label="Email *" type="email" value={form.contactEmail} onChange={set('contactEmail')} required placeholder="nama@gereja.org" />
          <Field label="Telepon *" type="tel" value={form.contactPhone} onChange={set('contactPhone')} required placeholder="0812… atau +62812…" />

          <label className="flex items-center gap-2 pt-1 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={form.billingSameAsContact}
              onChange={(e) => setForm((f) => ({ ...f, billingSameAsContact: e.target.checked }))}
            />
            Kontak billing sama dengan kontak gereja
          </label>

          {!form.billingSameAsContact && (
            <>
              <h3 className="border-t border-border-color pt-3 text-sm font-semibold text-text-primary">Kontak Billing</h3>
              <Field label="Nama kontak *" value={form.billingName} onChange={set('billingName')} required placeholder="min. 2 karakter" />
              <Field label="Email *" type="email" value={form.billingEmail} onChange={set('billingEmail')} required placeholder="billing@gereja.org" />
              <Field label="Telepon *" type="tel" value={form.billingPhone} onChange={set('billingPhone')} required placeholder="0812… atau +62812…" />
            </>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary">
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-brand px-5 py-2 text-sm font-bold text-brand-content hover:bg-brand-hover disabled:opacity-50"
            >
              {saving ? 'Menyimpan…' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-sm text-text-secondary">
      {label}
      <input
        {...props}
        className="mt-1 w-full rounded-lg border border-border-color bg-bg-primary px-3 py-2 text-text-primary outline-none focus:border-brand"
      />
    </label>
  );
}
